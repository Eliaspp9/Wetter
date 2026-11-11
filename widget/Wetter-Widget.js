// Wetter-Widget für die iPhone-App „Scriptable“ (kostenlos im App Store).
// Zeigt Ort, Temperatur, Wetter, Höchst- und Tiefstwert und ob in den nächsten 2 Stunden Regen kommt.
// Daten: Open-Meteo. Ein Tipp auf das Widget öffnet deine Wetter-Seite.
// Fester Ort statt Standort: z. B.  const FEST = { lat: 48.29, lon: 13.51, name: "Zuhause" };
const FEST = null;
const SEITE = "https://eliaspp9.github.io/Wetter/";

let ort = FEST;
if (!ort) {
  try {
    Location.setAccuracyToThreeKilometers();
    const l = await Location.current();
    ort = { lat: l.latitude, lon: l.longitude, name: "Hier" };
    try {
      const g = await Location.reverseGeocode(l.latitude, l.longitude, "de");
      if (g && g[0]) ort.name = g[0].locality || g[0].subLocality || g[0].name || "Hier";
    } catch (e) {}
  } catch (e) {
    ort = { lat: 48.21, lon: 16.37, name: "Wien" };
  }
}

const url = "https://api.open-meteo.com/v1/forecast?latitude=" + ort.lat.toFixed(3) + "&longitude=" + ort.lon.toFixed(3) +
  "&current=temperature_2m,weather_code,is_day&minutely_15=precipitation,snowfall&forecast_minutely_15=9" +
  "&daily=temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto";

const w = new ListWidget();
w.url = SEITE;
w.setPadding(14, 14, 12, 14);
try {
  const j = await new Request(url).loadJSON();
  const c = j.current, day = c.is_day === 1, code = c.weather_code;
  const nacht = !day;
  const bg = new LinearGradient();
  bg.colors = code >= 51 ? [new Color("#28425F"), new Color("#4E6A8A")] : nacht ? [new Color("#0A1634"), new Color("#223668")] : [new Color("#0B54B2"), new Color("#2684E2")];
  bg.locations = [0, 1];
  w.backgroundGradient = bg;

  const sym = (k) => {
    if (k >= 95) return "cloud.bolt.rain.fill";
    if ([71, 73, 75, 77, 85, 86].includes(k)) return "cloud.snow.fill";
    if ((k >= 51 && k <= 67) || (k >= 80 && k <= 82)) return "cloud.rain.fill";
    if (k === 45 || k === 48) return "cloud.fog.fill";
    if (k === 3) return "cloud.fill";
    if (k === 2) return nacht ? "cloud.moon.fill" : "cloud.sun.fill";
    return nacht ? "moon.stars.fill" : "sun.max.fill";
  };

  const kopf = w.addText(ort.name);
  kopf.font = Font.semiboldSystemFont(13);
  kopf.textColor = Color.white();
  kopf.lineLimit = 1;
  w.addSpacer(4);

  const zeile = w.addStack();
  zeile.centerAlignContent();
  const t = zeile.addText(Math.round(c.temperature_2m) + "°");
  t.font = Font.lightSystemFont(40);
  t.textColor = Color.white();
  zeile.addSpacer(6);
  const img = zeile.addImage(SFSymbol.named(sym(code)).image);
  img.imageSize = new Size(30, 30);
  img.tintColor = Color.white();

  const d = j.daily;
  const hl = w.addText("H " + Math.round(d.temperature_2m_max[0]) + "°  T " + Math.round(d.temperature_2m_min[0]) + "°");
  hl.font = Font.systemFont(12);
  hl.textColor = new Color("#FFFFFF", 0.85);
  w.addSpacer();

  // Open-Meteo zählt rückwärts: der Wert zur Zeit t gilt für die Viertelstunde davor. Der erste Wert ist also schon vorbei,
  // der zweite ist die laufende Viertelstunde; ein Wert an der Stelle i beginnt zur Zeit i − 1.
  const m = j.minutely_15, P = (m.precipitation || []).slice(1), S = (m.snowfall || []).slice(1);
  const i = P.findIndex((x) => x != null && x >= 0.1);
  let txt;
  if (i === 0) txt = (S[0] || 0) * 0.7 >= P[0] * 0.5 ? "Es schneit" : "Es regnet";
  else if (i > 0) txt = ((S[i] || 0) * 0.7 >= P[i] * 0.5 ? "Schnee" : "Regen") + " ab " + m.time[i].slice(11, 16);
  else txt = "Trocken für 2 Std.";
  const r = w.addText(txt);
  r.font = Font.mediumSystemFont(12);
  r.textColor = Color.white();
  r.lineLimit = 1;
} catch (e) {
  w.backgroundColor = new Color("#0B54B2");
  const f = w.addText("Wetter gerade nicht erreichbar");
  f.font = Font.systemFont(12);
  f.textColor = Color.white();
}
w.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
Script.setWidget(w);
if (config.runsInApp) await w.presentSmall();
Script.complete();
