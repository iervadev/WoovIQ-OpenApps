const CACHE = 'wooviq-bodyscan-v4.2-20260914';
const CORE = ['./', './index.html', './app.js', './measurements.mjs', './scan360.mjs', './reconstruction.mjs', './reconstruction-worker.js', './viewer.mjs', './voice-guide.mjs', './manifest.webmanifest', './calibration-marker.svg', ...['camera','ready','camera-required','ai-loading','ai-error','calibration','body','start','straight','arms','front','position','rotate','captured','return','pose','complete'].map(name=>`./audio/${name}.m4a`)];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE && (key.startsWith('wooviq-bodyscan-') || key === 'bodyscan-v3-20260909')).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  // Leave model/CDN requests and other applications on the origin untouched.
  if (request.method !== 'GET' || !CORE.some(path => new URL(path, self.registration.scope).href === url.href)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-cache' });
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      return await cache.match(request) || Response.error();
    }
  })());
});
