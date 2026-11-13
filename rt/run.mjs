const P=[["Bregenz",47.50,9.75],["Innsbruck",47.26,11.39],["Lienz",46.83,12.77],["Salzburg",47.80,13.04],["Linz",48.30,14.29],["Nöstlbach",48.16,14.24],["Wien",48.21,16.37],["Graz",47.07,15.44],["Klagenfurt",46.62,14.31],["Eisenstadt",47.85,16.52],["Zwettl",48.60,15.17]];
const M=["meteoswiss_icon_ch2","meteoswiss_icon_ch1","meteofrance_arome_france_hd","meteofrance_arome_france","chmi_aladin_europe","chmi_aladin","chmi_aladin_central_europe","italia_meteo_arpae_icon_2i","dwd_icon_eu"];
for(const m of M){const u="https://api.open-meteo.com/v1/forecast?latitude="+P.map(p=>p[1]).join(",")+"&longitude="+P.map(p=>p[2]).join(",")+"&hourly=temperature_2m,precipitation&forecast_days=3&past_days=2&models="+m+"&timezone=GMT";
 try{const r=await fetch(u);const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
  if(!Array.isArray(j)){console.log(m,r.status,t.slice(0,120));continue}
  console.log(m,P.map((p,i)=>{const H=j[i].hourly,a=H.temperature_2m;const nn=a.filter(v=>v!=null).length;const past=a.slice(0,48).filter(v=>v!=null).length;return p[0]+":"+nn+"/"+past}).join(" "), "len",j[0].hourly.time.length)}catch(e){console.log(m,"ERR")}}
