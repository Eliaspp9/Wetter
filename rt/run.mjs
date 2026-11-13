const s=await (await fetch("https://open-meteo.com/_app/immutable/nodes/73.sT-EGFx_.js")).text();
const i=s.indexOf("static/meta.json");console.log(s.slice(Math.max(0,i-1500),i+300));
const names=[...new Set(s.match(/["`'][a-z0-9_]*(icon|ecmwf|geosphere|ifs|aifs|claef|arome)[a-z0-9_]*["`']/g)||[])];console.log(names.slice(0,80).join(" "));
