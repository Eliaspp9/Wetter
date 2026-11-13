const r=await fetch("https://open-meteo.com/en/docs/model-updates");const t=await r.text();
const m=[...new Set(t.match(/https?:\/\/[a-z.-]*open-meteo\.com\/[^"'\s<>]*meta[^"'\s<>]*/g)||[])];console.log(r.status,t.length,m.slice(0,80).join("\n"));
const m2=[...new Set(t.match(/[a-z0-9_\/-]*meta\.json/g)||[])];console.log(m2.slice(0,40).join("\n"));
// look for JS chunk that builds the URL
const js=[...new Set(t.match(/\/_app\/[^"']+\.js/g)||[])];console.log("js",js.length);
for(const u of js.slice(0,40)){try{const s=await (await fetch("https://open-meteo.com"+u)).text();const k=s.match(/.{0,80}meta\.json.{0,80}/g);if(k)console.log(u,k.slice(0,4).join(" || "))}catch(e){}}
