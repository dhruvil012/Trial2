const CACHE='civilcalc-v73-20260810-complete';
const CORE=['./','./index.html','./manifest.json'];
const OPTIONAL=['./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(CORE);
  await Promise.allSettled(OPTIONAL.map(url=>cache.add(url)));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);if(url.origin!==self.location.origin)return;
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      try{const response=await fetch(event.request);if(response&&response.ok){const cache=await caches.open(CACHE);cache.put('./index.html',response.clone());}return response;}
      catch(e){return (await caches.match('./index.html')) || Response.error();}
    })());return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(event.request);if(cached)return cached;
    try{const response=await fetch(event.request);if(response&&response.ok){const cache=await caches.open(CACHE);cache.put(event.request,response.clone());}return response;}
    catch(e){return Response.error();}
  })());
});
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
