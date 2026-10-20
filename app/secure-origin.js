// Shared public routes. Tool documents stay internal to the workspace iframe.
(() => {
  const routes = window.AIMSTEP_ROUTES = {
    'eligibility.html': 'eligibility',
    'search-strategy.html': 'search-strategy',
    'build-protocol.html': 'build-the-proposal',
    'title-abstract-screening.html': 'title-and-abstract-screening',
    'full-text-screening.html': 'full-text-assess',
    'extraction.html': 'extraction',
    'risk-of-bias.html': 'risk-of-bias-assessment',
    'analysis.html': 'analysis',
    'certainty-of-evidence.html': 'certainty-of-evidence',
    'drafting-manuscript.html': 'summary-the-evidence'
  };
  const url = new URL(location.href);
  if (url.protocol === 'http:' && url.hostname === 'aimsetp.com') {
    url.protocol = 'https:';
    location.replace(url.href);
    return;
  }
  if (window.top !== window.self) return;
  const file = url.pathname.split('/').pop();
  if (routes[file]) {
    const target = new URL('./', url);
    target.search = url.search;
    target.searchParams.set('view', 'page');
    target.searchParams.set('page', file);
    target.hash = url.hash;
    location.replace(target.href);
  } else if (file === 'index.html') {
    url.pathname = url.pathname.replace(/index\.html$/, '');
    history.replaceState(history.state, '', url.href);
  }
})();
