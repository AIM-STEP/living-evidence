/* Elapsed time display shared by workflow tools. Each tool owns its run state. */
((root) => {
  'use strict';

  const activeSelector = '[data-timing-start]';
  let ticker = null;

  function elapsed(startedAt, endedAt = Date.now()) {
    return Math.max(0, endedAt - startedAt);
  }

  function format(ms) {
    const seconds = Math.floor(Math.max(0, ms) / 1000);
    return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
  }

  function label(startedAt, elapsedMs) {
    if (Number.isFinite(startedAt)) return 'Working · ' + format(elapsed(startedAt));
    return Number.isFinite(elapsedMs) ? 'Elapsed time · ' + format(elapsedMs) : '';
  }

  function tick() {
    const active = root.document.querySelectorAll(activeSelector);
    for (const element of active) {
      const text = label(Number(element.dataset.timingStart));
      if (element.textContent !== text) element.textContent = text;
    }
    if (!active.length) {
      root.clearInterval(ticker);
      ticker = null;
    }
  }

  function schedule(startedAt) {
    if (Number.isFinite(startedAt) && ticker === null) ticker = root.setInterval(tick, 1000);
  }

  function render(element, startedAt, elapsedMs) {
    if (!element) return;
    const text = label(startedAt, elapsedMs);
    if (Number.isFinite(startedAt)) element.dataset.timingStart = String(startedAt);
    else delete element.dataset.timingStart;
    element.hidden = !text;
    if (element.textContent !== text) element.textContent = text;
    schedule(startedAt);
  }

  function markup(startedAt, elapsedMs) {
    const text = label(startedAt, elapsedMs);
    if (!text) return '';
    schedule(startedAt);
    const attributes = Number.isFinite(startedAt) ? ' data-timing-start="' + startedAt + '"' : '';
    return '<span class="workflow-time" role="timer"' + attributes + '>' + text + '</span>';
  }

  root.AimstepWorkflowTiming = { render, markup };
})(globalThis);
