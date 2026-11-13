const mod=await import("./sw.mjs");const env={PROXY:{fetch:async()=>new Response("{}",{status:200})}};
for(const [n,la,lo] of [["Noestlbach",48.163,14.242],["Innsbruck",47.26,11.39]]){const t0=Date.now();
const r=await mod.default.fetch(new Request("https://x/bf/sk?la="+la+"&lo="+lo+"&g=1&m=dwd_icon_d2_ruc_native,geosphere_claef_austria,dwd_icon_d2_native,ecmwf_ifs",{headers:{Cookie:"wt=a.b"}}),env);const j=await r.json();console.log(n,r.status,Date.now()-t0+"ms","r",JSON.stringify(j.r),"pe",JSON.stringify(j.pe),"ri",j.ri,"e",JSON.stringify(j.e))}
