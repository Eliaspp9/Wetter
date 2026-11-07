/* Service Worker: Seite offline verfügbar halten und Wetter-Benachrichtigungen anzeigen */
const C="wetter-v1";
const SHELL=["./","index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=="GET"||u.origin!==location.origin)return;
 if(r.mode==="navigate"||/\/$|\.html$/.test(u.pathname)){
  e.respondWith(fetch(r).then(res=>{if(res.ok&&!u.search){const cp=res.clone();caches.open(C).then(c=>c.put(r,cp))}return res})
   .catch(()=>caches.match(r,{ignoreSearch:true}).then(m=>m||caches.match("index.html"))));
  return;
 }
 e.respondWith(caches.match(r).then(m=>m||fetch(r)));
});
self.addEventListener("push",e=>{
 let d={};try{d=e.data?e.data.json():{}}catch(x){d={body:e.data?e.data.text():""}}
 e.waitUntil(self.registration.showNotification(d.title||"Wetter",{body:d.body||"",icon:"icons/icon-192.png",badge:"icons/icon-192.png",tag:d.tag||"wetter",data:{url:d.url||"./"}}));
});
self.addEventListener("notificationclick",e=>{
 e.notification.close();
 const url=(e.notification.data&&e.notification.data.url)||"./";
 e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(cs=>{for(const c of cs){if("focus" in c){if("navigate" in c)c.navigate(url).catch(()=>{});return c.focus()}}return clients.openWindow(url)}));
});
