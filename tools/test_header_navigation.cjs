const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const toolset=html.slice(html.indexOf('id="toolset-dropdown"'),html.indexOf('id="bank-trigger"'));
const bank=html.slice(html.indexOf('id="bank-dropdown"'),html.indexOf('<div class="header-actions">'));
assert.equal([...toolset.matchAll(/data-tool="/g)].length,8);assert.equal([...bank.matchAll(/data-tool="/g)].length,2);
assert.deepEqual([...toolset.matchAll(/href="([^"]+)" data-tool=/g)].map(m=>m[1]),['eligibility.html','search-strategy.html','title-abstract-screening.html','full-text-screening.html','extraction.html','risk-of-bias.html','analysis.html','certainty-of-evidence.html']);
assert(html.indexOf('id="projects"')>html.indexOf('<main>'));assert(html.indexOf('id="toolset"')<html.indexOf('</header>'));
const timers=new Map();let timerId=0,document;
class Node {
 constructor(parent=null){this.parent=parent;this.handlers={};this.attrs={};this.hidden=true;}
 addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
 fire(name,event={}){for(const fn of this.handlers[name]||[])fn({target:this,preventDefault(){},...event});}
 setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}
 contains(target){for(let n=target;n;n=n.parent)if(n===this)return true;return false;}
 focus(){document.activeElement=this;}
}
const nav=new Node(),items=[new Node(nav),new Node(nav)];
for(const item of items){item.button=new Node(item);item.panel=new Node(item);item.links=[new Node(item.panel),new Node(item.panel)];item.querySelector=selector=>selector==='button'?item.button:item.panel;item.panel.querySelectorAll=()=>item.links;}
nav.querySelectorAll=()=>items;document=new Node();document.querySelector=()=>nav;
const window=new Node();vm.runInNewContext(fs.readFileSync(path.join(root,'app/header-navigation.js'),'utf8'),{document,window,setTimeout:fn=>{const id=++timerId;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
const [tool,writing]=items;
tool.fire('pointerenter');assert(!tool.panel.hidden);assert.equal(tool.button.getAttribute('aria-expanded'),'true');
tool.fire('pointerleave');tool.fire('pointerenter');assert.equal(timers.size,0);assert(!tool.panel.hidden);
writing.button.fire('click');assert(tool.panel.hidden);assert(!writing.panel.hidden);
document.fire('pointerdown',{target:new Node()});assert(writing.panel.hidden);
tool.fire('pointerenter',{pointerType:'touch'});assert(tool.panel.hidden);tool.button.fire('click');assert(!tool.panel.hidden);
tool.fire('keydown',{target:tool.button,key:'ArrowDown'});assert.equal(document.activeElement,tool.links[0]);
tool.fire('keydown',{target:tool.links[0],key:'Escape'});assert(tool.panel.hidden);assert.equal(document.activeElement,tool.button);
tool.fire('keydown',{target:tool.button,key:'ArrowUp'});assert.equal(document.activeElement,tool.links.at(-1));
tool.panel.fire('click',{target:{closest:()=>tool.links[0]}});assert(tool.panel.hidden);
tool.fire('pointerenter');window.fire('popstate');assert(tool.panel.hidden);
console.log('PASS: ordered 8+2 header links, project-first home, hover gap crossing, touch/click, keyboard focus/Escape, selection and outside/history dismissal');
