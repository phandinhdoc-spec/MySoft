import pathlib,tempfile,subprocess,json,hashlib,os
binary=str(pathlib.Path('brain/target/release/pvta-brain').resolve())
with tempfile.TemporaryDirectory() as d:
 p=pathlib.Path(d)/'x.c'
 def run(args,stdin=None):return subprocess.run([binary,*args],cwd=d,input=stdin,text=True,capture_output=True)
 def patch(old,new,h=None):return f'FILE: x.c\nHASH: {h or hashlib.sha256(p.read_bytes()).hexdigest()}\n<<<< SEARCH\n{old}\n====\n{new}\n>>>> REPLACE\n'
 p.write_text('int f() { return 1; }\n')
 read=json.loads(run(['read','x.c','1','1']).stdout);assert read['hash']==hashlib.sha256(p.read_bytes()).hexdigest()
 for content in [patch('return 1;','return 2;','0'*64),patch('missing','x'),patch('return 1;','return 2; }')]:
  old=p.read_bytes();r=run(['patch'],content);assert r.returncode!=0,(r.stdout,r.stderr);assert p.read_bytes()==old
 r=run(['patch'],patch('return 1;','return 2;'));assert r.returncode==0,r.stderr;assert json.loads(r.stdout)['patched'];assert json.loads(r.stdout)['indexError'] is None;assert 'return 2;' in p.read_text()
 p.write_text('int f(){return 1;}\nint g(){return 1;}\n');old=p.read_bytes();assert run(['patch'],patch('return 1;','return 2;')).returncode!=0;assert p.read_bytes()==old
 assert run(['read','../x.c','1','1']).returncode!=0
 (pathlib.Path(d)/'link.c').symlink_to(p);assert run(['read','link.c','1','1']).returncode!=0
 p.write_bytes(b'int f(){return 1;}\r\n');p.chmod(0o640);r=run(['patch'],patch('return 1;','return 2;'));assert r.returncode==0,r.stderr;assert p.read_bytes()==b'int f(){return 2;}\r\n';assert p.stat().st_mode&0o777==0o640
 r=run(['find','f']);assert r.returncode==0,r.stderr;assert any(json.loads(line).get('name')=='f' for line in r.stdout.splitlines())
 p.write_text('int changed(){return 3;}\n');r=run(['find','changed']);assert r.returncode==0,r.stderr;assert 'changed' in r.stdout
 r=run(['refs','changed']);assert r.returncode==0,r.stderr;assert 'x.c:1:' in r.stdout
 print('PASS: hash freshness, missing/duplicate SEARCH, bracket rejection, patch commit, path traversal, symlink, CRLF, permissions')
