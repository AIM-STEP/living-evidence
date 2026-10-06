// Public pages need a secure context before requesting local network access.
// Keep loopback/local deployments on their existing origin.
(() => {
  if (location.protocol !== 'http:' || location.hostname !== 'aimsetp.com') return;
  const destination = new URL(location.href);
  destination.protocol = 'https:';
  location.replace(destination.href);
})();
