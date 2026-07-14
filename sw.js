const CACHE='gatica-pos-v20';
const ASSETS=['./','./index.html','./manifest.json','./icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(ASSETS.map(a=>c.add(a)))).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);
  if(url.hostname.includes('supabase.co'))return; // datos siempre frescos desde la red
  if(url.pathname.startsWith('/api/'))return;     // el backend (propio dominio u otro) nunca se cachea
  e.respondWith(caches.match(e.request).then(c=>c||fetch(e.request).catch(()=>c)));
});
