const lg=await fetch("https://maps.dwd.de/geoserver/dwd/wms?request=GetLegendGraphic&format=application/json&layer=dwd:Icon-eu_reg00625_fd_sl_TOTPREC01H");const j=await lg.json();
console.log(JSON.stringify(j.Legend[0].rules[0].symbolizers[0].Raster.colormap.entries.map(e=>[e.quantity,e.color,e.opacity||""])));
