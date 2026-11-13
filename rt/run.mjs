async function g(n,u,f){const t0=Date.now();try{const r=await fetch(u);const ct=r.headers.get("content-type");const b=Buffer.from(await r.arrayBuffer());console.log("==",n,r.status,ct,"cors="+r.headers.get("access-control-allow-origin"),b.length,Date.now()-t0+"ms");if(f)f(b.toString())}catch(e){console.log("==",n,"ERR",String(e).slice(0,100))}}
const lx=await (await fetch("https://api.librewxr.net/public/weather-maps.json")).json().catch(()=>null);
if(lx){const p=lx.radar.past.slice(-1)[0].path;await g("lx256",lx.host+p+"/256/8/138/89/0/1_0.png");await g("lx512",lx.host+p+"/512/8/138/89/0/1_0.png");await g("lx512z10",lx.host+p+"/512/10/553/357/0/1_0.png");console.log("lx keys",Object.keys(lx),"nowcast",(lx.radar.nowcast||[]).length)}
await g("kachel-doc","https://api.kachelmannwetter.com/v02/_doc.json",t=>{const m=t.match(/"\/[^"]*"\s*:/g)||[];console.log(m.join(" ").slice(0,2500))});
await g("ch-wms","https://wms.geo.admin.ch/?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetCapabilities&lang=de",t=>{console.log((t.match(/<Name>[^<]*(niederschlag|radar|precip)[^<]*<\/Name>/gi)||[]).join(" ").slice(0,800))});
await g("it-dpc","https://radar-api.protezionecivile.it/wide/product/findLastProductByType?type=SRI",t=>console.log(t.slice(0,300)));
await g("si-arso","https://meteo.arso.gov.si/uploads/probase/www/observ/radar/si0-rm.gif");
await g("pl-imgw","https://danepubliczne.imgw.pl/api/data/product/id/radar",t=>console.log(t.slice(0,200)));
await g("hu-met","https://www.met.hu/img/RccW/RccW20251113_2100.jpg");
await g("fr-mf","https://public-api.meteofrance.fr/public/DPRadar/v1/mosaiques/METROPOLE/observations/LAME_D_EAU/produit?maille=1000");
