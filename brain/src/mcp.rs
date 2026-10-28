//! Read-only MCP transport. Scope is fixed by PVTA before the model starts.
use crate::{scope::{self, Scope}, search, store, view, Result};
use serde_json::{json, Value};
use std::{io::{self, BufRead, Read, Write}, path::Path};

struct Source { id: String, scope: Scope, index: Option<String> }

fn tools(sources: &[Source]) -> Value {
    let string = json!({"type":"string","minLength":1,"maxLength":1000});
    let definitions = [
        ("brain_overview", "Project overview: languages, modules, entry points, central files. Read-only index, not a call graph.", json!({}), vec![]),
        ("brain_outline", "File symbols with actual line ranges, imports and importing files.", json!({"file":string}), vec!["file"]),
        ("brain_find", "Search code symbols and text; use query filters in:, kind:, lang:. Prefer before reading whole files.", json!({"query":string,"limit":{"type":"integer","minimum":1,"maximum":50}}), vec!["query"]),
        ("brain_refs", "Lexical reference candidates, not verified callers. Read source before claiming call relationships.", json!({"name":string}), vec!["name"]),
        ("brain_read", "Read a symbol or start/end lines (at most 500) in an authorized file; includes SHA-256.", json!({"file":string,"symbol":string,"start":{"type":"integer","minimum":1},"end":{"type":"integer","minimum":1}}), vec!["file"]),
    ];
    json!({"tools":definitions.into_iter().map(|(name,description,mut properties,mut required)|{
        if sources.len()>1 {
            properties["scope"]=json!({"type":"string","enum":sources.iter().map(|s| &s.id).collect::<Vec<_>>(),"description":"Source within this project. Required for file reads/outlines; omit for search across all project sources."});
            if name=="brain_read" || name=="brain_outline" { required.push("scope"); }
        }
        json!({
        "name":name,"description":description,
        "inputSchema":{"type":"object","properties":properties,"required":required,"additionalProperties":false},
        "annotations":{"readOnlyHint":true,"destructiveHint":false,"openWorldHint":false}
    })}).collect::<Vec<_>>()})
}

fn source_from_value(config: &Value) -> Result<Source> {
    let root = Path::new(config["root"].as_str().ok_or("Missing scope root")?).canonicalize()?;
    if !root.is_dir() { return Err("Scope root must be a directory".into()); }
    let only = match config.get("files") {
        None => None,
        Some(value) => {
            let files = value.as_array().ok_or("files must be an array")?;
            if files.is_empty() || files.len() > 200 { return Err("Expected 1..200 authorized files".into()); }
            Some(files.iter().map(|f| scope::normalize(f.as_str().ok_or("Invalid file")?)).collect::<Result<Vec<_>>>()?)
        }
    };
    Ok(Source {id:config["id"].as_str().unwrap_or("default").to_string(),scope:Scope {root, only},index:config["indexPath"].as_str().map(String::from)})
}

fn sources_from_file(file: &str) -> Result<Vec<Source>> {
    let config: Value = serde_json::from_str(&crate::read(Path::new(file))?)?;
    if let Some(sources)=config.get("sources") {
        let list=sources.as_array().ok_or("Invalid project sources")?;
        if list.is_empty() || list.len()>256 { return Err("Expected 1..256 project sources".into()); }
        let sources=list.iter().map(source_from_value).collect::<Result<Vec<_>>>()?;
        let mut ids=std::collections::HashSet::new();
        if sources.iter().any(|s| !ids.insert(&s.id)) { return Err("Duplicate source ID".into()); }
        Ok(sources)
    } else { Ok(vec![source_from_value(&config)?]) }
}

fn argument<'a>(args: &'a Value, name: &str) -> Result<&'a str> {
    args[name].as_str().filter(|s| !s.is_empty() && s.len() <= 1000).ok_or_else(|| format!("Invalid argument: {name}").into())
}

