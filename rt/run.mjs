const r=await fetch("https://maps.dwd.de/geoserver/dwd/wms?service=WMS&version=1.3.0&request=GetCapabilities");const t=await r.text();console.log("status",r.status,t.length);
const names=[...t.matchAll(/<Layer[^>]*>\s*<Name>([^<]+)<\/Name>\s*<Title>([^<]*)<\/Title>/g)].map(m=>m[1]+" | "+m[2]);
console.log(names.filter(n=>/icon|Icon|ICON|RR|Nieder|prec|TOT_PREC|Wawe|ww/i.test(n)).slice(0,60).join("\n"));
const i=t.indexOf("Icon");console.log(t.slice(i-200,i+1500).replace(/\s+/g," ").slice(0,1500));
