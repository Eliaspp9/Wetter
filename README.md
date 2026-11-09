# Wetter

Persönliche Wetter-App im Stil von WetterOnline, als Webseite auf GitHub Pages:
https://eliaspp9.github.io/Wetter/

**Version 2.12**: Lernende Korrektur der 24-Stunden- und 7-Tage-Temperaturen (Worker 1.5 lernt stündlich und dauerhaft).

**Version 2.11**: Himmel oben (Sonne, Wolken, Nebel) aus Messungen in der Nähe; Worker 1.4 liefert dafür auch die Bewölkung der Flughäfen.

**Version 2.10**: Blitze als eigene Symbole in jeder Zoomstufe (EUMETSAT liefert die Blitzflächen nur bis Zoom 7), Standortsuche mit sichtbarer Rückmeldung und Anleitung je Gerät.

**Version 2.9**: Temperatur oben an Messstationen ausgerichtet (AT GeoSphere, DE DWD, USA NOAA, sonst Flughäfen über den Worker 1.3).

**Version 2.8.1**: Titel der 2-Stunden-Kachel richtet sich nach dem Wetter (Sonne, Wolken, Regen, Schnee …).

**Version 2.8**: Eigenes Radar für Niederlande, Tschechien, Kanada und Japan (zusätzlich zu USA und Finnland); liegt der Ort dort, startet das Radar gleich damit.

**Version 2.7.1**: In Österreich Temperatur und Wind oben von GeoSphere Austria (INCA, 1 km), Radar Österreich holt neue Läufe sofort, roter Ortspunkt auch auf den Wetterkarten.

**Version 2.7**: Neue Reihenfolge, Warnungen aus ganz Europa und den USA auf Deutsch, eigenes Radar für die USA und Finnland. Dazu ECMWF als Wettermodell, bewegter Himmel oben, Sonne und Mond.

## Was die App kann

**Aufbau (von oben nach unten):** Kopf mit Wetter jetzt, „Keine Warnungen“ bzw. der wichtigsten Warnung und dem Messwert der nächsten Station → Warnungen (nur wenn es welche gibt) → Regen in den nächsten 2 Stunden → Gemessen → Regenradar → Nächste 24 Stunden (Kacheln oder Tabelle) → Glätte (nur bei Bedarf) → 7 Tage → Trend bis 14 Tage → Details mit Sonne und Mond → Luft und Pollen → Berge → „Für Wetter-Fans“ (eingeklappt: Modellvergleich, KI-Korrektur, Rückblick; geladen wird erst beim Öffnen) → Benachrichtigungen. Unten in der Leiste: Wetter, Radar, Stunden, 7 Tage, Mehr.

