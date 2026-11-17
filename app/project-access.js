/* A tool starts only after its explicit project is found in the project registry.
 * Browsing an unscoped tool neither reads nor creates a research workspace. */
(() => {
  'use strict';
  const url = new URL(location.href);
  const aliases = ['projectId', 'project', 'id'];
  const ids = [...new Set(aliases.flatMap(key => url.searchParams.getAll(key).map(value => value.trim())).filter(Boolean))];
  const projectId = ids.length === 1 && ids[0] !== 'default' ? ids[0] : '';
  const file = url.pathname.split('/').pop();
  const root = new URL('./', url);
  let permitted = false, promise;
  document.documentElement.dataset.projectAccess = projectId ? 'pending' : 'preview';
  const style = document.createElement('style');
  style.textContent = 'html[data-project-access="pending"] main{visibility:hidden}';
  document.head.appendChild(style);
  // Normalise legacy aliases before any task code constructs storage keys.
  if (projectId) {
    aliases.forEach(key => url.searchParams.delete(key));
    url.searchParams.set('projectId', projectId);
    history.replaceState(history.state, '', url.href);
  }
  function host() {
    let owner = window;
    try {
      while (owner.parent && owner.parent !== owner && owner.parent.location.origin === location.origin) owner = owner.parent;
    } catch (_) {}
    return owner;
  }
  function inspect() {
    if (!projectId) return false;
    try {
      if (localStorage.getItem('aimstep-project-deleted:' + projectId)) return false;
      const controller = host().AIMSTEP?.projectController;
      if (!controller) return null;
      const state = controller.state();
      if (state.loadError) return null; // A failed/slow connection is not an empty registry.
      if (!Array.isArray(state.projects)) return null;
      return state.projects.some(project => project.id === projectId);
    } catch (_) { return null; }
  }
  function preview() {
    permitted = false;
    document.documentElement.dataset.projectAccess = 'preview';
    // Authored placeholders remain; no stored data or sample answers are filled in.
    for (const input of document.querySelectorAll('main input, main textarea, main [contenteditable]')) {
      if (input.matches('[contenteditable]')) input.textContent = '';
      else if (['checkbox', 'radio'].includes(input.type)) input.checked = false;
      else input.value = '';
    }
    for (const control of document.querySelectorAll('main button, main input, main select, main textarea')) {
      control.disabled = false;
      control.removeAttribute('aria-disabled');
    }
  }
  function registration() {
    const target = new URL('index.html', root);
    target.searchParams.set('view', 'new-project');
    target.searchParams.set('returnTo', file);
    const owner = host();
    if (owner.AIMSTEP?.registerToolProject) owner.AIMSTEP.registerToolProject(file);
    else owner.location.assign(target.href);
  }
  function intercept(event) {
    if (permitted) return;
    const control = event.target.closest?.('main form,main button,main input,main select,main textarea,main label,main [contenteditable],main [role="button"],main a[href]');
    if (!control) return;
    // External documentation and the link back to Projects are ordinary navigation.
    if (control.matches('a[href]')) {
      const target = new URL(control.href, url);
      if (target.origin !== url.origin || target.pathname.endsWith('/index.html')) return;
    }
    if (event.type === 'keydown' && ['Tab', 'Shift', 'Control', 'Meta', 'Alt', 'Escape'].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    registration();
  }
  for (const type of ['click', 'keydown', 'beforeinput', 'submit', 'change', 'drop']) document.addEventListener(type, intercept, true);
  function ready() {
    if (promise) return promise;
    promise = new Promise(resolve => {
      const owner = host();
      const check = () => {
        const result = inspect();
        if (result === null) return;
        owner.document.removeEventListener('aimstep:project-registry', check);
        owner.document.removeEventListener('aimstep:projects-ready', check);
        permitted = result;
        if (result) document.documentElement.dataset.projectAccess = 'ready';
        else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preview, {once:true});
        else preview();
        resolve(result);
      };
      owner.document.addEventListener('aimstep:project-registry', check);
      owner.document.addEventListener('aimstep:projects-ready', check);
      check();
    });
    return promise;
  }
  window.AIMSTEPProjectAccess = {
    projectId,
    ready,
    run(task) { return ready().then(allowed => allowed ? task() : undefined); }
  };
  ready();
})();
