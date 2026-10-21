// Small static entry points support direct links and refresh on GitHub Pages.
const fs=require('node:fs'),vm=require('node:vm');
const window={};window.top={};window.self={};
vm.runInNewContext(fs.readFileSync('app/secure-origin.js','utf8'),{window,URL,location:{href:'https://aimsetp.com/'}});
const entryVersions={'build-protocol.html':'20261021-11'};
for(const [file,slug]of Object.entries(window.AIMSTEP_ROUTES)){
 fs.mkdirSync(slug,{recursive:true});
 fs.writeFileSync(slug+'/index.html',`<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AIM-STEP</title><script>const target=new URL('../',location.href);target.search=location.search;target.searchParams.set('view','page');target.searchParams.set('page',${JSON.stringify(file)});${entryVersions[file]?`target.searchParams.set('appVersion',${JSON.stringify(entryVersions[file])});`:''}target.hash=location.hash;location.replace(target.href);</script></head><body><a href="../?view=page&amp;page=${file}">Open tool</a></body></html>\n`);
}