- **Bewegter Himmel oben:** Wolken ziehen in Windrichtung (bei mehr Wind schneller), dazu je nach Wetter Sonnenstrahlen, Mondlicht mit Sternen und Sternschnuppe, Nebelschwaden, Regen schräg im Wind (bei Starkregen dichter), Schnee in drei Ebenen und Blitze bei Gewitter. Alles läuft auf der Grafikeinheit, steht still, wenn der Kopf nicht sichtbar ist oder ruhige Bewegung eingestellt ist.
- **Wetter jetzt:** aktuelle Werte von KachelmannWetter (Super HD) oder vom ECMWF-Modell IFS (9 km, über Open-Meteo). Oben steht, woher die Werte kommen.
- **Temperatur oben:** an echten Messungen ausgerichtet. Grundwert ist in Österreich GeoSphere INCA (1 km), sonst das beste Regionalmodell von Open-Meteo. Dann rechnet die App aus, um wie viel dieser Grundwert an den Messstationen der Umgebung gerade danebenliegt (bis 8 Stationen, höchstens 50 km; nahe Stationen in ähnlicher Höhe zählen mehr), und verschiebt ihn entsprechend. Stationen: Österreich GeoSphere (TAWES), Deutschland DWD (über Bright Sky), USA NOAA/NWS, sonst Flughafen-Wettermeldungen (METAR über den Worker, ab Worker-Version 1.3). Geprüft am 9.11.2026 an 106 Stationen in Österreich unter 700 m (jede Station aus den anderen geschätzt): INCA allein im Mittel 1,2° daneben, Open-Meteo 1,2°, ECMWF 1,8°, INCA mit Stationen 0,7°. Ohne Station in der Nähe bleibt bei Kachelmann dessen Wert, sonst das Regionalmodell.
- **Lernende Korrektur (ab Worker 1.5):** Der Worker lernt jede Stunde für bis zu 6 Orte (Lieblingsorte und Standort, die in der App geöffnet werden), wie weit die Temperatur-Vorhersage dort danebenliegt: ECMWF mit 0 bis 7 Tagen Vorlauf (über die Previous-Runs-API von Open-Meteo) und Kachelmann (die Vorhersage, die die App alle 3 Stunden schickt). Als „Wahrheit“ dient die Temperatur am Ort aus bis zu 3 Messstationen in 30 km (GeoSphere, DWD, NOAA, Flughäfen) samt best_match-Höhenausgleich. Gelernt wird ein lineares Modell (normalisierter LMS-Algorithmus) mit den Merkmalen Tageszeit (8 × 3 Stunden), Bewölkung (3 Stufen), Vorlauf und Windstille. Es passt sich mit jeder Stunde ein Stück an und vergisst langsam, lernt also dauerhaft weiter und auch neue Jahreszeiten. Die App wendet die Korrektur auf die Stundenwerte und die Höchst-/Tiefstwerte an, aber erst ab 48 Vergleichen und nur, wenn der Fehler mit Korrektur (jeweils vor dem Lernschritt gemessen) kleiner ist als ohne. In „Nächste 24 Stunden“ und „7 Tage“ steht, wie viel gelernt wurde und wie weit die Vorhersage mit und ohne Korrektur danebenlag. Speicher: KV `kl:p:<id>` je Ort, `kl:s:<id>` Kachelmann-Vorhersage (3 Tage gültig); etwa 150 Schreibvorgänge am Tag.
- **Himmel oben (Sonne, Wolken, Nebel):** ebenfalls aus Messungen bis 35 km: GeoSphere-Stationen tagsüber über Sonnenscheindauer (SO) und Globalstrahlung (GLOW, im Verhältnis zur Strahlung bei klarem Himmel), DWD- und NOAA-Stationen und Flughäfen (METAR, ab Worker 1.4) über die gemeldete Bewölkung. Regen, Schnee und Gewitter kommen weiter aus der Vorhersage. Ohne Messung in der Nähe zählt Kachelmann bzw. das Regionalmodell. Am 9.11.2026 mittags (Hochnebel um Linz) trafen an 22 Stationen ECMWF 59 %, das ECMWF-KI-Modell 55 %, der Mittelwert aller Modelle 55 % und best_match (ICON-D2) 77 %.
- **Wettermodell ECMWF:** Vorhersage, 7 Tage, 14-Tage-Trend, Temperatur- und Windkarte, Bergwetter und die KI-Korrektur rechnen mit ECMWF IFS. Was ECMWF nicht liefert, kommt vom Standardmodell von Open-Meteo: UV-Index, Regen in den nächsten 2 Stunden (15-Minuten-Werte), Niederschlagsart sowie Nullgrad- und Schneefallgrenze (ICON des DWD).
- **Regenradar:**
  - DWD 1 km mit 2 Stunden Radar-Vorhersage.
  - „Weltweit“: in Europa das OPERA-Radar über LibreWXR, Ersatz RainViewer.
  - Radar des Landes: USA (NOAA NEXRAD über Iowa Environmental Mesonet, 5 Min.), Finnland (FMI, 5 Min.), Niederlande (KNMI, 5 Min.), Tschechien (ČHMÚ, 5 Min.), Kanada (Environment and Climate Change Canada, Regen und Schnee, 6 Min.) und Japan (JMA, 5 Min., mit 1 Stunde Vorhersage). Der Knopf erscheint nur, wenn der Ort dort liegt, und das Radar startet dann gleich damit (außer „Weltweit“ wurde selbst gewählt).
  - Geprüft und nicht nutzbar (Stand November 2026): Belgien (RMI sperrt Kartenabrufe), Schweiz, Schweden, Norwegen, Dänemark, Ungarn, Italien (nur Rohdaten oder andere Kartenprojektion), Großbritannien, Frankreich, Spanien (nur mit Schlüssel). Dort und überall sonst gibt es „Weltweit“, in Europa mit dem gemeinsamen Radarbild aller Wetterdienste (EUMETNET OPERA).
  - „Österreich“: INCA-Nowcast von GeoSphere Austria, 1 km, alle 15 Minuten, 3 Stunden voraus. GeoSphere braucht für eine Antwort oft ein paar Sekunden, manchmal eine halbe Minute: die App wartet bis zu 90 Sekunden, zeigt solange einen Hinweis, behält den letzten Stand und versucht es nach einem Fehlschlag in einer Minute wieder. Ein neuer Lauf ist 17 bis 21 Minuten nach seiner Startzeit abrufbar: ab dann schaut die App alle 2 Minuten in der kleinen Beschreibung des Datensatzes (`/metadata`, 1,6 kB) nach und lädt das große Bild erst, wenn dort ein neuerer Lauf steht. „Jetzt“ rückt jede Viertelstunde von selbst weiter. Das erste Bild ist die letzte Messung, danach folgt die Vorhersage.
  - Dazu Blitze (EUMETSAT MTG Lightning Imager: die App holt die Blitzflächen selbst in etwa 2,4 km Auflösung, fasst sie zu Gewitterzellen zusammen und zeichnet kleine Blitzsymbole, in jeder Zoomstufe gleich groß; nah herangezoomt zusätzlich ein weicher gelber Schleier), Wolken, Warnungen und Niederschlagsart.
  - **Zugbahnen von Gewittern und Starkregen:** starke Zellen werden in den DWD-Radarbildern der letzten 30 Minuten verfolgt, in Österreich zusätzlich mit dem Nowcast von GeoSphere. Linie mit Punkten alle 15 Minuten, Ankunftszeit beim Ort und Alarm.
