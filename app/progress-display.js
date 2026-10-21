/* Present existing progress values consistently; task state stays with each tool. */
(() => {
  const definitions = [
    ['.criteria-progress', '.criteria-progress-fill'],
    ['.progress-meter', '.progress-fill'],
    ['.screening-progress', '.team-track > span'],
    ['.extract-progress', '.extract-progress-track > span'],
    ['.analysis-progress', ':scope > span'],
    ['.protocol-progress', ':scope > span'],
    ['.draft-progress', '.draft-progress-fill'],
    ['.workspace-progressbar, .workspace-progress-track, #full-track, #ai-progress', ':scope > span']
  ];

  function percentage(meter, fill) {
    const native = meter.querySelector('progress');
    const aria = meter.matches('[role="progressbar"]') ? meter : meter.querySelector('[role="progressbar"]');
    if (native) return native.max > 0 ? 100 * native.value / native.max : 0;
    if (aria) {
      const min = Number(aria.getAttribute('aria-valuemin') || 0);
      const max = Number(aria.getAttribute('aria-valuemax') ?? 100);
      const now = Number(aria.getAttribute('aria-valuenow') || 0);
      return max > min ? 100 * (now - min) / (max - min) : 0;
    }
    return parseFloat(meter.style.getPropertyValue('--progress') || fill.style.width) || 0;
  }

  function align(meter) {
    // Screening progress belongs next to its section title, not on a separate row.
    if (meter.matches('.screening-progress, #full-track')) {
      const title = meter.closest('.panel')?.querySelector('.panel-head .pilot-title-actions');
      if (title && meter.parentElement !== title) {
        title.classList.add('progress-title-row');
        title.append(meter);
      }
    }
    if (meter.matches('.workspace-progress-track') && meter.previousElementSibling?.matches('h3')) {
      const title = meter.previousElementSibling;
      const row = document.createElement('div');
      row.className = 'progress-title-row';
      title.before(row);
      row.append(title, meter);
    }
  }

  function render() {
    for (const [selector, fillSelector] of definitions) {
      document.querySelectorAll(selector).forEach(meter => {
        const fill = meter.querySelector(fillSelector);
        if (!fill) return;
        align(meter);
        meter.classList.add('unified-progress');
        fill.classList.add('unified-progress-fill');
        const value = Math.max(0, Math.min(100, percentage(meter, fill)));
        const position = (Number.isFinite(value) ? value : 0) + '%';
        const label = Math.round(Number.isFinite(value) ? value : 0) + '%';
        if (meter.style.getPropertyValue('--meter-value') !== position) meter.style.setProperty('--meter-value', position);
        if (meter.dataset.progressLabel !== label) meter.dataset.progressLabel = label;
      });
    }
  }

  let pending = false;
  const observer = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; render(); });
  });
  render();
  // Includes progress bars inserted when a tool rerenders its pilot/main workflow.
  observer.observe(document.body, {
    subtree: true, childList: true, attributes: true,
    attributeFilter: ['style', 'aria-valuenow', 'aria-valuemin', 'aria-valuemax', 'value', 'max']
  });
})();
