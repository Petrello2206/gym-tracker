/* Offline-Unterstützung: App-Dateien zwischenspeichern, immer zuerst die neueste Version holen */
const CACHE='gym-tracker-v15';
const FILES=['./','index.html','db.js','seed.js','plans.json','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET' || u.origin!==location.origin) return;   // Skript, Open Food Facts usw. nicht cachen
  const req=new Request(u.href,{cache:'no-cache',credentials:'same-origin'});
  e.respondWith(fetch(req).then(r=>{ const cp=r.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return r; }).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('./'))));
});
