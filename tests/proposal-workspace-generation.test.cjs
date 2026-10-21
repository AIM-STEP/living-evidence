const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),manual=require('../app/protocol-manual.js');
const html=fs.readFileSync(path.join(root,'build-protocol.html'),'utf8');
const fixture={version:1,inputs:{},text:'',issues:[],mapping:null,history:[],imports:[],manualProtocolInputs:{reviewTitle:'疼痛干预综述',reviewType:'Systematic Review',framework:'PICO',rationale:'比较疗效',objectives:'评估疼痛改善',synthesis:'综合研究结果'}};
function app(options={}){
 const nodes=new Map(),data=new Map([['aimstep-protocol:test',JSON.stringify(options.saved||fixture)]]),files=new Map(),requests=[],events=new Map();let busyResolve;
 const modelStarted=new Promise(resolve=>{busyResolve=resolve;});
 class E{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs={};this.style={};this.hidden=false;this.disabled=false;this.value='';this._text='';this.classList={toggle(){}};}
  set id(value){this._id=value;nodes.set(value,this);}get id(){return this._id;}
  set textContent(value){this._text=String(value);this.children=[];}get textContent(){return this._text+this.children.map(child=>child.textContent||'').join('');}
  setAttribute(name,value){this.attrs[name]=String(value);if(name==='hidden')this.hidden=true;}
  getAttribute(name){return this.attrs[name]??null;}removeAttribute(name){delete this.attrs[name];if(name==='hidden')this.hidden=false;}
  toggleAttribute(name,value){const enabled=value??!Object.hasOwn(this.attrs,name);if(enabled)this.setAttribute(name,'');else this.removeAttribute(name);return enabled;}
  append(...children){children.forEach(child=>this.appendChild(child));}
  appendChild(child){if(child.parentNode)child.parentNode.children=child.parentNode.children.filter(item=>item!==child);this.children.push(child);child.parentNode=this;return child;}
  replaceChildren(...children){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...children);}
  get firstElementChild(){return this.children[0]||null;}
  querySelector(tag){for(const child of this.children){if(child.tagName===tag.toUpperCase())return child;const result=child.querySelector(tag);if(result)return result;}return null;}
  insertAdjacentHTML(){}focus(){this.focused=true;}click(){return this.onclick?.({preventDefault(){}});}
 }
 for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b[^>]*\bid="([^"]+)"[^>]*>/g)){const node=new E(match[1]);node.id=match[2];node.hidden=/\bhidden(?:\s|>)/.test(match[0]);}
 const get=id=>nodes.get(id)||null;
 const meter=new E('span');meter.appendChild(new E('b'));get('protocol-progress').appendChild(meter);get('generate-protocol').textContent='Generate';get('proposal-import-layout').appendChild(get('proposal-preview'));
 const storage={getItem:key=>data.get(key)||null,setItem(key,value){if(options.failSave&&key==='aimstep-protocol:test'&&JSON.parse(value).imports.some(file=>file.kind==='generated'))throw Error('Synthetic storage full');data.set(key,value);},removeItem:key=>data.delete(key)};
 class PreviewURL extends URL{}PreviewURL.createObjectURL=()=> 'blob:synthetic-proposal';PreviewURL.revokeObjectURL=()=>{};
 const ctx={console,URL:PreviewURL,URLSearchParams,Blob,AbortController,DOMException,Intl,Date,TextEncoder,setTimeout,clearTimeout,setInterval,clearInterval,queueMicrotask,Event,
  location:{search:'?projectId=test',href:'https://aimsetp.com/build-protocol.html?projectId=test',hostname:'aimsetp.com'},localStorage:storage,
  document:{getElementById:get,documentElement:{lang:'en'},addEventListener(){},querySelectorAll:selector=>selector.startsWith('main ')?[...nodes.values()].filter(node=>['INPUT','BUTTON','TEXTAREA','SELECT'].includes(node.tagName)):[],createElement(tag){const node=new E(tag);if(tag==='canvas'){node.getContext=()=>({fillRect(){},fillText(){},measureText:text=>({width:text.length*10})});node.toBlob=callback=>callback(new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'}));}return node;}},
  indexedDB:{open(){const request={transaction:{abort(){queueMicrotask(()=>request.onerror?.());}}};queueMicrotask(()=>{if(options.blocked)request.onblocked?.();else request.onupgradeneeded?.();});return request;}},confirm:()=>true,
  addEventListener(name,fn){const handlers=events.get(name)||[];handlers.push(fn);events.set(name,handlers);},dispatchEvent(event){for(const fn of events.get(event.type)||[])fn(event);},
  AIMSTEP:{lang:()=> 'en'},AIMSTEPOnlineModel:{online:true,base:'https://ai.aimsetp.com/api/eligibility',request:async()=>{requests.push({cloud:true});throw Error('Synthetic online outage');}},
  AimstepProposalFiles:{get:async id=>files.get(id),put:async(id,file)=>{if(options.failPdf)throw Error('Synthetic PDF storage full');files.set(id,file);},remove:async id=>files.delete(id)},
  fetch:async(url,request)=>{
   if(url.endsWith('/health')){if(options.offline)throw new TypeError('Synthetic unreachable');if(options.unavailable)return {ok:false,json:async()=>({service:'aimstep-local-eligibility-unavailable',status:'Ollama is not running'})};return {ok:true,json:async()=>({service:'aimstep-local-eligibility',model:'synthetic-local'})};}
   const body=JSON.parse(request.body);requests.push({url,body});busyResolve();
   if(options.wait)return new Promise((resolve,reject)=>request.signal.addEventListener('abort',()=>reject(new DOMException('Stopped','AbortError')),{once:true}));
   if(options.modelError)return {ok:false,status:503,json:async()=>({error:'Synthetic inference unavailable'})};
   if(options.changeSource)data.set('aimstep-eligibility:test',JSON.stringify({criteria:[{title:'Population',condition:'Changed source'}]}));
   const ids=body.format.properties.sections?.items.properties.id.enum;
   const value=ids?{sections:ids.map(id=>({id,text:'Planned methods for '+id+'.'})),issues:[]}:{approach:'A prospective systematic review.',requirements:['Preserve supplied criteria.'],confirmations:[]};
   return {ok:true,json:async()=>({model:'synthetic-local',message:{content:JSON.stringify(value)}})};
  }
 };
 ctx.window=ctx;ctx.parent=ctx;
 const sandbox=vm.createContext(ctx);
 for(const name of ['protocol-core','protocol-manual','manuscript-core','proposal-context','proposal-drafting','proposal-materials','proposal-pdf','proposal-model','protocol-workspace'])vm.runInContext(fs.readFileSync(path.join(root,'app',name+'.js'),'utf8'),sandbox,{filename:name+'.js'});
 return {get,data,files,requests,modelStarted,ctx,state:()=>JSON.parse(data.get('aimstep-protocol:test')),generate:()=>get('generate-protocol').click()};
}
test('short but supplied draft fields reach the local model and generate a persisted PDF with right-side preview',async()=>{
 assert.deepEqual(manual.validate(fixture.manualProtocolInputs),[]);
 assert.deepEqual(manual.validate({...fixture.manualProtocolInputs,reviewTitle:'review '.repeat(100),rationale:'rationale '.repeat(1000),objectives:'objective '.repeat(1000),synthesis:'method '.repeat(2000)}),[]);
 assert(manual.fields.every(field=>!('minWords' in field)&&!('maxWords' in field)));
 assert.deepEqual(manual.validate(fixture.manualProtocolInputs,{draft:true}),[]);
 const page=app();await page.generate();
 assert.equal(page.requests.length,5);assert(page.requests.every(request=>request.url==='http://127.0.0.1:8765/api/eligibility/model'&&request.body.provider==='local'));
 assert.equal(page.state().imports.length,1);const file=page.state().imports[0];assert.equal(file.kind,'generated');assert(file.name.endsWith('.pdf'));assert.equal(page.files.get(file.id).type,'application/pdf');assert((await page.files.get(file.id).text()).startsWith('%PDF-1.4'));
 assert(page.get('proposal-generation-status').textContent.includes('Proposal generated'));assert.equal(page.get('generate-protocol').disabled,false);assert.equal(page.get('generate-protocol').textContent,'Generate');
 const row=page.get('proposal-generated-list').children[0];assert.equal(row.children[1].children.length,1);assert.equal(row.children[1].children[0].children[0].textContent,'Build Projects');
 await row.children[0].children[0].children[0].click();assert.equal(page.get('proposal-preview').parentNode.id,'proposal-create-layout');assert.equal(page.get('proposal-preview-frame').hidden,false);
});
test('missing title is reported next to Generate and no model request is sent',async()=>{
 const page=app({saved:{...fixture,manualProtocolInputs:{...fixture.manualProtocolInputs,reviewTitle:''}}});await page.generate();assert.equal(page.requests.length,0);assert(page.get('proposal-generation-status').textContent.includes('review title'));assert.equal(page.get('proposal-generation-status').hidden,false);assert.equal(page.get('generate-protocol').disabled,false);
});
for(const [name,options,message]of [
 ['blocked project database',{blocked:true},'storage is blocked'],
 ['unavailable local model',{unavailable:true},'Ollama is not running'],
 ['inference failure',{modelError:true},'Synthetic inference unavailable'],
 ['both local and online unavailable',{offline:true},'Synthetic online outage'],
 ['PDF save failure',{failPdf:true},'Synthetic PDF storage full'],
 ['metadata save failure',{failSave:true},'Synthetic storage full'],
 ['source changes during generation',{changeSource:true},'Project information changed']
])test(name+' is visible and leaves Generate retryable',async()=>{const page=app(options);await page.generate();assert(page.get('proposal-generation-status').textContent.includes(message),page.get('proposal-generation-status').textContent);assert.equal(page.get('generate-protocol').disabled,false);assert.equal(page.get('run-row').hidden,true);assert.equal(page.state().imports.length,0);assert.equal(page.files.size,0);});
test('Stop cancels a pending local request and restores Generate',async()=>{const page=app({wait:true});const pending=page.generate();await page.modelStarted;assert.equal(page.get('run-row').hidden,true);assert.equal(page.get('proposal-generation-status').hidden,true);assert.equal(page.get('protocol-status').textContent,'');assert.equal(page.get('generate-protocol').disabled,true);assert.equal(page.get('generate-protocol').textContent,'Generating…');page.get('stop-protocol').click();await pending;assert(page.get('proposal-generation-status').textContent.includes('Stopped'));assert.equal(page.get('generate-protocol').disabled,false);assert.equal(page.state().imports.length,0);});
test('missing dependency gives a visible reload instruction',async()=>{const page=app();page.ctx.AimstepProposalPdf=null;await page.generate();assert(page.get('proposal-generation-status').textContent.includes('modules did not load'));assert.equal(page.get('generate-protocol').disabled,false);});
