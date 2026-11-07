/* Service Worker: Seite offline verfügbar halten und Wetter-Benachrichtigungen anzeigen */
const C="wetter-v2";
/* Kartenbibliothek und Schrift auch ohne Verbindung (feste Versionen, deshalb zuerst aus dem Speicher) */
const LIBS=/^https:\/\/(unpkg\.com\/leaflet@1\.9\.4\/|cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/|fonts\.googleapis\.com\/|fonts\.gstatic\.com\/)/;
const SHELL=["./","index.html","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==C).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
 const r=e.request,u=new URL(r.url);
 if(r.method!=="GET")return;
 if(u.origin!==location.origin){
  if(LIBS.test(r.url))e.respondWith(caches.open(C).then(c=>c.match(r).then(m=>m||fetch(r).then(res=>{if(res.ok||res.type==="opaque")c.put(r,res.clone()).catch(()=>{});return res}))));
  return;
 }
 if(r.mode==="navigate"||/\/$|\.html$/.test(u.pathname)){
  e.respondWith(fetch(r).then(res=>{if(res.ok&&res.type==="basic"){const cp=res.clone();caches.open(C).then(c=>c.put(u.origin+u.pathname,cp)).catch(()=>{})}return res})
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
