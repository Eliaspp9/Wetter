let CC='AT';const ccNow=()=>CC;const place={lat:0,lon:0};
const LOK={AT:["geosphere_claef_austria","dwd_icon_d2_native"],DE:["dwd_icon_d2_native"],CH:["meteoswiss_icon_ch1","meteoswiss_icon_ch2"],LI:["meteoswiss_icon_ch1","meteoswiss_icon_ch2"],
 FR:["meteofrance_arome_france_hd"],MC:["meteofrance_arome_france_hd"],AD:["meteofrance_arome_france_hd","dmi_harmonie_arome_europe"],ES:["dmi_harmonie_arome_europe","meteofrance_arome_france_hd"],
 NL:["knmi_harmonie_arome_netherlands"],BE:["knmi_harmonie_arome_netherlands","dwd_icon_d2_native"],LU:["dwd_icon_d2_native"],
 DK:["dmi_harmonie_arome_europe"],IS:["dmi_harmonie_arome_europe"],NO:["metno_nordic"],SE:["metno_nordic"],FI:["metno_nordic"],EE:["metno_nordic","dmi_harmonie_arome_europe"],LV:["metno_nordic","dmi_harmonie_arome_europe"],LT:["metno_nordic","dmi_harmonie_arome_europe"],
 GB:["ukmo_uk_deterministic_2km"],IE:["ukmo_uk_deterministic_2km","dmi_harmonie_arome_europe"],IM:["ukmo_uk_deterministic_2km"],JE:["ukmo_uk_deterministic_2km"],GG:["ukmo_uk_deterministic_2km"],
 CZ:["chmi_aladin_cz_1km","dwd_icon_d2_native"],SK:["chmi_aladin_central_europe_2km","dwd_icon_d2_native"],PL:["dmi_harmonie_arome_europe","chmi_aladin_central_europe_2km"],HU:["chmi_aladin_central_europe_2km","geosphere_claef_austria"],
 SI:["dwd_icon_d2_native","geosphere_claef_austria"],HR:["chmi_aladin_central_europe_2km","dmi_harmonie_arome_europe"],BA:["chmi_aladin_central_europe_2km","dmi_harmonie_arome_europe"],RS:["chmi_aladin_central_europe_2km","dmi_harmonie_arome_europe"],
 ME:["chmi_aladin_central_europe_2km","dmi_harmonie_arome_europe"],XK:["chmi_aladin_central_europe_2km","italia_meteo_arpae_icon_2i"],AL:["chmi_aladin_central_europe_2km","italia_meteo_arpae_icon_2i"],MK:["chmi_aladin_central_europe_2km","italia_meteo_arpae_icon_2i"],
 RO:["chmi_aladin_central_europe_2km"],BG:["chmi_aladin_central_europe_2km"],MD:["chmi_aladin_central_europe_2km"],UA:["chmi_aladin_central_europe_2km"],TR:["chmi_aladin_central_europe_2km"],BY:["dmi_harmonie_arome_europe","chmi_aladin_central_europe_2km"],
 IT:["italia_meteo_arpae_icon_2i"],SM:["italia_meteo_arpae_icon_2i"],VA:["italia_meteo_arpae_icon_2i"],MT:["italia_meteo_arpae_icon_2i"],
 US:["ncep_rrfs_conus","ncep_rrfs_north_america","ncep_nbm_conus"],CA:["cmc_gem_hrdps_west","cmc_gem_hrdps","ncep_rrfs_north_america"],JP:["jma_msm"]};
