const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise updates from the different value sources without running AI tasks.
let notify, frames = [], meters = [], writes = 0;
function style(initial = {}) {
  return { ...initial, getPropertyValue(key) { return this[key] || ''; },
    setProperty(key, value) { writes++; this[key] = value; } };
}
function meter(kind, value = 0, max = 100) {
  const attrs = { 'aria-valuenow': String(value), 'aria-valuemax': String(max) };
  const fill = { style: style({ width: value + '%' }), classList: { add() {} } };
  const item = {
    kind, attrs, fill, dataset: {}, style: style(), classList: { add() {} },
    getAttribute(key) { return attrs[key] ?? null; },
    matches(selector) { return selector === '[role="progressbar"]' && kind === 'aria' || selector === '.criteria-progress.is-waiting' && !!this.waiting; },
    querySelector(selector) {
      if (selector === 'progress') return this.native || null;
      if (selector === '[role="progressbar"]') return this.child || null;
      if (selector === '.criteria-progress-percent') return this.label || null;
      return fill;
    }
  };
  return item;
}
const ctx = {
  document: { body: {}, querySelectorAll(selector) { return selector === '.analysis-progress' ? meters : []; } },
  MutationObserver: class { constructor(cb) { notify = cb; } observe() {} },
  requestAnimationFrame(cb) { frames.push(cb); }
};
const initial = meter('aria', 1, 8);
meters.push(initial);
vm.runInNewContext(fs.readFileSync('app/progress-display.js', 'utf8'), ctx);
assert.equal(initial.dataset.progressLabel, '13%');
assert.equal(initial.style['--meter-value'], '12.5%');
function flush() { notify(); const queue = frames; frames = []; queue.forEach(cb => cb()); }
for (const [value, expected] of [[0, '0%'], [4, '50%'], [8, '100%'], [12, '100%'], [-1, '0%']]) {
  initial.attrs['aria-valuenow'] = String(value);
  flush();
  assert.equal(initial.dataset.progressLabel, expected);
  assert.equal(initial.style['--meter-value'], expected);
}
initial.attrs['aria-valuemax'] = '0';
flush();
assert.equal(initial.dataset.progressLabel, '0%');
const native = meter('native');
native.native = { value: 21, max: 42 };
const nested = meter('nested');
nested.child = meter('aria', 75);
const legacy = meter('legacy', 37);
meters.push(native, nested, legacy);
flush();
assert.deepEqual(meters.map(m => m.dataset.progressLabel), ['0%', '50%', '75%', '37%']);
native.native.value = 42;
legacy.fill.style.width = '100%';
flush();
assert.equal(native.dataset.progressLabel, '100%');
assert.equal(legacy.dataset.progressLabel, '100%');
const before = writes;
flush();
assert.equal(writes, before, 'unchanged values must not trigger an observer loop');
notify(); notify(); notify();
assert.equal(frames.length, 1, 'rapid updates are coalesced into one frame');
initial.waiting = true;
initial.label = { textContent: 'Working · 0:00' };
delete initial.attrs['aria-valuenow'];
flush();
assert.equal(initial.dataset.progressLabel, 'Working · 0:00', 'Shared styling must preserve the model-wait label instead of displaying 0%');
initial.label.textContent = 'Working · 0:12';
flush();
assert.equal(initial.dataset.progressLabel, 'Working · 0:12');
const waitingWrites = writes;
flush();
assert.equal(writes, waitingWrites, 'Pending labels must not create a render loop');
initial.waiting = false;
initial.attrs['aria-valuemax'] = '100';
initial.attrs['aria-valuenow'] = '60';
flush();
assert.equal(initial.dataset.progressLabel, '60%', 'Completed phases return to measured progress');
const css = fs.readFileSync('app/progress-display.css', 'utf8');
const waitFill = css.match(/\.unified-progress\.is-waiting \.unified-progress-fill\s*\{([^}]+)\}/)[1];
assert(/width:\s*35%\s*!important/.test(waitFill));
assert(/animation:\s*unified-progress-wait[^;]+!important/.test(waitFill), 'Waiting animation must override the shared animation:none!important rule');
console.log('PASS: initial fractions, 0/50/100%, clamping, empty totals, native/nested/legacy values, dynamic insertion and observer stability');
