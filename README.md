# Wetter

Persönliche Wetter-App im Stil von WetterOnline, als Webseite auf GitHub Pages:
https://eliaspp9.github.io/Wetter/

**Version 2.2**: mit Radar „Österreich“ (GeoSphere), Gewitter-Zugbahnen für ganz Österreich, allen Bergen Österreichs mit Schneehöhe und einer KI-Korrektur für den Ort.

## Was die App kann

- **Wetter jetzt:** aktuelle Werte von KachelmannWetter (Super HD) oder Open-Meteo. Oben steht, woher die Werte kommen.
- **Regenradar:**
  - DWD 1 km mit 2 Stunden Radar-Vorhersage.
  - „Weltweit“: in Europa das OPERA-Radar über LibreWXR, Ersatz RainViewer.
  - „Österreich“: INCA-Nowcast von GeoSphere Austria, 1 km, alle 15 Minuten, 3 Stunden voraus.
  - Dazu Blitze (EUMETSAT MTG), Wolken, Warnungen und Niederschlagsart.
  - **Zugbahnen von Gewittern und Starkregen:** starke Zellen werden in den DWD-Radarbildern der letzten 30 Minuten verfolgt, in Österreich zusätzlich mit dem Nowcast von GeoSphere. Linie mit Punkten alle 15 Minuten, Ankunftszeit beim Ort und Alarm.
- **Kartenansichten aus dem Wettermodell:**
  - Temperatur, Wind (animierte Strömungslinien), Böen, Wolken, Niederschlag, Neuschnee (zusammengezählt) und Luftdruck mit Isobaren.
  - Jetzt und Stunde für Stunde 2 Tage voraus, mit Abspielen.
  - Tippen auf die Karte zeigt die genauen Werte an der Stelle.
- **Vorhersage:**
  - Regen in den nächsten 2 Stunden.
  - Nächste 24 Stunden.
  - 7 Tage zum Aufklappen.
  - Trend bis 14 Tage, mit dem KI-Modell AIFS zum Vergleich.
- **Modellvergleich:**
  - Eine gemeinsame Linie aus ICON-D2, ICON-EU, ECMWF, GFS, KI-Modell und Kachelmann.
  - Die Modelle werden nach ihren Treffern der letzten 14 Tage gewichtet (Vergleich mit der nächsten Messstation).
  - Die Linie ist an den Ort angepasst.
- **KI-Korrektur für den Ort:** lernt aus 30 Tagen Vorhersage und Messung (Ridge-Regression nach Tageszeit, klarer Nacht, Sonne, Nebel, Wind), prüft sich an zurückgehaltenen Tagen und zeigt eine korrigierte 48-Stunden-Prognose, wenn sie besser ist.
- **Messwerte und Rückblick:** Messwerte der nächsten Station. Der Rückblick zeigt echte Messwerte, wenn eine Station in der Nähe ist.
- **Warnungen und Hinweise:**
  - Amtliche Warnungen (DWD, GeoSphere Austria).
  - Glätte-, Frost- und Schnee-Hinweise.
  - Alarm-Banner bei Regen in Kürze, Gewitter oder Unwetter.
- **Berge und Schneefallgrenze:**
  - Nullgradgrenze und Schneefallgrenze für den Ort, mit Verlauf über 3 Tage und der Höhe des Ortes.
  - Wetter auf Gipfeln in der Nähe, auf Gipfelhöhe umgerechnet.
  - Alle bekannten Berge und Skigebiete Österreichs zum Suchen und Merken (Stern).
  - Schneehöhe am Berg: Schneemodell SNOWGRID von GeoSphere Austria (1 km, täglich), sonst Wettermodell.
  - Kachel mit einem Knopf ein- und ausblendbar.
  - Hinweis bei Inversion (oben wärmer als im Tal, oft Nebel unten und Sonne oben).
- **Luft und Pollen**, Details mit Wind, UV, Sonne und Nullgradgrenze.
- **Wandanzeige fürs Tablet:**
  - Uhr, Wetter, großes Radar, Stunden und 7 Tage ohne Scrollen.
  - Die Knöpfe über der Karte blenden nach 4 Sekunden aus (auch am Handy), Antippen holt sie zurück.
  - Nachtanzeige von 22 bis 6 Uhr: große, gedämpfte Uhr, Temperatur und Hinweise; Antippen zeigt alles. Abschaltbar.
  - Bildschirm bleibt an.
  - Direkt aufrufen mit `?wand=1`.
- **Automatik:**
  - Aktualisiert sich jede Minute. Jede Quelle wird nur neu geladen, wenn sie Neues haben kann (Radar alle 5 Minuten, Wettermodell alle 15 Minuten, Warnungen jede Minute).
  - Bleibt bei kurzen Verbindungsproblemen auf dem letzten Stand.
  - Installiert neue Versionen selbst, wenn niemand das Gerät benutzt.
  - In der App auf dem Home-Bildschirm: zum Aktualisieren nach unten ziehen.
- **Wetter teilen:** erzeugt ein Bild mit Wetter, nächsten Stunden und 3 Tagen, zum Verschicken (z. B. WhatsApp) oder Speichern.
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
