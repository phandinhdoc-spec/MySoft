"""Regression: a JSON corpus must not hide UI symbols in Brain's source index."""
import json,pathlib,subprocess,tempfile,os
binary=str(pathlib.Path('brain/target/release/pvta-brain').resolve())
with tempfile.TemporaryDirectory() as d:
 root=pathlib.Path(d)
 (root/'candidates.json').write_text(json.dumps({f'candidate{i}':i for i in range(500)}))
 (root/'WorkflowGraph.tsx').write_text('export function WorkflowGraph() { return <div className="workflow"/>; }\n')
 subprocess.run([binary,'index'],cwd=root,check=True,capture_output=True)
 rows=[json.loads(line) for line in (root/'.code_index.jsonl').read_text().splitlines()]
 assert any(x.get('name')=='WorkflowGraph' for x in rows),'TSX component missing'
 assert not any(x.get('path','').endswith('.json') for x in rows),'JSON corpus pollutes source index'
 with tempfile.TemporaryDirectory() as cache:
  cached=pathlib.Path(cache)/'index.jsonl'
  result=subprocess.run([binary,'find','WorkflowGraph'],cwd=root,env={**os.environ,'PVTA_BRAIN_INDEX':str(cached)},capture_output=True,text=True,check=True)
  assert cached.is_file() and 'WorkflowGraph.tsx' in result.stdout,'Private index lookup failed'
 print('PASS: UI component indexed; JSON corpus excluded')