/* Mexiko, Mittelamerika und Karibik: NOAA RRFS Nordamerika */
"MX CU PR DO HT JM BS BZ GT HN SV NI CR PA KY TC VI VG BM AG KN LC VC GD BB DM AW CW".split(" ").forEach(c=>{LOK[c]=["ncep_rrfs_north_america"]});
/* Deutschland, Österreich, Schweiz: für die nächsten 12 Stunden zuerst ICON-D2-RUC (rechnet jede Stunde neu) */
const RUC="dwd_icon_d2_ruc_native",RUCL=new Set(["AT","DE","CH","LI"]);
/* ohne Modell vor Ort bei Open-Meteo (geprüft): Portugal, Griechenland, Zypern – dort ECMWF */
const LOKN={geosphere_claef_austria:"GeoSphere Austria (C-LAEF)",dwd_icon_d2_native:"DWD ICON-D2",meteoswiss_icon_ch1:"MeteoSchweiz ICON-CH1",meteoswiss_icon_ch2:"MeteoSchweiz ICON-CH2",
 meteofrance_arome_france_hd:"Météo-France AROME HD",knmi_harmonie_arome_netherlands:"KNMI Harmonie",dmi_harmonie_arome_europe:"DMI Harmonie",metno_nordic:"MET Norway Nordic",
 ukmo_uk_deterministic_2km:"Met Office UK 2 km",ncep_rrfs_conus:"NOAA RRFS",ncep_rrfs_north_america:"NOAA RRFS Nordamerika",ncep_nbm_conus:"NOAA NBM",
 cmc_gem_hrdps:"Environment Canada HRDPS",cmc_gem_hrdps_west:"Environment Canada HRDPS West",jma_msm:"JMA MSM",chmi_aladin_cz_1km:"ČHMÚ Aladin 1 km",italia_meteo_arpae_icon_2i:"ItaliaMeteo ICON-2I",chmi_aladin_central_europe_2km:"ČHMÚ Aladin Mitteleuropa"};
/* Land noch unbekannt (erste Abfrage an einem neuen Punkt, z. B. beim Mitgehen per GPS): im Raum Österreich gleich die Reihe für
   Österreich nehmen; die Modelle liefern außerhalb ihres Gebiets nichts, dann springt das nächste ein */
const lokModels=()=>{const c=ccNow();if(c)return LOK[c]||[];const la=+place.lat,lo=+place.lon;return la>=46.3&&la<=49.1&&lo>=9.5&&lo<=17.2?LOK.AT:[]};
const rucOn=()=>{const c=ccNow();return c?RUCL.has(c):lokModels()===LOK.AT};
/* Antwort mit mehreren Modellen (Felder mit Modell-Endung) zu einer Vorhersage zusammensetzen. Je Stunde und Wert: bis Ende morgen
   die Reihe lok, dann ECMWF, dann Open-Meteo; ab übermorgen ECMWF, dann Open-Meteo. j._src merkt je Wert und Stunde die Quelle
   (L = vor Ort, E = ECMWF, B = Open-Meteo), damit die gelernten ECMWF-Korrekturen nur auf ECMWF-Werte kommen.
   Heute und morgen: Höchst-, Tiefstwert und Niederschlagssumme aus den zusammengesetzten Stunden. */
