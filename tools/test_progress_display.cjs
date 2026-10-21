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
    matches(selector) { return selector === '[role="progressbar"]' && kind === 'aria'; },
    querySelector(selector) {
      if (selector === 'progress') return this.native || null;
      if (selector === '[role="progressbar"]') return this.child || null;
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
console.log('PASS: initial fractions, 0/50/100%, clamping, empty totals, native/nested/legacy values, dynamic insertion and observer stability');
