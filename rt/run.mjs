const B="https://dataset.api.hub.geosphere.at/v1/timeseries/forecast/nwp-v2-1h-1km?lat_lon=48.233,14.188&lat_lon=47.79,13.0&parameters=2t,10u,10v&output_format=geojson";
for(const o of [0,2,5,8,11,14,16,20]){const t0=Date.now();try{const r=await fetch(B+"&forecast_offset="+o);const t=await r.text();let j=null;try{j=JSON.parse(t)}catch(e){}
 console.log("offset",o,r.status,Date.now()-t0+"ms",j&&j.reference_time,j&&j.timestamps&&j.timestamps[0],j&&j.timestamps&&j.timestamps.length,j&&j.features&&j.features.length,j?"":t.slice(0,150))}catch(e){console.log(o,"ERR",String(e))}}
