// Network first so you always get the newest version; the shell cache is the offline fallback.
// The hero is a real file (img/hero.jpg) so the service worker can store it. Precache it
// on install so the welcome art and meetup covers still paint with no network.
const C='bb-shell-25';
const SHELL=['./','./index.html','./gloss.css','./app.js','./logic.mjs','./manifest.json','./img/hero.jpg','./img/bg.jpg'];
self.addEventListener('install',e=>{
  e.waitUntil(caches.open(C).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('./'))));
});
