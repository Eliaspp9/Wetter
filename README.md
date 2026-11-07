# Wetter

Persönliche Wetter-App im Stil von WetterOnline, als Webseite auf GitHub Pages:
https://eliaspp9.github.io/Wetter/

**Version 1.0**: die erste finale Version.

## Was die App kann

- **Wetter jetzt:** aktuelle Werte von KachelmannWetter (Super HD) oder Open-Meteo. Oben steht, woher die Werte kommen.
- **Regenradar:**
  - DWD 1 km mit 2 Stunden Radar-Vorhersage.
  - „Weltweit“: in Europa das OPERA-Radar über LibreWXR, Ersatz RainViewer.
  - Dazu Blitze (EUMETSAT MTG), Wolken, Warnungen und Niederschlagsart.
- **Vorhersage:**
  - Regen in den nächsten 2 Stunden.
  - Nächste 24 Stunden.
  - 7 Tage zum Aufklappen.
  - Trend bis 14 Tage, mit dem KI-Modell AIFS zum Vergleich.
- **Modellvergleich:**
  - Eine gemeinsame Linie aus ICON-D2, ICON-EU, ECMWF, GFS, KI-Modell und Kachelmann.
  - Die Modelle werden nach ihren Treffern der letzten 14 Tage gewichtet (Vergleich mit der nächsten Messstation).
  - Die Linie ist an den Ort angepasst.
- **Messwerte und Rückblick:** Messwerte der nächsten Station. Der Rückblick zeigt echte Messwerte, wenn eine Station in der Nähe ist.
- **Warnungen und Hinweise:**
  - Amtliche Warnungen (DWD, GeoSphere Austria).
  - Glätte-, Frost- und Schnee-Hinweise.
  - Alarm-Banner bei Regen in Kürze, Gewitter oder Unwetter.
- **Luft und Pollen**, Details mit Wind, UV und Sonne.
- **Wandanzeige fürs Tablet:**
  - Uhr, Wetter, großes Radar, Stunden und 7 Tage ohne Scrollen.
  - Nachts gedimmt, Bildschirm bleibt an.
  - Direkt aufrufen mit `?wand=1`.
- **Automatik:**
  - Aktualisiert sich alle 5 Minuten.
  - Bleibt bei kurzen Verbindungsproblemen auf dem letzten Stand.
  - Installiert neue Versionen selbst, wenn niemand das Gerät benutzt.
- **App und Offline:** als App auf dem Home-Bildschirm installierbar, offline mit dem letzten Stand.

## Cloudflare-Worker (`worker/kachelmann-proxy.js`)

Der Worker hält den Kachelmann-Schlüssel geheim, prüft die Anmeldung, verlängert sie (`/renew`) und verschickt Benachrichtigungen.

| Einstellung | Art | Inhalt |
|---|---|---|
| `ALLOWED_ORIGIN` | Text | `https://eliaspp9.github.io` |
| `LOGIN_USER` | Text | Benutzername |
| `LOGIN_PASS` | Secret | Passwort |
| `KACHELMANN_KEY` | Secret | API-Schlüssel von Kachelmann |
| `KEY_HEADER` | Text, optional | Standard `X-API-Key` |
| `SUBS` | KV-Bindung | für Benachrichtigungen, z. B. Namespace `wetter-push` |
| Cron-Trigger | Zeitplan | `*/10 * * * *` für Benachrichtigungen |

## Ändern und veröffentlichen

1. `index.html` bearbeiten.
2. `python3 tools/build.py` ausführen. Das berechnet die Sicherheitsregeln (CSP) neu und aktualisiert `wetter2.html`.
3. Die Zahl in `app-build` erhöhen, damit geöffnete Geräte das Update bemerken.
