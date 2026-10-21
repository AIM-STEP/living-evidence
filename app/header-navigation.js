/* Header-only navigation. Existing tool links and iframe lifetimes stay intact. */
(() => {
  'use strict';
  const nav = document.querySelector('.header-products');
  if (!nav) return;
  const items = [...nav.querySelectorAll('.product-nav-item')];
  let leaveTimer;
  const cancelLeave = () => clearTimeout(leaveTimer);
  function set(item, open) {
    item.querySelector('button').setAttribute('aria-expanded', String(open));
    item.querySelector('.product-dropdown').hidden = !open;
  }
  function close() { cancelLeave(); items.forEach(item => set(item, false)); }
  function open(item) { cancelLeave(); items.forEach(other => set(other, other === item)); }
  for (const item of items) {
    const button = item.querySelector('button'), panel = item.querySelector('.product-dropdown');
    item.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') open(item); });
    item.addEventListener('pointerleave', () => { cancelLeave(); leaveTimer = setTimeout(() => { if (!item.contains(document.activeElement)) set(item, false); }, 160); });
    item.addEventListener('focusout', event => { if (!item.contains(event.relatedTarget)) set(item, false); });
    button.addEventListener('click', () => { if (button.getAttribute('aria-expanded') === 'true') set(item, false); else open(item); });
    item.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(); button.focus(); }
      if (event.target === button && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault(); open(item);
        const links = [...panel.querySelectorAll('a[href]')];
        (event.key === 'ArrowDown' ? links[0] : links.at(-1))?.focus();
      }
    });
    panel.addEventListener('click', event => { if (event.target.closest('a[href]')) close(); });
  }
  document.addEventListener('pointerdown', event => { if (!nav.contains(event.target)) close(); });
  nav.addEventListener('click', event => { if (event.target.closest('a[href]')) close(); });
  window.addEventListener('popstate', close);
})();