function omChain(j,lok,ruc,sk){
 const late=["ecmwf_ifs","best_match"],code=m=>m==="ecmwf_ifs"?"E":m==="best_match"?"B":m===RUC?"R":"L";
 const rk=sk&&sk.r&&Object.keys(sk.r).length>=2?sk.r:null,rmax=rk?Math.max(...Object.values(rk)):0;
 const rsort=L=>rk?L.map((m,i)=>({m,i,v:rk[m]!=null?rk[m]:rmax})).sort((a,b)=>b.v-a.v||a.i-b.i).map(x=>x.m):L;
 let all=lok.concat(late),withR=ruc?[RUC].concat(all):all;
 const RG=new Set(["precipitation","weather_code","snowfall","cloud_cover","cloud_cover_low","precipitation_probability"]);
 const allR=rsort(lok.concat(["ecmwf_ifs"])).concat(["best_match"]),withRR=ruc?rsort([RUC].concat(lok,["ecmwf_ifs"])).concat(["best_match"]):allR;
 const BW={temperature_2m:sk&&sk.t,wind_speed_10m:sk&&sk.w,wind_gusts_10m:sk&&sk.w};
 const mix=(n,W,L,i,s)=>{let sw=0,sv=0,best=null,bw=-1;const wm=Math.max(0,...Object.values(W));
  for(const m of L){if(m==="best_match")continue;const a=hv[n][m],v=a&&a[i];if(v==null)continue;const w=W[m]!=null?W[m]:wm||1;sw+=w;sv+=w*v;if(w>bw){bw=w;best=m}}
  if(!sw)return undefined;s[i]=code(best);return Math.round(sv/sw*10)/10};
 const split=S=>{const o={},r={};Object.keys(S||{}).forEach(k=>{const m=withR.find(x=>k.endsWith("_"+x));if(m){const n=k.slice(0,-m.length-1);(o[n]||(o[n]={}))[m]=S[k]}else r[k]=S[k]});return[o,r]};
 const H=j.hourly||{},D=j.daily||{},T=H.time||[],cut=(D.time&&D.time[2])||"9999",src={};let nL=0,nR=0;const lu={};
 const c0=j.current&&j.current.time?T.indexOf(String(j.current.time).slice(0,13)+":00"):-1,rcut=ruc&&c0>=0?(T[c0+12]||"9999"):"";
 const [hv,hr]=split(H),oh=hr;
 Object.keys(hv).forEach(n=>{const s=src[n]=new Array(T.length).fill(null);
  const W=BW[n]&&Object.keys(BW[n]).length>=2?BW[n]:null,rg=RG.has(n);
  oh[n]=T.map((t,i)=>{const L=t<rcut?(rg?withRR:withR):t<cut?(rg?allR:all):late;
   if(W&&t<cut){const v=mix(n,W,L,i,s);if(v!==undefined){if(n==="temperature_2m"){if(s[i]==="L"){const m=lok.find(x=>code(x)==="L"&&hv[n][x]&&hv[n][x][i]!=null);if(m)lu[m]=(lu[m]||0)+1;nL++}else if(s[i]==="R")nR++}return v}}
   for(const m of L){const a=hv[n][m];if(a&&a[i]!=null){s[i]=code(m);if(n==="temperature_2m"){if(s[i]==="L"){nL++;lu[m]=(lu[m]||0)+1}else if(s[i]==="R")nR++}return a[i]}}return null})});
 /* „jetzt“ liefert Open-Meteo ohne Modell-Endung, vom ersten Modell der Liste (also dem vor Ort); Lücken aus der Stunde */
 const [cv,cr]=split(j.current),oc=cr;
 Object.keys(cv).forEach(n=>{oc[n]=null;for(const m of withR){const v=cv[n][m];if(v!=null){oc[n]=v;if(n==="temperature_2m")src._cur=code(m);break}}});
 if(!Object.keys(cv).length&&(lok.length||ruc)&&oc.temperature_2m!=null)src._cur=ruc?"R":"L";
 if(oc.time){const ci=T.indexOf(String(oc.time).slice(0,13)+":00");if(ci>=0)Object.keys(oc).forEach(n=>{if(oc[n]==null&&oh[n]&&oh[n][ci]!=null)oc[n]=oh[n][ci]})}
 const [dv,dr]=split(D),od=dr;
 Object.keys(dv).forEach(n=>{od[n]=(D.time||[]).map((_,i)=>{for(const m of late){const a=dv[n][m];if(a&&a[i]!=null)return a[i]}return null})});
 if((nL||nR)&&od.time)[0,1].forEach(d=>{const day=od.time[d];if(!day)return;const ix=[];T.forEach((t,i)=>{if(t.slice(0,10)===day)ix.push(i)});
  if(ix.length<24||ix.some(i=>src.temperature_2m[i]!=="L"&&src.temperature_2m[i]!=="R"))return;
  const tt=ix.map(i=>oh.temperature_2m[i]);if(tt.every(v=>v!=null)){if(od.temperature_2m_max)od.temperature_2m_max[d]=Math.max(...tt);if(od.temperature_2m_min)od.temperature_2m_min[d]=Math.min(...tt)}
  if(od.precipitation_sum&&oh.precipitation){const pp=ix.map(i=>oh.precipitation[i]);if(pp.every(v=>v!=null))od.precipitation_sum[d]=Math.round(pp.reduce((a,b)=>a+b,0)*10)/10}});
 ["current_units","hourly_units","daily_units"].forEach(sec=>{const[u,ur]=split(j[sec]);Object.keys(u).forEach(n=>{for(const m of late.concat(lok))if(u[n][m]!=null&&u[n][m]!=="undefined"){ur[n]=u[n][m];break}});j[sec]=ur});
 j.hourly=oh;j.current=oc;j.daily=od;j._src=src;
 j.lok=nL?Object.keys(lu).sort((a,b)=>lu[b]-lu[a])[0]:null;j.ruc=nR>0;
 return j;
}
const lokName=j=>j&&j.lok?LOKN[j.lok]||j.lok:"";
const lokText=j=>(j.ruc?"die nächsten 12 Stunden DWD ICON-D2-RUC, ":"")+(j.lok?"heute und morgen "+lokName(j)+", ":"")+"danach ECMWF IFS (über Open-Meteo)";

