/* Service Worker: App sofort aus dem Speicher starten, offline verfügbar halten, Wetter-Benachrichtigungen anzeigen.
   Startseite: kommt aus dem Speicher (kein Warten auf das Netz); kurz danach wird im Hintergrund nachgesehen, ob es eine neuere
   gibt, die dann beim nächsten Start gilt. Die App selbst sucht zusätzlich nach Updates (version.json) und lädt mit ?u=… neu:
   solche Aufrufe gehen immer ins Netz. Schriften, Symbole und die Kartenbibliothek (feste Versionen): zuerst aus dem Speicher. */
const APP="wetter-app-1",LIB="wetter-lib-1";
const LIBS=/^https:\/\/(unpkg\.com\/leaflet@1\.9\.4\/|cdnjs\.cloudflare\.com\/ajax\/libs\/leaflet\/1\.9\.4\/)/;
const STATIC=/\/(fonts\/[\w.-]+\.woff2|icons\/[\w.-]+\.png|manifest\.webmanifest)$/;
const SCOPE=self.registration.scope,BASE=new URL(SCOPE).pathname;
const FIRST=["manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/apple-touch-icon.png","fonts/poppins-300-latin.woff2","fonts/poppins-400-latin.woff2","fonts/poppins-500-latin.woff2","fonts/poppins-600-latin.woff2"];
/* Eine umgeleitete Antwort darf nicht als Seite ausgeliefert werden: nur dann neu verpacken (ohne die Angaben zur Übertragung,
   die zum neu verpackten Inhalt nicht mehr passen). Sonst bleibt die Antwort, wie sie vom Server kam. */
async function clean(res){
 if(!res.redirected)return res;
 const h=new Headers(res.headers);h.delete("content-encoding");h.delete("content-length");
 return new Response(await res.blob(),{status:res.status,statusText:res.statusText,headers:h});
}
/* Arbeit, die nach der Antwort fertig werden darf: der Service Worker bleibt so lange wach. Klappt das Anmelden nicht,
   läuft sie trotzdem (und die Antwort an die Seite ist davon nie betroffen). */
const later=(e,p)=>{try{e.waitUntil(p)}catch(x){}};
const buildOf=t=>+((/name="app-build" content="(\d+)"/.exec(t)||[])[1])||0;
/* Startseite merken, aber nie eine ältere über eine neuere: kurz nach einem Update liefert der Zwischenspeicher von GitHub
   unter der einfachen Adresse manchmal noch ein paar Minuten die alte Seite. */
const tag=r=>r.headers.get("etag")||"";
async function keep(res){
 try{
  if(!res.ok||res.type!=="basic")return;
  const c=await caches.open(APP),old=await c.match(SCOPE);
  /* unverändert (gleiche Kennung vom Server): nichts zu tun */
  if(old&&tag(old)&&tag(old)===tag(res)){try{if(res.body)res.body.cancel()}catch(x){}return}
  const cp=await clean(res),nb=buildOf(await cp.clone().text()),ob=old?buildOf(await old.text()):0;
  if(!nb||nb>=ob)await c.put(SCOPE,cp);
 }catch(x){}
}
/* Startseite frisch holen und merken. q: Zusatz zur Adresse (?u=…), damit sicher die neueste Fassung kommt */
async function update(q){
 const res=await fetch(SCOPE+(typeof q==="string"?q:""),{cache:"no-cache"});
 await keep(res.clone());
 return res;
}
self.addEventListener("install",e=>{
 e.waitUntil((async()=>{
  await update();
  /* der Rest darf fehlen (wird beim ersten Gebrauch nachgeholt) */
  const c=await caches.open(LIB);
  await Promise.all(FIRST.map(f=>c.add(f).catch(()=>{})));
  await self.skipWaiting();
 })());
});
self.addEventListener("activate",e=>{
 e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==APP&&k!==LIB).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
/* zuerst aus dem Speicher, sonst aus dem Netz und merken */
async function cacheFirst(r){
 const c=await caches.open(LIB),m=await c.match(r);
 if(m)return m;
 const res=await fetch(r);
 if(res.ok)c.put(r,res.clone()).catch(()=>{});
 return res;
}
/* zuerst aus dem Netz (und merken), ohne Verbindung der letzte Stand */
async function netFirst(e,r,key){
 try{
  const res=await fetch(r);
  if(res.ok&&res.type==="basic"){
   const cp=res.clone();
   later(e,key===SCOPE?keep(cp):caches.open(APP).then(async c=>c.put(key,await clean(cp))).catch(()=>{}));
  }
  return res;
 }catch(x){
  const m=await caches.match(key);
  if(m)return m;
  throw x;
 }
}
async function shell(e,u){
 /* ?u=… (Update anwenden): immer frisch aus dem Netz */
 if(!/[?&]u=/.test(u.search)){
  const m=await caches.match(SCOPE);
  if(m){
   later(e,new Promise(r=>setTimeout(r,2500)).then(()=>update()).catch(()=>{}));
   return m;
  }
 }
 try{return await update(u.search)}
 catch(x){const m=await caches.match(SCOPE);if(m)return m;throw x}
}
self.addEventListener("fetch",e=>{
 const r=e.request;
 if(r.method!=="GET")return;
 const u=new URL(r.url);
 if(u.origin!==location.origin){if(LIBS.test(r.url))e.respondWith(cacheFirst(r));return}
 if(!u.pathname.startsWith(BASE))return;
 const path=u.pathname.slice(BASE.length);
 /* Update-Suche und der Service Worker selbst: immer aus dem Netz */
 if(path==="version.json"||path==="sw.js")return;
 if(path===""||path==="index.html"){
  if(r.mode==="navigate")e.respondWith(shell(e,u));
  else e.respondWith(netFirst(e,r,SCOPE));
  return;
 }
 if(STATIC.test(u.pathname)){e.respondWith(cacheFirst(r));return}
 e.respondWith(netFirst(e,r,u.origin+u.pathname));
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
