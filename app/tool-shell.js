/* Shared navigation for the ten project-scoped tools; no research state is changed. */
(function () {
  'use strict';
  const workflow = [
    ['eligibility.html', 'Eligibility criteria', '纳入与排除标准'],
    ['search-strategy.html', 'Search strategy', '检索策略'],
    ['title-abstract-screening.html', 'Title and abstract screening', '题目与摘要筛选'],
    ['full-text-screening.html', 'Full-text assess', '全文评估'],
    ['extraction.html', 'Extraction', '数据提取'],
    ['risk-of-bias.html', 'Risk of bias assessment', '偏倚风险评估'],
    ['analysis.html', 'Analysis', '统计分析'],
    ['certainty-of-evidence.html', 'Certainty of evidence', '证据确定性评价']
  ];
  const writing = [
    ['build-protocol.html', 'Build a proposal', '制定研究提案'],
    ['drafting-manuscript.html', "Summary of evidence", '汇总证据']
  ];
  const url = new URL(location.href);
  const steps = writing.some(step => url.pathname.endsWith('/' + step[0])) ? writing : workflow;
  const allTools = [...workflow, ...writing];
  const index = steps.findIndex(step => url.pathname.endsWith('/' + step[0]));
  const nav = document.querySelector('.tool-flow');
  if (index < 0 || !nav) return;
  const projectId = url.searchParams.get('projectId') || url.searchParams.get('project') || url.searchParams.get('id') || '';
  function destination(file) {
    const target = new URL(file, url);
    if (projectId) target.searchParams.set('projectId', projectId);
    return target.href;
  }
  const home = nav.querySelector('[data-flow-home]');
  const previous = nav.querySelector('[data-flow-previous]');
  const next = nav.querySelector('[data-flow-next]');
  const picker = nav.querySelector('[data-flow-picker]');
  const label = nav.querySelector('[data-flow-label]');
  const projects = destination('index.html?view=toolset');
  home.href = projects;
  if (previous && index) previous.href = destination(steps[index - 1][0]);
  else if (previous) {
    previous.removeAttribute('href');
    previous.setAttribute('aria-disabled', 'true');
    previous.setAttribute('tabindex', '-1');
  }
  if (next) next.href = index < steps.length - 1 ? destination(steps[index + 1][0]) : projects;
  // The real next anchor is kept in place, including Eligibility's save handler.
  // Jumping to another tool uses an anchor too, so the dashboard iframe router
  // can intercept it and keep its history and selected project in sync.
  const jump = document.createElement('a');
  jump.hidden = true;
  jump.setAttribute('aria-hidden', 'true');
  jump.tabIndex = -1;
  nav.appendChild(jump);
  picker.addEventListener('change', () => {
    const selected = allTools.find(step => step[0] === picker.value);
    if (selected && selected !== steps[index]) {
      if (selected === steps[index + 1] && next) next.click();
      else if (selected === steps[index - 1] && previous) previous.click();
      else { jump.href = destination(selected[0]); jump.click(); }
    }
    picker.value = steps[index][0];
  });
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || event.defaultPrevented || link === next && next.id === 'next-search-strategy') return;
    if (link.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
    const before = new CustomEvent('aimstep:before-tool-navigation', {cancelable:true, detail:{href:link.href}});
    if (!document.dispatchEvent(before)) event.preventDefault();
  });
  function renderLanguage() {
    const chinese = window.AIMSTEP?.lang() === 'zh' || document.documentElement.lang === 'zh-CN';
    const titleIndex = chinese ? 2 : 1;
    nav.setAttribute('aria-label', chinese ? '研究流程导航' : 'Research workflow');
    home.textContent = chinese ? '返回项目' : 'Projects';
    if (previous) previous.textContent = chinese ? '上一步' : 'Previous';
    if (next) next.textContent = index === steps.length - 1 ? (chinese ? '返回项目' : 'Back to projects') : (chinese ? '下一步' : 'Next');
    if (previous) previous.title = index ? (chinese ? '上一步：' : 'Previous: ') + steps[index - 1][titleIndex] : (chinese ? '当前为第一步' : 'This is the first step');
    if (next) next.title = index < steps.length - 1 ? (chinese ? '下一步：' : 'Next: ') + steps[index + 1][titleIndex] : home.textContent;
    label.textContent = chinese ? '选择工具' : 'Choose a tool';
    picker.replaceChildren(...[workflow, writing].map((group, groupIndex) => {
      const optgroup = document.createElement('optgroup');
      optgroup.label = groupIndex ? (chinese ? '写作工具' : 'Writing tools') : (chinese ? '研究流程' : 'Research workflow');
      optgroup.append(...group.map(step => {
      const option = document.createElement('option');
      option.value = step[0];
      option.textContent = step[titleIndex];
      return option;
      }));
      return optgroup;
    }));
    picker.value = steps[index][0];
  }
  document.addEventListener('aimstep:lang', renderLanguage);
  renderLanguage();
})();

/* Keep status text intact for localisation and accessibility; only its dots animate. */
(function () {
  'use strict';
  const selector = 'button,[role="status"],[role="alert"],[data-ui-localize],.hint,.machine-word-placeholder';
  const excluded = 'script,style,textarea,pre,code,[contenteditable="true"],[data-ui-preserve]';
  function decorate(node) {
    if (node.nodeType !== 3) return;
    const parent = node.parentElement, text = node.nodeValue;
    if (!parent || parent.closest(excluded) || !parent.closest(selector)) return;
    const match = text.match(/^(?:Generating\b|正在生成)[^\n]*?(…|\.{3})\s*$/);
    let label = parent.closest('.generating-dots');
    if (!match) { if (label) label.classList.remove('generating-dots'); return; }
    if (!label) {
      label = document.createElement('span');
      label.className = 'generating-dots';
      parent.insertBefore(label, node);
      label.appendChild(node);
    }
    const range = document.createRange();
    const end = text.trimEnd().length;
    range.setStart(node, end - match[1].length); range.setEnd(node, end);
    const width = range.getBoundingClientRect?.().width;
    const value = width > 0 ? width + 'px' : (match[1] === '…' ? '1em' : '.84em');
    if (label.style.getPropertyValue('--generating-dots-width') !== value) label.style.setProperty('--generating-dots-width', value);
  }
  function scan(root) {
    if (root.nodeType === 3) { decorate(root); return; }
    if (root.nodeType !== 1 || root.matches(excluded)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach(decorate);
  }
  const observer = new MutationObserver(records => {
    observer.disconnect();
    for (const record of records) {
      if (record.type === 'characterData') scan(record.target);
      else record.addedNodes.forEach(scan);
    }
    observe();
  });
  function observe() { observer.observe(document.body, {subtree:true, childList:true, characterData:true}); }
  scan(document.body); observe();
  document.fonts?.ready.then(() => scan(document.body));
})();