- **Kartenansichten aus dem Wettermodell:**
  - Temperatur, Wind (animierte Strömungslinien), Böen, Wolken, Niederschlag, Neuschnee (zusammengezählt) und Luftdruck mit Isobaren.
  - Jetzt und Stunde für Stunde 2 Tage voraus, mit Abspielen.
  - Tippen auf die Karte zeigt die genauen Werte an der Stelle.
- **Vorhersage:**
  - Die nächsten 2 Stunden: der Titel zeigt, was kommt (Regen, Schnee, Schneeregen, Gewitter) oder sonst, wie der Himmel gerade ist (Sonne, Sonne und Wolken, Klarer Himmel, Ein paar Wolken, Wolken, Nebel), jeweils mit passendem Symbol.
  - Nächste 24 Stunden.
  - 7 Tage zum Aufklappen und Trend bis 14 Tage: überall vom ECMWF-Modell. Kachelmann gibt es an deinen Kachelmann-Standorten für das Wetter jetzt und die nächsten 24 Stunden.
  - Beim Trend das KI-Modell AIFS zum Vergleich.
- **Modellvergleich:**
  - Eine gemeinsame Linie aus ICON-D2, ICON-EU, ECMWF, GFS, KI-Modell und Kachelmann.
  - Die Modelle werden nach ihren Treffern der letzten 14 Tage gewichtet (Vergleich mit der nächsten Messstation).
  - Die Linie ist an den Ort angepasst.
- **KI-Korrektur für den Ort:** lernt aus 30 Tagen Vorhersage und Messung (Ridge-Regression nach Tageszeit, klarer Nacht, Sonne, Nebel, Wind), prüft sich an zurückgehaltenen Tagen und zeigt eine korrigierte 48-Stunden-Prognose, wenn sie besser ist.
- **Messwerte und Rückblick:** Messwerte der nächsten Station. Der Rückblick zeigt echte Messwerte, wenn eine Station in der Nähe ist.
- **Warnungen und Hinweise:**
  - Amtliche Warnungen (DWD, GeoSphere Austria). In anderen Ländern Europas von MeteoAlarm (über den Worker, Regionen über die Grenzen von MeteoAlarm, CC BY 4.0 EUMETNET, © EuroGeographics), in den USA vom National Weather Service. Was nicht auf Deutsch vorliegt, wird automatisch übersetzt (MyMemory) und 7 Tage gemerkt.
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
- **Sonne und Mond:** Sonnenbogen mit Auf- und Untergang, dazu Mondphase als Bild, wie viel beleuchtet ist, Mondauf- und -untergang und die nächsten Termine für Neumond und Vollmond (eigene Rechnung, genau auf wenige Minuten bzw. Stunden).
- **Wandanzeige fürs Tablet:**
  - Uhr, Wetter, großes Radar, Stunden und 7 Tage ohne Scrollen.
  - Warnungen übersichtlich im Kopf: Art, Stufe (farbig) und wie lange sie gilt, dazu Glätte- und Frosthinweis. Ohne Warnung steht „Keine Warnungen“.
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
- **Flüssig bis 120 Hz:** Das Wettersymbol oben besteht aus Ebenen, die nur verschoben, gedreht oder überblendet werden. Das macht die Grafikeinheit allein, ohne dass die Seite neu zeichnet. Keine Unschärfe-Effekte über bewegten Inhalten. Radarbilder werden vorab vorbereitet, Windlinien in jeder Bildwiederholung gezeichnet.
- **App und Offline:** als App auf dem Home-Bildschirm installierbar, offline mit dem letzten Stand.

## Sicherheit

- **Seite:** nur über HTTPS. Strenge Sicherheitsregel (CSP): Skripte laufen nur, wenn ihre Prüfsumme stimmt; von außen nur genau die Kartenbibliothek Leaflet 1.9.4 (ebenfalls mit Prüfsumme). Keine Formulare an fremde Seiten, keine Einbettung in fremde Seiten. Texte von Wetterdiensten werden vor der Anzeige entschärft.
- **Geheimnisse:** Kachelmann-Schlüssel und Passwort liegen nur bei Cloudflare (Secrets), nie im Code.
- **Anmeldung:** über den Worker. Signierte Tokens (30 Tage), Vergleich ohne Zeitunterschiede. Pro IP-Adresse höchstens 5 Fehlversuche in 15 Minuten, insgesamt höchstens 30, dann 15 Minuten Sperre. Ein neues Passwort meldet alle Geräte ab.
- **Zu tun für den Besitzer:** Zwei-Faktor-Anmeldung bei GitHub und Cloudflare einschalten. Ein Passwort verwenden, das nirgends sonst benutzt wird.

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
