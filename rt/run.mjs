process.on("unhandledRejection",e=>console.log("UNH",e&&e.stack));process.on("uncaughtException",e=>console.log("UNC",e&&e.stack));
import {createRequire} from "module";const require=createRequire(import.meta.url);
const C=require("./chain.cjs");const mod=await import("./sw.mjs");
const env={PROXY:{fetch:async()=>new Response("{}",{status:200})}};
C.setCC("AT");const lok=C.lokModels(),ruc=C.rucOn();const ms=(ruc?["dwd_icon_d2_ruc_native"]:[]).concat(lok,["ecmwf_ifs"]);
console.log("lok",lok,"ruc",ruc);
const B="https://api.open-meteo.com/v1/forecast?latitude=48.1627&longitude=14.2419&timezone=auto&forecast_days=7";
const full="&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_direction_10m,surface_pressure,is_day,cloud_cover,wind_gusts_10m&hourly=temperature_2m,precipitation_probability,weather_code,precipitation,wind_speed_10m,wind_gusts_10m,snowfall,cloud_cover,cloud_cover_low,relative_humidity_2m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,sunrise,sunset,uv_index_max";
let raw;try{raw=await (await fetch(B+full+"&models="+ms.concat(["best_match"]).join(","))).json()}catch(e){console.log("raw",e.stack)}
const sk=JSON.parse(await (await mod.default.fetch(new Request("https://x/bf/sk?la=48.167&lo=14.246&m="+ms.join(","),{headers:{Cookie:"wt=a.b"}}),env)).text());
const pp=JSON.parse(await (await mod.default.fetch(new Request("https://x/bf/pp?la=48.167&lo=14.246",{headers:{Cookie:"wt=a.b"}}),env)).text());
console.log("sk",JSON.stringify(sk));const fs=await import("fs");fs.mkdirSync("gs3",{recursive:true});fs.writeFileSync("gs3/main.json",JSON.stringify(raw));fs.writeFileSync("gs3/sk.json",JSON.stringify(sk));fs.writeFileSync("gs3/pp.json",JSON.stringify(pp));console.log("pp",JSON.stringify(pp).slice(0,200));
try{const j=C.omChain(raw,lok,ruc,sk);console.log("omChain ok",j.hourly.temperature_2m.slice(0,5),j.src);C.bfProb(j,pp);console.log("bfProb ok",j.hourly.precipitation_probability.slice(19,26),j.daily.precipitation_probability_max);
 global.Date=Date;console.log("tips",JSON.stringify(C.tipFacts(j)));}catch(e){console.log("FEHLER",e.stack)}
