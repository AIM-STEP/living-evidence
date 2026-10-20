/* Shared navigation for the ten project-scoped tools; no research state is changed. */
(function () {
  'use strict';
  const steps = [
    ['eligibility.html', 'Eligibility criteria', '纳入与排除标准'],
    ['search-strategy.html', 'Search strategy', '检索策略'],
    ['build-protocol.html', 'Build the protocol', '制定研究方案'],
    ['title-abstract-screening.html', 'Title and abstract screening', '题目与摘要筛选'],
    ['full-text-screening.html', 'Full-text assess', '全文评估'],
    ['extraction.html', 'Extraction', '数据提取'],
    ['risk-of-bias.html', 'Risk of bias assessment', '偏倚风险评估'],
    ['analysis.html', 'Analysis', '统计分析'],
    ['certainty-of-evidence.html', 'Certainty of evidence', '证据确定性评价'],
    ['drafting-manuscript.html', 'Drafting the manuscript', '撰写论文']
  ];
  const url = new URL(location.href);
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
  const position = nav.querySelector('[data-flow-position]');
  const projects = destination('index.html?view=toolset');
  home.href = projects;
  if (index) previous.href = destination(steps[index - 1][0]);
  else {
    previous.removeAttribute('href');
    previous.setAttribute('aria-disabled', 'true');
    previous.setAttribute('tabindex', '-1');
  }
  next.href = index < steps.length - 1 ? destination(steps[index + 1][0]) : projects;
  // The real next anchor is kept in place, including Eligibility's save handler.
  // Jumping to another tool uses an anchor too, so the dashboard iframe router
  // can intercept it and keep its history and selected project in sync.
  const jump = document.createElement('a');
  jump.hidden = true;
  jump.setAttribute('aria-hidden', 'true');
  jump.tabIndex = -1;
  nav.appendChild(jump);
  picker.addEventListener('change', () => {
    const selected = steps.findIndex(step => step[0] === picker.value);
    if (selected >= 0 && selected !== index) {
      if (selected === index + 1) next.click();
      else if (selected === index - 1) previous.click();
      else { jump.href = destination(steps[selected][0]); jump.click(); }
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
    previous.textContent = chinese ? '上一步' : 'Previous';
    next.textContent = index === steps.length - 1 ? (chinese ? '返回项目' : 'Back to projects') : (chinese ? '下一步' : 'Next');
    previous.title = index ? (chinese ? '上一步：' : 'Previous: ') + steps[index - 1][titleIndex] : (chinese ? '当前为第一步' : 'This is the first step');
    next.title = index < steps.length - 1 ? (chinese ? '下一步：' : 'Next: ') + steps[index + 1][titleIndex] : home.textContent;
    label.textContent = chinese ? '选择研究步骤' : 'Choose a research step';
    position.textContent = (index + 1) + ' / ' + steps.length;
    picker.replaceChildren(...steps.map(step => {
      const option = document.createElement('option');
      option.value = step[0];
      option.textContent = step[titleIndex];
      return option;
    }));
    picker.value = steps[index][0];
  }
  document.addEventListener('aimstep:lang', renderLanguage);
  renderLanguage();
})();
