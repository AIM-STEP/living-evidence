/* Global tool navigation is removed; writing and workflow actions live in projects. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{JSDOM}=require('jsdom');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),dom=new JSDOM(html,{runScripts:'outside-only'}),d=dom.window.document;
assert.equal(d.querySelector('.header-products,#toolset-trigger,#toolset-dropdown,#toolset'),null);
assert.equal(d.querySelector('.site-header a[href="build-protocol.html"],.site-header a[href="drafting-manuscript.html"]'),null);
assert(d.querySelector('.site-header .brand'));assert(d.querySelector('#lang-toggle'));assert(d.querySelector('#login-btn'));
const project=d.getElementById('project-workspace');assert(project.hidden,'writing entries are not visible before selecting a project');
const links=[...project.querySelectorAll('[data-workspace-tool]')];
assert.equal(links.length,10);
assert.deepEqual(links.slice(0,2).map(link=>link.querySelector('.workspace-step-name').textContent),['Proposal','Report']);
assert.deepEqual(links.slice(2).map(link=>link.getAttribute('href')),['eligibility.html','search-strategy.html','title-abstract-screening.html','full-text-screening.html','extraction.html','risk-of-bias.html','analysis.html','certainty-of-evidence.html']);
assert.equal(d.querySelector('.project-tool-row .workspace-step-name').textContent,'Proposal');
assert.equal(project.textContent.includes('Evidencebank'),false);dom.window.close();
console.log('PASS global Toolset/writing menus removed, account controls retained, project-only Proposal and Report precede the eight workflow tools');