fn call(scope: &Scope, name: &str, args: &Value) -> Result<Value> {
    // Only these five read operations are exposed; no patch, shell, or scope mutation.
    match name {
        "brain_read" => {
            let file = argument(args, "file")?;
            if let Some(symbol) = args.get("symbol") {
                return crate::read_cmd(scope, file, symbol.as_str().filter(|s| !s.is_empty()).ok_or("Invalid symbol")?, None);
            }
            let start = args["start"].as_u64().filter(|n| *n > 0).ok_or("Expected start line")?.to_string();
            let end = args["end"].as_u64().filter(|n| *n > 0).ok_or("Expected end line")?.to_string();
            crate::read_cmd(scope, file, &start, Some(&end))
        }
        "brain_overview" => {
            let (ix, stats) = store::update(scope, false)?;
            Ok(view::overview(&ix, scope, &stats))
        }
        "brain_outline" => {
            let rel = scope::target(scope, argument(args, "file")?)?.0;
            let (ix, _) = store::update(scope, false)?;
            view::outline(&ix, scope, &rel).ok_or_else(|| "File not indexed; use brain_read".into())
        }
        "brain_find" => {
            let query = argument(args, "query")?;
            let limit = match args.get("limit") {
                None => 20,
                Some(v) => v.as_u64().filter(|n| (1..=50).contains(n)).ok_or("limit must be 1..50")? as usize,
            };
            let (ix, _) = store::update(scope, false)?;
            Ok(search::find(&ix, scope, query, limit))
        }
        "brain_refs" => {
            let name = argument(args, "name")?;
            if name.len() > 200 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'$') { return Err("Expected identifier".into()); }
            let (ix, _) = store::update(scope, false)?;
            Ok(json!({"kind":"lexical-candidates","result":search::refs(&ix, scope, name)}))
        }
        _ => Err("Unknown or non-read-only Brain tool".into()),
    }
}

fn call_sources(sources: &[Source], name: &str, args: &Value) -> Result<Value> {
    let selected=if let Some(id)=args.get("scope") {
        vec![sources.iter().find(|s| Some(s.id.as_str())==id.as_str()).ok_or("Source is outside this project's Brain")?]
    } else {
        if sources.len()>1 && (name=="brain_read" || name=="brain_outline") {return Err("Choose scope from brain_overview".into());}
        sources.iter().collect::<Vec<_>>()
    };
    let mut results=Vec::new();
    for source in selected {
        // One process serves one project, sequentially. Cache selection never comes from tool arguments.
        if let Some(index)=&source.index {std::env::set_var("PVTA_BRAIN_INDEX",index);} else {std::env::remove_var("PVTA_BRAIN_INDEX");}
        let value=call(&source.scope,name,args)?;
        if sources.len()==1 {return Ok(value);}
        results.push(json!({"scope":source.id,"root":source.scope.root,"result":value}));
    }
    Ok(json!({"sources":results}))
}

fn response(sources: &[Source], request: Value) -> Option<Value> {
    let id = request.get("id")?.clone(); // Notifications have no response.
    let params = &request["params"];
    let result = match request["method"].as_str() {
        Some("initialize") => {
            let requested = params["protocolVersion"].as_str().unwrap_or("");
            let version = if ["2024-11-05","2025-03-26","2025-06-18"].contains(&requested) {requested} else {"2025-06-18"};
            json!({"protocolVersion":version,"capabilities":{"tools":{}},
                "serverInfo":{"name":"pvta-brain","version":env!("CARGO_PKG_VERSION")},
                "instructions":"Use brain_find, brain_outline and brain_read before manual code scans. Brain is scoped to this project only, not a semantic call graph. brain_overview lists source scopes; include scope when reading a file. brain_refs returns lexical candidates."})
        }
        Some("ping") => json!({}),
        Some("tools/list") => tools(sources),
        Some("tools/call") => match call_sources(sources, params["name"].as_str().unwrap_or(""), &params["arguments"]) {
            Ok(value) => json!({"content":[{"type":"text","text":value.to_string()}],"isError":false}),
            Err(error) => json!({"content":[{"type":"text","text":error.to_string()}],"isError":true}),
        },
        _ => return Some(json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Method not found"}})),
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

pub fn serve(file: &str) -> Result<()> {
    let sources = sources_from_file(file)?;
    // The descriptor is the only source of scope; never inherit another session's cache/scope.
    std::env::remove_var("PVTA_BRAIN_ONLY");
    std::env::remove_var("PVTA_BRAIN_INDEX");
    let mut input = io::stdin().lock();
    let mut output = io::stdout().lock();
    loop {
        let mut line = String::new();
        if input.by_ref().take(1024 * 1024 + 1).read_line(&mut line)? == 0 { break; }
        if line.len() > 1024 * 1024 { return Err("MCP request too large".into()); }
        let reply = match serde_json::from_str(&line) {
            Ok(request) => response(&sources, request),
            Err(_) => Some(json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Invalid JSON"}})),
        };
        if let Some(reply) = reply { writeln!(output, "{reply}")?; output.flush()?; }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_is_read_only_and_notifications_are_silent() {
        let scope = Scope {root: std::env::temp_dir(), only: Some(vec!["allowed.ts".into()])};
        assert!(response(&[],json!({"method":"notifications/initialized"})).is_none());
        assert_eq!(tools(&[])["tools"].as_array().unwrap().len(),5);
        assert!(call(&scope,"patch",&json!({})).is_err());
        assert!(call(&scope,"brain_read",&json!({"file":"secret.ts","start":1,"end":1})).is_err());
        assert!(call(&scope,"brain_read",&json!({"file":"../secret.ts","start":1,"end":1})).is_err());
    }
}
