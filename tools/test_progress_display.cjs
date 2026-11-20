const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let now = 1000, update, stops = 0;
const elements = [];
const ctx = {
  Date: { now: () => now },
  document: { querySelectorAll: () => elements.filter(e => 'timingStart' in e.dataset) },
  setInterval(fn) { assert(!update); update = fn; return 1; },
  clearInterval() { update = null; stops++; }
};
vm.runInNewContext(fs.readFileSync('app/progress-display.js', 'utf8'), ctx);
const timing = ctx.AimstepWorkflowTiming;
const first = { textContent: '', dataset: {} }, second = { textContent: '', dataset: {} };
elements.push(first, second);

timing.render(first, null, null);
assert(first.hidden);
timing.render(first, now);
assert.equal(first.textContent, 'Working · 0:00');
now += 12300;
timing.render(second, now);
update();
assert.equal(first.textContent, 'Working · 0:12');
assert.equal(second.textContent, 'Working · 0:00');

timing.render(first, null, 12300);
now += 65000;
update();
assert.equal(first.textContent, 'Elapsed time · 0:12');
assert.equal(second.textContent, 'Working · 1:05');
timing.render(second, null, 65000);
update();
assert.equal(update, null);
assert.equal(stops, 1);
assert.equal(timing.markup(null, 0), '<span class="workflow-time" role="timer">Elapsed time · 0:00</span>');
assert.equal(timing.markup(null, undefined), '');

for (const name of ['eligibility','search-strategy','title-abstract-screening','full-text-screening','extraction','risk-of-bias',
  'analysis','build-protocol','drafting-manuscript','certainty-of-evidence','index']) {
  const page = fs.readFileSync(name + '.html', 'utf8');
  assert.doesNotMatch(page, /role=["']progressbar|aria-valuenow|<progress\b/i, name);
}
for (const name of ['protocol-workspace','extraction-workflow','extraction-form-library','rob-workflow','analysis-ui','manuscript-workspace']) {
  const code = fs.readFileSync('app/' + name + '.js', 'utf8');
  assert.doesNotMatch(code, /progressbar|aria-valuenow|<progress\b/i, name);
}
console.log('PASS: workflow timers count independently, keep saved durations, stop ticking when idle, and replace all progress bars.');
