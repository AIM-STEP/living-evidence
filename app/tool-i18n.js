/* Shared, deterministic UI localisation. Never sends research data to a translator. */
(function () {
  'use strict';
  const catalog = window.AimstepToolTranslations || {};
  const key = 'aimstep-lang';
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const skip = 'script,style,svg,code,pre,textarea,[contenteditable]:not([contenteditable="false"]),[translate="no"],[data-ui-preserve],.brand,#project-pill,#import-name,#protocol-issues,#review-issues,#handoff-content,#reader-text,#reader-content,.record-title,.record-abstract,.study-title,.evidence-quote';
  // Dynamic localisation is opt-in for interface controls and status regions.
  // Data cells, research prose and generated documents are deliberately excluded.
  const ui = '[data-ui-localize],button,option,th,label,summary,[role="status"],[role="alert"],.notice,.hint,.empty,.empty-state,.badge,.sr-only,.toast';
  let language = 'en';
  let observer;
  let toggle;
  const normalize = text => String(text).replace(/\s+/g, ' ').trim();
  function translate(text) {
    const s = normalize(text);
    if (Object.hasOwn(catalog, s)) return catalog[s];
    // Only translate the known UI label within numbered and disclosure controls.
    const numbered = s.match(/^(#\d+\s+)(.+)$/);
    if (numbered && catalog[numbered[2]]) return numbered[1] + catalog[numbered[2]];
    const count = s.match(/^(All records|Agreed|Mistakes) (\d+)$/);
    if (count) return catalog[count[1]] + ' ' + count[2];
    const disclosure = s.match(/^(Expand |Collapse |← )(.+)$/);
    if (disclosure && catalog[disclosure[2]]) return ({'Expand ':'展开','Collapse ':'收起','← ':'← '})[disclosure[1]] + catalog[disclosure[2]];
    if (s.endsWith(' →') && catalog[s.slice(0,-2)]) return catalog[s.slice(0,-2)] + ' →';
    const patterns = [
      [/^Round (\d+)$/, m => '第 ' + m[1] + ' 轮'],
      [/^(\d[\d,]*) records?$/, m => m[1] + ' 条记录'],
      [/^(\d[\d,]*) reports?$/, m => m[1] + ' 篇报告'],
      [/^(\d[\d,]*) stud(?:y|ies)$/, m => m[1] + ' 项研究'],
      [/^Total records (\d[\d,]*)$/, m => '记录总数 ' + m[1]],
      [/^With PDF (\d[\d,]*)$/, m => '有 PDF ' + m[1]],
      [/^Without PDF (\d[\d,]*)$/, m => '无 PDF ' + m[1]],
      [/^(\d+) of (\d+) searches? selected\.$/, m => '已选择 ' + m[1] + ' / ' + m[2] + ' 次检索。'],
      [/^Stop \((\d+)\)$/, m => '停止（' + m[1] + '）']
    ];
    for (const [pattern, render] of patterns) { const match = s.match(pattern); if (match) return render(match); }
    return text;
  }
  function sourceValue(map, object, value) {
    const old = map.get(object);
    return old && value === old.rendered ? old.source : value;
  }
  function textNode(node) {
    const el = node.parentElement;
    if (!el || el.closest(skip) || !el.closest(ui)) return;
    const source = sourceValue(originals, node, node.nodeValue);
    const translated = translate(source);
    if (translated === source && !originals.has(node)) return;
    // An option without an explicit value uses its text as its value. Freeze the
    // original before localising, so persisted data and model prompts stay stable.
    if (el.tagName === 'OPTION' && !el.hasAttribute('value')) el.setAttribute('value', el.textContent);
    const rendered = language === 'zh' ? source.replace(/\S[\s\S]*\S|\S/, translated.trim()) : source;
    originals.set(node, { source, rendered });
    if (node.nodeValue !== rendered) node.nodeValue = rendered;
  }
  function element(el) {
    // Textarea contents are research data; their placeholder is interface copy.
    if ((el.tagName !== 'TEXTAREA' && el.closest(skip)) || el.closest('[data-ui-preserve],[translate="no"]') || el === toggle) return;
    const state = attributes.get(el) || {};
    for (const name of ['placeholder', 'title', 'aria-label']) {
      if (!el.hasAttribute(name)) continue;
      const value = el.getAttribute(name);
      const old = state[name];
      const source = old && value === old.rendered ? old.source : value;
      const rendered = language === 'zh' ? translate(source) : source;
      state[name] = { source, rendered };
      if (rendered !== value) el.setAttribute(name, rendered);
    }
    attributes.set(el, state);
  }
  function scan(root) {
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType === 1) element(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (walker.currentNode.nodeType === 3) textNode(walker.currentNode);
      else element(walker.currentNode);
    }
  }
  function observe() {
    observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['placeholder','title','aria-label']});
  }
  const title = document.title;
  function syncChildren() {
    document.querySelectorAll('iframe').forEach(frame => {
      try { frame.contentWindow.AIMSTEP?.setLanguage?.(language); } catch (_) { /* cross-origin PDF */ }
    });
  }
  function apply(lang, persist = true) {
    language = lang === 'zh' ? 'zh' : 'en';
    observer?.disconnect();
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    document.documentElement.dataset.lang = language;
    document.title = language === 'zh' ? translate(title) : title;
    if (document.body) scan(document.body);
    if (toggle) {
      toggle.textContent = language === 'zh' ? 'English' : '中文';
      toggle.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换为中文');
    }
    if (persist) { try { localStorage.setItem(key, language); } catch (_) {} }
    if (observer) observe();
    syncChildren();
    document.dispatchEvent(new CustomEvent('aimstep:lang', {detail:language}));
  }
  window.AIMSTEP = Object.assign(window.AIMSTEP || {}, {
    lang: () => language,
    setLanguage: apply,
    t: text => language === 'zh' ? translate(text) : text
  });
  // Native confirmation/alert messages use the same reviewed UI catalog.
  for (const name of ['confirm', 'alert']) {
    const original = window[name].bind(window);
    window[name] = message => original(window.AIMSTEP.t(message));
  }
  function init() {
    toggle = document.getElementById('lang-toggle');
    if (!toggle) {
      toggle = document.createElement('button');
      toggle.id = 'lang-toggle'; toggle.type = 'button'; toggle.className = 'tool-language-toggle';
      (document.querySelector('.right-head') || document.querySelector('header nav') || document.querySelector('header') || document.body).appendChild(toggle);
    }
    toggle.setAttribute('translate', 'no');
    toggle.addEventListener('click', () => {
      const next = language === 'zh' ? 'en' : 'zh';
      apply(next);
      try { if (window.parent !== window && window.parent.AIMSTEP?.setLanguage) window.parent.AIMSTEP.setLanguage(next); } catch (_) {}
    });
    observer = new MutationObserver(records => {
      observer.disconnect();
      if (!window.document?.body) return;
      const roots = new Set();
      for (const record of records) {
        if (record.type === 'childList') record.addedNodes.forEach(node => roots.add(node));
        else roots.add(record.target);
      }
      roots.forEach(scan);
      observe();
    });
    let saved = 'en';
    try { saved = localStorage.getItem(key) || 'en'; } catch (_) {}
    try { if (window.parent !== window && window.parent.AIMSTEP?.lang) saved = window.parent.AIMSTEP.lang(); } catch (_) {}
    apply(saved, false);
    document.addEventListener('load', event => { if (event.target.tagName === 'IFRAME') syncChildren(); }, true);
  }
  window.addEventListener('storage', event => { if (event.key === key) apply(event.newValue, false); });
  window.addEventListener('pagehide', () => observer?.disconnect());
  window.addEventListener('pageshow', () => { if (observer) observe(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, {once:true});
  else init();
})();
