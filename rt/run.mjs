const mod=await import("./sw.mjs");
const env={PROXY:{fetch:async()=>new Response("{}",{status:200})}};
const P=[["Utzenaich",48.23,13.42,"geosphere_arome_austria,dwd_icon_d2,ecmwf_ifs"],["Wien",48.2,16.37,"geosphere_arome_austria,ecmwf_ifs"],["Berlin",52.52,13.4,"dwd_icon_d2,ecmwf_ifs"],["NewYork",40.71,-74.0,"ncep_hrrr_conus,gfs_seamless,ecmwf_ifs"],["Sydney",-33.87,151.2,"ecmwf_ifs,bom_access_global"],["Sahara",23,10,"ecmwf_ifs"]];
for(const [n,la,lo,m] of P){
 for(const ep of ["pp","sk"]){
  const t0=Date.now();const r=await mod.default.fetch(new Request("https://x/bf/"+ep+"?la="+la+"&lo="+lo+"&m="+m,{headers:{Cookie:"wt=abc.def"}}),env);
  const t=await r.text();let o;try{o=JSON.parse(t)}catch(e){o=t}
  const s=ep==="pp"&&o.p?{src:o.src,n:o.p.length,first24:o.p.slice(0,24).join(" "),max:Math.max(...o.p.filter(x=>x!=null))}:o;
  console.log(n,ep,r.status,(Date.now()-t0)+"ms",JSON.stringify(s).slice(0,500));
 }
}
