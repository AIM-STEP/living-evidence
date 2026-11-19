const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),script=fs.readFileSync(path.join(root,'app/secure-origin.js'),'utf8');
for(const original of ['http://aimsetp.com/index.html?view=page&page=full-text-screening.html&projectId=test#pilot','http://aimsetp.com/eligibility.html?projectId=a%20b','https://aimsetp.com/eligibility.html','http://127.0.0.1:8765/eligibility.html','http://localhost:8765/','http://100.114.199.15:8765/','http://[::1]:8765/']){
 const location=new URL(original);let target;location.replace=value=>target=value;vm.runInNewContext(script,{location,URL,window:{top:{},self:{}}});assert.equal(target,original.startsWith('http://aimsetp.com/')?original.replace('http:','https:'):undefined);
}
// A top-level tool now redirects to its project shell; framed tools retain their URL.
for(const origin of ['https://aimsetp.com','http://127.0.0.1:8765']){
 const release=require('../app/eligibility-release.js'),window={AIMSTEPCriteriaRelease:release};
 window.self=window.top=window;
 const location=new URL('/eligibility.html?projectId=test&lang=zh&appVersion=20991231-criteria-release-5#criteria',origin);
 let target;location.replace=url=>target=new URL(url);
 vm.runInNewContext(script,{location,window,URL});
 assert.equal(target.origin,origin);
 assert.equal(target.searchParams.get('page'),'eligibility.html');
 assert.equal(target.searchParams.get('projectId'),'test');
 assert.equal(target.searchParams.get('lang'),'zh');assert.equal(target.hash,'#criteria');
 assert.equal(target.searchParams.get('appVersion'),'20991231-criteria-release-5');
}
// Standalone flowchart documents contain no scripts or application initialization.
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){const html=fs.readFileSync(path.join(root,file),'utf8');if(!/<script\b/i.test(html))continue;const i=html.indexOf('app/secure-origin.js');assert(i>=0&&i<500,file+' must redirect before app initialization');}
console.log('PASS: HTTPS redirect preserves paths/project/query/hash; secure and local origins unchanged; all entry pages covered');
