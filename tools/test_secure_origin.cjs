const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),script=fs.readFileSync(path.join(root,'app/secure-origin.js'),'utf8');
for(const original of ['http://aimsetp.com/index.html?view=page&page=full-text-screening.html&projectId=test#pilot','http://aimsetp.com/eligibility.html?projectId=a%20b','https://aimsetp.com/eligibility.html','http://127.0.0.1:8765/eligibility.html','http://localhost:8765/','http://100.114.199.15:8765/','http://[::1]:8765/']){
 const location=new URL(original);let target;location.replace=value=>target=value;vm.runInNewContext(script,{location,URL});assert.equal(target,original.startsWith('http://aimsetp.com/')?original.replace('http:','https:'):undefined);
}
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(path.join(root,file),'utf8');const i=html.indexOf('app/secure-origin.js');assert(i>=0&&i<500,file+' must redirect before app initialization');}
console.log('PASS: HTTPS redirect preserves paths/project/query/hash; secure and local origins unchanged; all entry pages covered');