module.exports={omChain,lokModels,lokName,lokText,rucOn,setCC:c=>{CC=c}};
function bfProb(j,pp){
 const H=j&&j.hourly,D=j&&j.daily;if(!H||!H.time||!pp||!Array.isArray(pp.p))return;
 const off=+j.utc_offset_seconds||0,P=H.precipitation_probability||(H.precipitation_probability=H.time.map(()=>null)),got={};
 let n=0;
 H.time.forEach((t,i)=>{const k=Math.round((Date.parse(t+":00Z")/1000-off-pp.t0)/3600),v=pp.p[k];if(k>=0&&v!=null){P[i]=v;n++;const d=t.slice(0,10);(got[d]||(got[d]=[])).push(v)}});
 if(!n)return;
 if(D&&D.time){const M=D.precipitation_probability_max||(D.precipitation_probability_max=D.time.map(()=>null));D.time.forEach((d,i)=>{const a=got[d];if(a&&a.length>=20)M[i]=Math.max(...a)})}
 j.ppEns=pp.src&&pp.src.length?pp.src:["Ensembles"];
}

module.exports.bfProb=bfProb;
function tipFacts(j){
 const H=j.hourly,D=j.daily;if(!H||!H.time)return[];
 const off=+j.utc_offset_seconds||0,nowS=new Date(Date.now()+off*1000).toISOString().slice(0,13)+":00";
 let i0=H.time.findIndex(t=>t>=nowS);if(i0<0)return[];
 const I=[];for(let i=i0;i<Math.min(H.time.length,i0+15);i++)I.push(i);
 const g=(n,i)=>H[n]?H[n][i]:null,hr=i=>String(+H.time[i].slice(11,13)),out=[];
 const wet=i=>(g("precipitation",i)||0)>=.2||(g("precipitation_probability",i)||0)>=60;
 const W=I.filter(wet);
 if(W.length){const snow=W.some(i=>(g("snowfall",i)||0)>0),a=W[0],b=W[W.length-1];
  out.push({f:(snow?"Schnee":"Regen")+(a===b?" um etwa "+hr(a)+" Uhr":" etwa von "+hr(a)+" bis "+hr(b)+" Uhr"),d:(snow?"Warm anziehen, es schneit":"Schirm mitnehmen: Regen")+(a===b?" um etwa "+hr(a)+" Uhr.":" etwa von "+hr(a)+" bis "+hr(b)+" Uhr.")})}
 const T=I.map(i=>g("temperature_2m",i)).filter(v=>v!=null),tmin=T.length?Math.min(...T):null,tmax=T.length?Math.max(...T):null;
 const ice=I.find(i=>(g("temperature_2m",i)??9)<=.5&&((g("precipitation",i)||0)>0||(g("relative_humidity_2m",i)||0)>=95));
 if(ice!=null)out.push({f:"Glättegefahr um etwa "+hr(ice)+" Uhr, Temperatur um 0 Grad",d:"Vorsicht, um etwa "+hr(ice)+" Uhr kann es glatt sein."});
 else if(tmin!=null&&tmin<=0){const k=I.find(i=>g("temperature_2m",i)===tmin);out.push({f:"Frost bis "+Math.round(tmin)+" Grad um etwa "+hr(k)+" Uhr",d:"Frost bis "+Math.round(tmin)+" Grad: Autoscheiben kratzen einplanen."})}
 const G=I.map(i=>g("wind_gusts_10m",i)||0),gm=Math.max(0,...G);
 if(gm>=60){const k=I[G.indexOf(gm)];out.push({f:"Sturmböen bis "+Math.round(gm)+" km/h um etwa "+hr(k)+" Uhr",d:"Sturmböen bis "+Math.round(gm)+" km/h: Lose Gegenstände draußen sichern."})}
 const th=I.find(i=>(g("weather_code",i)||0)>=95);if(th!=null)out.push({f:"Gewitter möglich ab etwa "+hr(th)+" Uhr",d:"Ab etwa "+hr(th)+" Uhr sind Gewitter möglich, dann besser drinnen bleiben."});
 const fg=I.find(i=>[45,48].includes(g("weather_code",i)));if(fg!=null)out.push({f:"Nebel um etwa "+hr(fg)+" Uhr",d:"Um etwa "+hr(fg)+" Uhr Nebel: vorsichtig fahren."});
 const uv=D&&D.uv_index_max?D.uv_index_max[0]:null;if(uv!=null&&uv>=5&&+H.time[i0].slice(11,13)<15)out.push({f:"UV-Index heute bis "+Math.round(uv),d:"UV-Index bis "+Math.round(uv)+": Sonnencreme nicht vergessen."});
 if(tmax!=null&&tmax>=30)out.push({f:"Hitze bis "+Math.round(tmax)+" Grad",d:"Bis "+Math.round(tmax)+" Grad: viel trinken und Mittagssonne meiden."});
 /* trockene Zeit am Tag (6 bis 21 Uhr), mindestens 3 Stunden, wenn sonst Regen kommt */
 if(W.length){let best=null,cur=null;for(const i of I){const h=+H.time[i].slice(11,13),ok=h>=6&&h<=21&&!wet(i);if(ok){cur=cur||{a:i,b:i};cur.b=i;if(!best||cur.b-cur.a>best.b-best.a)best={...cur}}else cur=null}
  if(best&&best.b-best.a>=2)out.push({f:"Trocken etwa von "+hr(best.a)+" bis "+hr(best.b+1)+" Uhr",d:"Trocken etwa von "+hr(best.a)+" bis "+hr(best.b+1)+" Uhr: gute Zeit für draußen."})}
 if(D&&D.temperature_2m_max&&D.temperature_2m_max[1]!=null&&D.temperature_2m_max[0]!=null){const d=D.temperature_2m_max[1]-D.temperature_2m_max[0];
  if(Math.abs(d)>=5)out.push({f:"Morgen "+(d<0?"kühler":"wärmer")+", Höchstwert "+Math.round(D.temperature_2m_max[1])+" Grad statt "+Math.round(D.temperature_2m_max[0])+" Grad",d:"Morgen deutlich "+(d<0?"kühler":"wärmer")+": bis "+Math.round(D.temperature_2m_max[1])+" Grad."})}
 return out.slice(0,5);
}

module.exports.tipFacts=tipFacts;
