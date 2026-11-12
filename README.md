# Wetter

Persönliche Wetter-App im Stil von WetterOnline, als Webseite auf GitHub Pages:
https://eliaspp9.github.io/Wetter/

**Version 1.0 (Build 1)** (mit Worker 1.0, Build 1): Alles durchgesehen, Fehler behoben, Start viel schneller. Einzelheiten unter „Schneller Start“, „Fehler, die mit 1.0 behoben wurden“ und beim Worker. Ab jetzt heißt die Version „1.0 (Build n)“; die Zählung davor (2.x) ist abgeschlossen.

**Version 2.19.1**: Radar Österreich: Stücke, die GeoSphere beim Veröffentlichen eines neuen Laufs noch vom alten Lauf liefert, werden nach Uhrzeit eingefügt statt verworfen (vorher fehlte dann ein Teil der Karte, z. B. alles südlich einer geraden Kante); nach 2 Minuten neu geholt. Niesel ab 0,03 mm/h zart sichtbar (GeoSphere liefert ab 0,01 mm je Viertelstunde). Ränder rund statt treppig (bikubische Glättung im WebGL-Bild). Hinweis unter der Karte, solange Teile laden oder fehlen. Zwei Abfragen gleichzeitig statt drei.

**Version 2.19**: Regenradar flüssig: Zwischenbilder mit der Bewegung des Regens (DWD 1 km und Österreich per WebGL, Weltweit und Länder überblendet und mitgeschoben), so viele Bilder pro Sekunde wie das Gerät zeigt (60 oder 120). Radar Österreich lädt den ganzen sichtbaren Ausschnitt in Stücken statt nur eines Kastens um die Kartenmitte. Behoben: Radar Österreich blieb stehen, wenn eine Antwort mitten im Laden abriss (das Zeitlimit galt nur bis zu den ersten Bytes).

**Version 2.18** (mit Worker 1.6): Regen in 2 Stunden aus dem Radar; Länder-Radare mit Bewegungs-Vorhersage; Gewitter-Trend und Hagel-Hinweis; Pollen-Tagebuch; Nebel-Satellitenbild; lernender Modellmix, Regenwahrscheinlichkeit, Wind/Böen und Hochnebel im Worker; KI-Übersetzung und KI-Push-Texte (Workers AI); Ruhezeiten aus dem Alltag.

**Version 2.17**: Regen oder Schnee im Radar an jeder Stelle (Feuchttemperatur aus dem Modellraster, mit Geländehöhe), statt einer Entscheidung für die ganze Karte.

**Version 2.16**: Radare von USA, Finnland, Niederlande, Kanada und Japan in den Farben der App (Pixel ausgelesen und über die Farbskala des Dienstes in mm/h zurückgerechnet), mit Wert beim Antippen.

**Version 2.15**: Standort-Symbol als Pfeil wie in Karten-Apps (gefüllt, wenn der Standort verwendet wird); Regenradar ab 12 mm/h Gelb/Orange/Rot (Legende bis 50 mm/h), Schnee ab 7 cm/h Rosa (bis 15 cm/h); Wert beim Antippen verschwindet nach 4 Sekunden.

**Version 2.14.1**: Standort-Hilfe am iPhone nennt „In-App-Browsing“ unter Systemdienste.

**Version 2.14**: Lieblingsorte repariert (Stern war bei gesuchten Orten unsichtbar), bis zu 30 Orte, Stern in der Suche, Bearbeiten (umbenennen, sortieren, entfernen); Standortabfrage beim Start ohne die in iOS 26 falsche Sperr-Meldung.

**Version 2.13**: Legende des Regenradars mit Mengen (Regen in mm/h, Schnee in cm/h), Menge an der Stelle beim Antippen oder Darüberfahren; KI-Modell AIFS auch bei „7 Tage“.

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

- **Lieblingsorte:** Stern neben dem Ortsnamen oder in der Trefferliste der Suche (speichert, ohne den Ort zu wechseln). Bis zu 30 Orte als Knopfreihe im Kopf (am Handy seitlich wischen). „Bearbeiten“: umbenennen, Reihenfolge ändern, entfernen. Gespeichert im Browser; die App vom Home-Bildschirm hat auf dem iPhone einen eigenen Speicher, dort also extra speichern.
- **Standort am iPhone (iOS 26/27):** Apps vom Home-Bildschirm bekommen den Standort nur, wenn unter Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Systemdienste „In-App-Browsing“ eingeschaltet ist (bestätigt am 9.11.2026 mit iOS 27.2; „Safari-Websites“ allein reicht nicht), danach das Symbol neu anlegen. Die Permissions-API meldet dort außerdem fälschlich „gesperrt“, deshalb fragt die App beim Start immer direkt. Notlösung: beim Hinzufügen „Als Web-App öffnen“ ausschalten, dann öffnet das Symbol die Seite in Safari.
- **Bewegter Himmel oben:** Wolken ziehen in Windrichtung (bei mehr Wind schneller), dazu je nach Wetter Sonnenstrahlen, Mondlicht mit Sternen und Sternschnuppe, Nebelschwaden, Regen schräg im Wind (bei Starkregen dichter), Schnee in drei Ebenen und Blitze bei Gewitter. Alles läuft auf der Grafikeinheit, steht still, wenn der Kopf nicht sichtbar ist oder ruhige Bewegung eingestellt ist.
- **Wetter jetzt:** aktuelle Werte von KachelmannWetter (Super HD) oder vom ECMWF-Modell IFS (9 km, über Open-Meteo). Oben steht, woher die Werte kommen.
- **Temperatur oben:** an echten Messungen ausgerichtet. Grundwert ist in Österreich GeoSphere INCA (1 km), sonst das beste Regionalmodell von Open-Meteo. Dann rechnet die App aus, um wie viel dieser Grundwert an den Messstationen der Umgebung gerade danebenliegt (bis 8 Stationen, höchstens 50 km; nahe Stationen in ähnlicher Höhe zählen mehr), und verschiebt ihn entsprechend. Stationen: Österreich GeoSphere (TAWES), Deutschland DWD (über Bright Sky), USA NOAA/NWS, sonst Flughafen-Wettermeldungen (METAR über den Worker, ab Worker-Version 1.3). Geprüft am 9.11.2026 an 106 Stationen in Österreich unter 700 m (jede Station aus den anderen geschätzt): INCA allein im Mittel 1,2° daneben, Open-Meteo 1,2°, ECMWF 1,8°, INCA mit Stationen 0,7°. Ohne Station in der Nähe bleibt bei Kachelmann dessen Wert, sonst das Regionalmodell.
- **Lernende Korrektur (ab Worker 1.5):** Der Worker lernt jede Stunde für bis zu 6 Orte (Lieblingsorte und Standort, die in der App geöffnet werden), wie weit die Temperatur-Vorhersage dort danebenliegt: ECMWF mit 0 bis 7 Tagen Vorlauf (über die Previous-Runs-API von Open-Meteo) und Kachelmann (die Vorhersage, die die App alle 3 Stunden schickt). Als „Wahrheit“ dient die Temperatur am Ort aus bis zu 3 Messstationen in 30 km (GeoSphere, DWD, NOAA, Flughäfen) samt best_match-Höhenausgleich. Gelernt wird ein lineares Modell (normalisierter LMS-Algorithmus) mit den Merkmalen Tageszeit (8 × 3 Stunden), Bewölkung (3 Stufen), Vorlauf und Windstille. Es passt sich mit jeder Stunde ein Stück an und vergisst langsam, lernt also dauerhaft weiter und auch neue Jahreszeiten. Die App wendet die Korrektur auf die Stundenwerte und die Höchst-/Tiefstwerte an, aber erst ab 48 Vergleichen und nur, wenn der Fehler mit Korrektur (jeweils vor dem Lernschritt gemessen) kleiner ist als ohne. In „Nächste 24 Stunden“ und „7 Tage“ steht, wie viel gelernt wurde und wie weit die Vorhersage mit und ohne Korrektur danebenlag. Speicher: KV `kl:p:<id>` je Ort, `kl:s:<id>` Kachelmann-Vorhersage (3 Tage gültig); etwa 150 Schreibvorgänge am Tag.
- **Himmel oben (Sonne, Wolken, Nebel):** ebenfalls aus Messungen bis 35 km: GeoSphere-Stationen tagsüber über Sonnenscheindauer (SO) und Globalstrahlung (GLOW, im Verhältnis zur Strahlung bei klarem Himmel), DWD- und NOAA-Stationen und Flughäfen (METAR, ab Worker 1.4) über die gemeldete Bewölkung. Regen, Schnee und Gewitter kommen weiter aus der Vorhersage. Ohne Messung in der Nähe zählt Kachelmann bzw. das Regionalmodell. Am 9.11.2026 mittags (Hochnebel um Linz) trafen an 22 Stationen ECMWF 59 %, das ECMWF-KI-Modell 55 %, der Mittelwert aller Modelle 55 % und best_match (ICON-D2) 77 %.
- **Wettermodell ECMWF:** Vorhersage, 7 Tage, 14-Tage-Trend, Temperatur- und Windkarte, Bergwetter und die KI-Korrektur rechnen mit ECMWF IFS. Was ECMWF nicht liefert, kommt vom Standardmodell von Open-Meteo: UV-Index, Regen in den nächsten 2 Stunden (15-Minuten-Werte), Niederschlagsart sowie Nullgrad- und Schneefallgrenze (ICON des DWD).
- **Regenradar:**
  - DWD 1 km mit 2 Stunden Radar-Vorhersage.
  - **Legende mit Mengen:** Regen in mm pro Stunde (0,1 bis 12 in Blau, ab 12 harter Wechsel auf Gelb, Orange bis 25, Rot ab 50), Schnee in cm pro Stunde (0,1 bis 7 in Lila, darüber Rosa bis 15) (aus 1 mm Wasser werden etwa 0,7 cm, wie bei Open-Meteo). Bei „Weltweit“ passt sich die Legende an die Farben von LibreWXR/RainViewer an („Universal Blue“, nach Radarecho in dBZ, umgerechnet mit Z = 200·R^1,6 für Regen und Z = 2000·R² für Schnee, also ungefähr). Beim Radar eines Landes steht dort nur, dass die Farben vom Wetterdienst kommen.
  - **Regen oder Schnee an jeder Stelle** (DWD 1 km, Österreich, Radare der Länder): Temperatur und Luftfeuchte vom Wettermodell (Open-Meteo, aktuelle Werte, 11 × 9 Punkte über den Kartenausschnitt, alle 15 Minuten) → Feuchttemperatur (Stull 2011) → auf Meereshöhe (0,55 °C je 100 m) → an jeder Stelle mit ihrer Höhe zurück. Höhe aus dem Geländemodell AWS Terrain Tiles (Terrarium, Zoom 8, etwa 400 m), nur geladen, wenn im Ausschnitt je nach Höhe beides möglich ist und höchstens 24 Kacheln nötig sind; sonst die Höhe der Modellpunkte. Feuchttemperatur bis 1 °C = Schnee. Ohne Raster gilt wie früher die Temperatur am Ort für die ganze Karte. Kanada liefert Schnee selbst, die Modellprognose nimmt den Schneefall des Modells, „Weltweit“ färbt selbst. Bei Inversionen (kalte Täler, milde Berge) kann die Höhenrechnung danebenliegen.
  - **Menge an einer Stelle:** Antippen (oder mit der Maus darüberfahren) zeigt bei DWD 1 km, „Österreich“ und der Prognose aus dem Wettermodell die Menge dort, z. B. „2,4 mm/h · leichter Regen“ oder „0,8 cm/h · mäßiger Schneefall“ (Stufen: Regen bis 2,5 / 10 / 25 / 50 mm/h, Schnee bis 0,5 / 1,5 / 5 cm/h). Beim Abspielen läuft der Wert mit; das Fenster schließt nach 4 Sekunden. Die Bilder von „Weltweit“ und den Radaren der Länder lassen sich im Browser nicht auslesen (die Server erlauben das nicht, geprüft am 9.11.2026), dort gibt es nur die Legende.
  - „Weltweit“: in Europa das OPERA-Radar über LibreWXR, Ersatz RainViewer.
  - Radar des Landes: USA (NOAA NEXRAD über Iowa Environmental Mesonet, 5 Min.), Finnland (FMI, 5 Min.), Niederlande (KNMI, 5 Min.), Tschechien (ČHMÚ, 5 Min.), Kanada (Environment and Climate Change Canada, Regen und Schnee, 6 Min.) und Japan (JMA, 5 Min., mit 1 Stunde Vorhersage). Der Knopf erscheint nur, wenn der Ort dort liegt, und das Radar startet dann gleich damit (außer „Weltweit“ wurde selbst gewählt).
  - **In den Farben der App:** USA, Finnland, Niederlande, Kanada und Japan erlauben das Auslesen ihrer Bilder (CORS). Jede Kachel wird gelesen, jede Farbe über die Farbskala des Dienstes in mm/h zurückgerechnet und in den Farben der App neu gemalt; die Werte bleiben für das Antippen an der Kachel. Farbskalen: IEM NEXRAD n0q (256 Farben = 0,5 dBZ, umgerechnet mit Z = 200·R^1,6 bzw. Schnee Z = 2000·R²), FMI (SLD-Verlauf), KNMI und MSC GeoMet (aus der Legende abgetastet; am 9.11.2026 gegen echte Kacheln geprüft, alle Bildpunkte passen), JMA (8 Stufen, Antippen zeigt die Stufe). Schnee: Kanada liefert ihn eigens in cm/h, sonst entscheidet wie beim DWD die Temperatur am Ort. Tschechien und „Weltweit“ sperren das Auslesen und bleiben in den Originalfarben.
  - Geprüft und nicht nutzbar (Stand November 2026): Belgien (RMI sperrt Kartenabrufe), Schweiz, Schweden, Norwegen, Dänemark, Ungarn, Italien (nur Rohdaten oder andere Kartenprojektion), Großbritannien, Frankreich, Spanien (nur mit Schlüssel). Dort und überall sonst gibt es „Weltweit“, in Europa mit dem gemeinsamen Radarbild aller Wetterdienste (EUMETNET OPERA).
  - „Österreich“: INCA-Nowcast von GeoSphere Austria, 1 km, alle 15 Minuten, 3 Stunden voraus. Geladen wird der ganze sichtbare Ausschnitt (plus 12 % Rand), soweit GeoSphere Daten hat (Österreich und ein Streifen rundherum): größere Ausschnitte in Stücken bis 25.000 km² (je etwa 6 MB), drei gleichzeitig, die Kartenmitte zuerst; beim Verschieben werden nur fehlende Stücke nachgeladen. Die Punkte von GeoSphere kommen in ein Raster in Web-Mercator (Zellen 1,08 km, einzelne Lücken aus den Nachbarn gefüllt). GeoSphere braucht für eine Antwort oft ein paar Sekunden, manchmal eine halbe Minute: die App wartet bis zu 90 Sekunden (bis die ganze Antwort da ist), zeigt solange einen Hinweis, behält den letzten Stand und versucht es nach einem Fehlschlag wieder (fehlende Stücke mit wachsender Pause bis 5 Minuten). Hängt eine Abfrage länger als 2 Minuten, wird sie vergessen und neu gestartet. Ein neuer Lauf ist 17 bis 21 Minuten nach seiner Startzeit abrufbar: ab dann schaut die App alle 2 Minuten in der kleinen Beschreibung des Datensatzes (`/metadata`, 1,6 kB) nach und lädt die großen Daten erst, wenn dort ein neuerer Lauf steht; der alte Lauf bleibt sichtbar, bis der neue ganz da ist. Ist der neueste Lauf von GeoSphere älter als 50 Minuten, steht das unter der Karte. „Jetzt“ rückt jede Viertelstunde von selbst weiter. Das erste Bild ist die letzte Messung, danach folgt die Vorhersage.
  - **Flüssiges Abspielen:** Die Zeitleiste läuft stufenlos (ein Radarbild alle 0,55 Sekunden), gezeichnet wird bei jedem Bild des Bildschirms (requestAnimationFrame). DWD 1 km und Österreich: WebGL; für je zwei Radarbilder wird gesucht, wohin der Regen gezogen ist (Blockvergleich auf einem gröberen Raster, Ausreißer gegen den Median, geglättet), daraus rechnet die Grafikkarte die Zwischenbilder. Ohne WebGL wird überblendet. Weltweit und Länder: die beiden Radarbilder werden überblendet und mit der Zugrichtung mitgeschoben (Höhenwind bzw. Bewegung im Radar). Der Schieber geht auch zwischen zwei Bilder; beim Loslassen und beim Anhalten springt er aufs nächste ganze Bild. Auf dem iPhone begrenzt Safari auf 60 Bilder pro Sekunde, außer unter Einstellungen → Apps → Safari → Erweitert → Feature Flags ist „Prefer Page Rendering Updates near 60fps“ aus.
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
  - Bei „7 Tage“ und beim Trend das KI-Modell AIFS des EZMW zum Vergleich (roter Strich unter dem Temperaturbalken, Werte beim Aufklappen eines Tages). Eine Abfrage für beide, eine Stunde gemerkt.
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
- **App und Offline:** als App auf dem Home-Bildschirm installierbar, startet aus dem Speicher (auch ohne Netz) und zeigt dann den letzten Stand.

## Schneller Start (ab 1.0)

Gemessen mit nachgestellter Netz-Verzögerung am zweiten Start (Ort Utzenaich, Radar Österreich): Wetter oben nach etwa 0,4 statt 1,1 Sekunden, Warnungen nach 0,9 statt 2,1 Sekunden, die an Messstationen ausgerichtete Temperatur nach 0,9 statt 3,4 Sekunden.

- **Seite aus dem Speicher:** Der Service Worker (`sw.js`) liefert die Startseite sofort aus dem Speicher und sieht 2,5 Sekunden später im Hintergrund nach, ob es eine neuere gibt (gilt ab dem nächsten Start). Aufrufe mit `?u=…` (Update anwenden) gehen immer ins Netz, und zwar mit diesem Zusatz in der Adresse, weil der Zwischenspeicher von GitHub unter der einfachen Adresse kurz nach einem Update noch die alte Seite liefern kann; aus demselben Grund ersetzt eine ältere Seite im Speicher nie eine neuere (verglichen wird `app-build`). Hat sich nichts geändert (gleiche Kennung vom Server), wird nichts neu gespeichert. `version.json` und `sw.js` werden nie gespeichert. Schriften, Symbole und Leaflet (feste Versionen) kommen zuerst aus dem Speicher (`wetter-lib-1`), die Startseite liegt in `wetter-app-1`.
- **Abrufe vorab („aufzeichnen und wiederholen“):** Die App merkt sich, welche Adressen sie in den ersten 6 Sekunden eines Starts abgerufen hat (`localStorage["wetter-pre"]`, höchstens 24, je Ort). Beim nächsten Start schickt ein kleines Skript ganz oben im `<head>` genau diese Abrufe los, noch bevor der Rest der Seite gelesen ist; die App übernimmt die Antworten (`net()`), statt selbst neu zu fragen. Wichtiges zuerst (Vorhersage, Kachelmann, Warnungen, Messwerte), der Rest 250 ms später und nur, wenn die App ihn nicht schon selbst geholt hat. Was im eigenen Zwischenspeicher noch frisch ist, wird nicht geholt. Nicht vorab: Adressen mit Datum oder Suchtext, das große Radar Österreich, Suche.
- **Letzter Stand sofort:** Ist die letzte Vorhersage für denselben Ort höchstens 2 Stunden alt (`localStorage["wetter-last"]`), wird sie sofort gezeigt und dann durch die frische ersetzt.
- **Alles gleichzeitig:** Kachelmann, Warnungen (Deutschland/Österreich, ohne erst auf das Land zu warten) und Messwerte starten zusammen mit der Vorhersage statt danach. Leaflet lädt schon im `<head>`.
- **Schrift ohne Google:** Poppins liegt im Ordner `fonts/` (lateinisch und erweitert, 300 bis 700, SIL Open Font License); die vier wichtigsten Dateien werden vorab geladen. Keine Verbindung mehr zu Google Fonts.
- **Update-Suche klein:** `version.json` (etwa 600 Bytes: Build, Version, Neuerungen) statt jedes Mal der ganzen Seite (etwa 130 kB gepackt). Ältere Geräte lesen weiter `app-build` aus der Seite.
- **Weniger Arbeit beim Start:** Die Bewegung des Regens fürs flüssige Radar wird in kleinen Stücken (höchstens 6 ms) und erst nach 3 Sekunden Ruhe oder beim Abspielen berechnet. Stundenkacheln werden nur neu gebaut, wenn sich etwas geändert hat. Der Worker wird nicht mehr bei jedem Start gefragt, ob er die Anmeldung verlängern kann (höchstens alle 12 Stunden), der Schlüssel für Benachrichtigungen wird gemerkt.
- **Wackelige Verbindung:** Schlägt ein Abruf sofort fehl (typisch direkt nach dem Zurückholen der App), wird er nach 0,7 und 2,5 Sekunden wiederholt. In den ersten 5 Sekunden nach dem Zurückholen wird ein Abruf, der nach 6 Sekunden noch keine Antwort hat, abgebrochen und neu gestellt. Zeitlimits gelten bis zum Ende der Antwort, nicht nur bis zu den ersten Bytes. Nach einem misslungenen Laden versucht es die App nach 8 und 20 Sekunden von selbst wieder.

## Adresse: Cloudflare statt GitHub Pages (seit 12.11.2026)

Die App liegt jetzt unter **https://wetter.elias-ziegler.workers.dev/** (Cloudflare-Worker `wetter`, nur Dateien, kein eigener Code; Einstellungen in `wrangler.jsonc`, was nicht mit hinaus soll in `.assetsignore`). Der Worker `wetter-proxy` lässt diese Adresse immer zu (`APP_ORIGINS`), dazu weiter `ALLOWED_ORIGIN`.
- Auf der alten Adresse bei GitHub zeigt die App einen Hinweis mit Knopf „Zur neuen Adresse“. Der Knopf meldet die Benachrichtigungen dort ab (sonst kämen sie doppelt) und nimmt Einstellungen und Lieblingsorte in der Adresse mit (`#umzug=…`, ohne Anmeldung und ohne Zwischenspeicher). Die neue Seite übernimmt sie ganz am Anfang und entfernt den Zusatz wieder.
- Veröffentlichen: Cloudflare ist mit dem Projekt verbunden (Workers Builds, seit 12.11.2026): Jeder Push auf `main` veröffentlicht die Seite von selbst (`npx wrangler deploy` mit `wrangler.jsonc`). Das funktioniert auch, wenn das Projekt privat ist. Der Worker `wetter-proxy` wird weiter getrennt hochgeladen.

## Regenradar: Rückblick, Modell danach, Schnee je Stelle, Weltweit darunter, gleiche Farben (12.11.2026)

- **Rückblick:** Radar Österreich zeigt vor „Jetzt“ bis zu 90 Minuten gemessenen Niederschlag (Messbilder der 5 Läufe davor, `forecast_offset` 1–5, je ein Bild; danach bringt jeder neue Lauf sein Messbild mit).
- **Modell danach:** Nach den 3 Stunden Radar-Vorhersage folgt das Wettermodell von GeoSphere (`nwp-v2-1h-1km`, 1 km, `tp` und `sf` in 0,001 mm je Stunde), stündlich bis etwa 12 Stunden ab jetzt, danach alle 3 Stunden bis 48 Stunden. Zeitleiste: „(Modell)“ mit Wochentag. Geladen im Hintergrund nach dem Radar, je Modelllauf einmal (alle 3 Stunden neu).
- **Schnee je Stelle:** INCA-Temperatur (`t2m`, 0,01 °C, 1 km, echtes Gelände), stündlich: Schnee bei höchstens 1 °C. Im Modellteil der Schneeanteil des Modells je Bild.
- **Weltweit darunter:** Außerhalb des Gebiets von GeoSphere liegt das Radar „Weltweit“ (LibreWXR) unter dem Radar Österreich (nächste Zeit, höchstens 10 Minuten daneben; bei Vorhersage und Modell nichts).
- **Gleiche Farben:** „Weltweit“ wird als Graustufen-Bild geholt (Farbschema 0 von RainViewer/LibreWXR: Grauwert = dBZ + 32), in mm/h umgerechnet und in den Farben der App neu gemalt; Antippen zeigt jetzt auch dort die Menge.
- **Regen-Benachrichtigung (Worker 1.0, Build 5):** in Österreich aus der Radar-Vorhersage von GeoSphere (INCA-Nowcast mit Zugrichtung), sonst wie bisher Open-Meteo.
- `radar-at.js` verarbeitet dafür drei Arten (`rr`, `t2m`, `tp`), auch Gitter in Längen/Breiten und Zeitangaben in Tagen.

## Genauestes Modell je Ort, KI-Modelle zum Vergleich (12.11.2026)

- **Heute und morgen** kommt die Vorhersage vom genauesten Modell vor Ort, je Land in Europa (Tabelle `LOK` in `index.html`, z. B. Österreich: GeoSphere C-LAEF, dann ICON-D2; Deutschland: DWD ICON-D2; Schweiz: MeteoSchweiz ICON-CH1/CH2; Frankreich: AROME HD; Skandinavien: MET Norway Nordic; Mittel- und Südosteuropa: ČHMÚ Aladin; Italien: ICON-2I). Ab übermorgen ECMWF IFS. Was ein Modell nicht rechnet (z. B. Regenwahrscheinlichkeit) oder wo es nicht hinreicht, kommt Stunde für Stunde vom nächsten in der Reihe (`omChain`). Portugal, Griechenland und Zypern haben bei Open-Meteo kein Modell vor Ort, dort ECMWF. Außerhalb Europas: USA (NOAA RRFS, RRFS Nordamerika, NBM), Kanada (HRDPS West, HRDPS), Mexiko, Mittelamerika und Karibik (RRFS Nordamerika), Japan (JMA MSM). In Österreich, Deutschland und der Schweiz für die nächsten 12 Stunden zuerst DWD ICON-D2-RUC (stündlich neu gerechnet). Geprüft am 12.11.2026 an 23 weiteren Orten. Geprüft am 12.11.2026 an 45 Orten. Die Quelle steht oben und bei den 7 Tagen.
- Die gelernten Korrekturen (Regenwahrscheinlichkeit, Wind, Hochnebel, Temperatur) wurden an ECMWF gelernt und gelten nur für Stunden, die von ECMWF kommen (`j._src`).
- **Modellmix (Lernen):** zusätzlich GeoSphere C-LAEF, ICON-D2 und die KI-Modelle KI DWD (AICON) und KI NOAA (AIGFS); der Worker lernt sie ab Worker 1.0 (Build 4) mit.
- **Modellvergleich (Wetter-Fans):** das Modell vor Ort, ICON-D2, ICON-EU (neue Namen, die alten enden am 30.11.2026), ECMWF, GFS und drei KI-Modelle (ECMWF AIFS, DWD AICON, NOAA AIGFS).

## Seite bei Cloudflare: eine Adresse, Anmeldung vor der App, Sicherheitsregeln (12.11.2026)

`site/worker.js` (Worker `wetter`, wird mit `wrangler.jsonc` bei jedem Push veröffentlicht) steht vor allen Dateien:
- **/api/…** geht über ein Service Binding (`PROXY`) an `wetter-proxy`. Die App nutzt auf der Cloudflare-Adresse `location.origin + "/api"` statt der Worker-Adresse: gleiche Adresse, daher keine CORS-Vorabanfragen mehr (vorher vor fast jeder Anfrage mit Anmeldung eine zusätzliche).
- **App nur nach Anmeldung:** `/` bzw. `index.html` gibt es nur mit gültigem Anmelde-Cookie `wt` (HttpOnly, Secure, SameSite=Strict, 30 Tage). Gesetzt wird es bei `/api/login` und `/api/renew`; Geräte, die schon vorher angemeldet waren, tauschen ihr Token einmal über `/api/session` (die App macht das beim Start, danach alle 12 Stunden). Ohne Cookie kommt `login.html` (mit `login.js`). Geprüft wird das Token beim Proxy (`/auth`), 10 Minuten gemerkt. Schriften, Symbole und die übrigen Dateien bleiben frei abrufbar. Abmelden löscht auch das Cookie (`/api/logout`).
- **Sicherheitsregeln vom Server** bei jeder Antwort: `X-Frame-Options: DENY` und `frame-ancestors 'none'` (keine Einbettung in fremde Seiten), HSTS, `nosniff`, Referrer-Policy, Permissions-Policy (nur Standort), Cross-Origin-Opener-Policy. Die Regeln in der Seite selbst (CSP-Meta) gelten weiter.
- Der Service Worker speichert nur echte App-Seiten (mit `app-build`), nie die Anmeldeseite, und lässt `/api/` und die Anmeldeseite in Ruhe.

## Radar Österreich: ganz Österreich auf einmal (1.0, Build 1, Stand 12.11.)

Statt des sichtbaren Ausschnitts in Stücken (Text, je etwa 6 MB, oft 10 bis 30 Sekunden pro Stück) holt die App das ganze Gebiet von GeoSphere (Österreich und ein Streifen rundherum, 701 × 431 Punkte, 13 Bilder) in einem Abruf als NetCDF: etwa 1 MB, 1 bis 2 Sekunden. GeoSphere erlaubt das, weil für NetCDF bis zu 10 Millionen Werte je Abruf gelten (Text: 1 Million).
- `radar-at.js` (Web Worker) lädt die Datei, packt sie mit `hdf5.min.js` aus (jsfive, gemeinfrei, mit pako inflate, MIT) und rechnet sie ins Raster der Karte um. Die App bleibt dabei flüssig.
- Werte in der Datei: Niederschlag in 0,01 mm je Viertelstunde, -999 = keine Daten; Zeit als „minutes since <erstes Bild>“. Geprüft: Wert für Wert gleich wie die Text-Antwort von GeoSphere.
- Der neue Stand erscheint erst, wenn er ganz da ist; bis dahin bleibt der alte stehen (keine Lücken mit geraden Kanten mehr). Zoomen und Verschieben laden nichts nach.
- Lässt sich die Datei nicht lesen, kommt für 6 Stunden der alte Weg in Stücken. Antwortet GeoSphere nicht, neuer Versuch nach 4, 10, 25 und dann 60 Sekunden.
- Die Anzeige bleibt „1.0 (Build 1)“: `app-build` ist 58, `BUILD0` in `index.html` wurde auf 57 gesetzt.

## Fehler, die mit 1.0 behoben wurden

- **Radar Österreich blieb nach dem Hintergrund stehen** („Stand vor 100 Minuten“): Die ersten Abrufe nach dem Zurückholen scheiterten oder hingen, die App wertete das als Ausfall von GeoSphere und versuchte es erst nach einer Minute wieder, und auch nur, wenn 20 Sekunden lang nichts angetippt wurde. Jetzt: sofortiger neuer Versuch (siehe oben), eigene Wiederholung nach 4, 10, 25 und 60 Sekunden, das Antippen bremst nach 3 Minuten ohne Aktualisierung nicht mehr, und ist der gezeigte Lauf älter als 45 Minuten, erscheint der neue schon mit dem ersten geladenen Stück. Solange geladen wird, steht das unter der Karte. Nachgestellt (100 Minuten im Hintergrund): vorher 64 bzw. 23 Sekunden bis zum neuen Bild, jetzt 8.
- **Regen in den nächsten 2 Stunden eine Viertelstunde zu spät:** Die 15-Minuten-Werte von Open-Meteo, GeoSphere und DWD sind Summen des Zeitraums *vor* dem Zeitstempel. App, Benachrichtigungen (Worker) und Widget haben den Wert dem Zeitraum danach zugeordnet. Jetzt stimmt „Regen ab ca. …“.
- **Benachrichtigungen:** Ein hängender Wetterdienst konnte den ganzen Durchlauf aufhalten (jetzt Zeitlimits, je Abo eigene Fehlerbehandlung, drei gleichzeitig). Der Zustand wird vor dem Senden gespeichert (kein doppeltes Senden nach einem Abbruch). Zwischen zwei Regen-Hinweisen liegen mindestens 90 Minuten.
- **Kleinigkeiten:** Update-Fenster war in der Wandanzeige von der Fehlermeldung verdeckt; Mengen in der Regen-Vorschau mit Komma; ungenutzter Code entfernt; doppelte Lern-Orte im Worker (zwei Einträge für fast dieselbe Stelle) entstehen nicht mehr.

## Lernen und KI (ab 2.18 / Worker 1.6)

Alles lernt laufend weiter (gleitende Mittel und Online-Regression, die langsam vergessen) und wirkt nur, wenn es laut ehrlicher Messung vor jedem Lernschritt besser trifft als ohne.

- **Regen in 2 Stunden aus dem Radar:** In Österreich GeoSphere-Nowcast (Mittel über den Ort und je 1 km rundherum), in Deutschland und den Grenzgebieten die DWD-Radar-Vorhersage (Mittel über etwa 3 × 3 km). Die Art (Regen/Schnee) vom Modell oder aus der Temperatur an der Stelle. Sonst wie bisher ICON.
- **Länder-Radare (USA, Finnland, Niederlande, Kanada):** Bewegung aus den Radarbildern selbst (Kreuzkorrelation des neuesten Bildes mit dem von vor etwa 15 Minuten auf einem 6-Pixel-Raster), das neueste Bild wird 60 Minuten weitergeschoben.
- **Gewitter-Trend:** Kern und Fläche jetzt gegen vor 15 Minuten (DWD) bzw. gegen den Nowcast in 15 bis 30 Minuten (GeoSphere): ↑ stärker (Kern +25 % oder Fläche +40 %), ↓ schwächer. Blitze im Umkreis machen eine Zelle zum Gewitter. Hagel möglich ab 60 mm/h oder bei starkem, nicht schwächer werdendem Gewitter mit Blitzen.
- **Pollen-Tagebuch:** Beschwerden 0 bis 3 je Tag mit den Pollenwerten des Tages, nur auf dem Gerät. Ridge-Regression mit Vergessen (Halbwertszeit 2 Jahre); ab 8 Einträgen: welche Pollen stören, persönliche Vorhersage, Markierung „stört dich“.
- **Nebel-Satellitenbild:** Knopf „Nebel“ auf der Karte, EUMETSAT MTG „Fog / Low Clouds RGB“.
- **Worker 1.6 lernt je Ort (höchstens 6, die zuletzt geöffneten):**
  - Modellmix Temperatur: ICON, ECMWF, GFS, KI-Modell AIFS mit 1 und 3 Tagen Vorlauf (Previous-Runs-API); Gewicht = 1 / quadratischer Fehler nach Abzug der Schieflage. Die App holt dann die vier Modelle und mischt (bis 36 h mit den 1-Tages-, danach mit den 3-Tages-Gewichten), wenn der Mix besser ist als ECMWF und als die bisherige Korrektur.
  - Regenwahrscheinlichkeit: 11 Stufen, wie oft es danach wirklich geregnet hat (Stationen: GeoSphere RR der letzten Stunde, DWD precipitation_60, NOAA, METAR-Wetter), mit Schrumpfung zur Vorhersage.
  - Wind und Böen: Faktor Messung/Vorhersage.
  - Hochnebel tagsüber: logistische Regression aus Bewölkung, tiefer Bewölkung, Luftfeuchte, Wind, Jahreszeit, Tageszeit; Wahrheit aus Sonnenschein/Strahlung (GeoSphere), Bewölkung (DWD, METAR, NOAA). Wo die Wahrscheinlichkeit ab 60 % liegt und das Modell Sonne zeigt, zeigt die App bedeckt und einen Hinweis.
  - Dafür merkt sich der Worker alle 6 Stunden die ECMWF-Vorhersage (36 h) und vergleicht 12 bis 30 Stunden später.
- **KI (Workers AI, Bindung `AI`):** Übersetzen der Warnungen anderer Länder mit Meta M2M100 (30 Tage gemerkt, sonst wie bisher MyMemory). Push-Texte formuliert ein kleines Sprachmodell aus festen Fakten; der Text wird nur genommen, wenn keine neue Zahl dazukommt, der Ort drinsteht und die Länge passt.
- **Ruhezeiten aus dem Alltag:** Die App zählt, zu welchen Stunden du sie öffnest (verblasst langsam). Zwischen 20 und 8 Uhr werden Stunden mit fast keiner Nutzung zu Ruhezeiten: keine Regen-Hinweise, Warnungen schon. Erst nach 7 Tagen und 30 Mal Öffnen; an den Worker gehen nur die Stunden.
- **Geprüft und nicht umgesetzt:** Webcams (foto-webcam.eu erlaubt kein Kopieren oder Verarbeiten der Bilder ohne schriftliche Zustimmung, nur Links).

## Sicherheit

- **Seite:** nur über HTTPS. Strenge Sicherheitsregel (CSP): Skripte laufen nur, wenn ihre Prüfsumme stimmt; von außen nur genau die Kartenbibliothek Leaflet 1.9.4 (ebenfalls mit Prüfsumme). Schriften nur von der eigenen Seite (seit 1.0 keine Verbindung mehr zu Google Fonts). Keine Formulare an fremde Seiten, keine Einbettung in fremde Seiten. Texte von Wetterdiensten werden vor der Anzeige entschärft.
- **Geheimnisse:** Kachelmann-Schlüssel und Passwort liegen nur bei Cloudflare (Secrets), nie im Code.
- **Anmeldung:** über den Worker. Signierte Tokens (30 Tage), Vergleich ohne Zeitunterschiede. Pro IP-Adresse höchstens 5 Fehlversuche in 15 Minuten, von allen zusammen höchstens 30, dann 15 Minuten Sperre für neue Anmeldungen; nach 100 Fehlversuchen an einem Tag 6 Stunden Sperre. Angemeldete Geräte merken davon nichts. Seit Worker 1.0: Jeder Versuch zählt schon, bevor das Passwort geprüft ist (viele gleichzeitige Versuche kommen so nicht über die Grenze), die Zahl für alle steht im Speicher (`rl:g`, übersteht einen Neustart des Workers) und kostet durch die Tagesgrenze höchstens etwa 100 Schreibvorgänge am Tag (vorher zwei je Fehlversuch ohne Grenze: damit ließ sich das Tageslimit des Speichers von außen aufbrauchen). Ein neues Passwort meldet alle Geräte ab.
- **Zu tun für den Besitzer:** Zwei-Faktor-Anmeldung bei GitHub und Cloudflare einschalten. Ein Passwort verwenden, das nirgends sonst benutzt wird.

## Cloudflare-Worker (`worker/kachelmann-proxy.js`)

**Automatisch veröffentlichen (ab 1.6):** Liegt im Repository das Secret `CLOUDFLARE_API_TOKEN` (Cloudflare-Vorlage „Edit Cloudflare Workers“), veröffentlicht die GitHub-Action „Worker veröffentlichen“ den Worker bei jeder Änderung an `worker/kachelmann-proxy.js`. Sie liest dazu die bestehenden Einstellungen (Konto, KV-Bindung SUBS, Zeitplan) über die Cloudflare-API, ergänzt die Bindung AI und ruft `wrangler deploy` mit `keep_vars` auf; Secrets (Passwort, Kachelmann-Schlüssel) bleiben unberührt. Ohne Secret passiert nichts.

Der Worker hält den Kachelmann-Schlüssel geheim, prüft die Anmeldung, verlängert sie (`/renew`) und verschickt Benachrichtigungen. Die Startadresse zeigt `"version":"1.0","build":1`.

**Veröffentlichen über den Cloudflare-Connector (so wird es derzeit gemacht):** Claude lädt den Code über den verbundenen Cloudflare-Zugang hoch (der Zugangsschlüssel bleibt bei Cloudflare bzw. beim Besitzer). Dabei gilt `keep_bindings: ["plain_text","secret_text"]`: Passwort, Kachelmann-Schlüssel und die Texte bleiben unberührt; KV `SUBS`, `AI` und der Zeitplan werden wieder mitgegeben. Vor dem Hochladen wird die Prüfsumme (SHA-256) mit der Datei im Repository verglichen.

**Worker 1.0 (Build 1), Änderungen gegenüber 1.6:**
- Alle Abrufe nach außen mit Zeitlimit (`tf`, `jf`); `/k/` und `/ma/` antworten bei einem hängenden Dienst mit 504 statt gar nicht.
- Alle Wege in einer Funktion mit Fehlerbehandlung: ein unerwarteter Fehler gibt eine lesbare Antwort (500, mit CORS) statt eines Abbruchs.
- Benachrichtigungen (`runAlerts`): je Abo eigene Fehlerbehandlung, drei gleichzeitig, gleiche Orte werden nur einmal abgefragt, Zustand vor dem Senden gespeichert, ein zweiter Versuch beim Senden, abgelaufene Abos (404/410) werden gelöscht, mindestens 90 Minuten zwischen zwei Regen-Hinweisen, 15-Minuten-Werte richtig zugeordnet.
- Lernen: `/kl/c` liest den Ort direkt (ein Lesevorgang statt alle), `/kl/p` verwendet einen Ort in 2 km Umkreis weiter statt einen zweiten anzulegen, jeder Ort lernt für sich (ein Fehler bei einem Ort hält die anderen nicht auf). Die Lernergebnisse sind gleich wie mit 1.6 (im Test Byte für Byte).
- Anmeldung: Schutz gegen Passwort-Raten neu gebaut (siehe Sicherheit): Versuche werden vorab gezählt, Tagesgrenze, viel weniger Schreibvorgänge; zu große Anfragen werden abgewiesen.
- `/tr` (Übersetzen) arbeitet die Texte gleichzeitig ab.

| Einstellung | Art | Inhalt |
|---|---|---|
| `ALLOWED_ORIGIN` | Text | `https://eliaspp9.github.io` |
| `LOGIN_USER` | Text | Benutzername |
| `LOGIN_PASS` | Secret | Passwort |
| `KACHELMANN_KEY` | Secret | API-Schlüssel von Kachelmann |
| `KEY_HEADER` | Text, optional | Standard `X-API-Key` |
| `SUBS` | KV-Bindung | für Benachrichtigungen und das Lernen, Namespace `wetter-push` |
| `AI` | Workers-AI-Bindung | Übersetzen und Push-Texte (ab 1.6) |
| Cron-Trigger | Zeitplan | `*/10 * * * *` für Benachrichtigungen und das Lernen |

## Ändern und veröffentlichen

1. `index.html` bearbeiten (die ganze App steht in dieser einen Datei), bei Bedarf `sw.js` und `worker/kachelmann-proxy.js`.
2. `app-build` um 1 erhöhen und `app-notes` schreiben (ohne Anführungszeichen und ohne `&`, `<`, `>`: ältere Geräte lesen den Text direkt aus der Seite). `app-build` zählt seit jeher einfach hoch, daran erkennen geöffnete Geräte das Update. Angezeigt wird „`app-version` (Build `app-build` − 56)“: `app-build` 57 ist „1.0 (Build 1)“.
3. `python3 tools/build.py` ausführen. Das prüft alle Skripte der Seite, `sw.js` und den Worker auf Syntaxfehler (`node --check`), lässt ESLint laufen, wenn es installiert ist (`tools/eslint.config.mjs`; Fehler brechen ab, z. B. nicht erklärte Namen), prüft, ob die in `sw.js` genannten Dateien da sind, berechnet die Sicherheitsregeln (CSP) neu, schreibt `version.json` und aktualisiert `wetter2.html`.
4. Nach `main` schieben; GitHub Pages veröffentlicht die Seite. Den Worker bei Änderungen wie oben beschrieben hochladen.

**Widget (`widget/Wetter-Widget.js`, Scriptable):** Wird nicht automatisch aktualisiert. Nach einer Änderung den Text in Scriptable neu einfügen (mit 1.0 wegen der richtig zugeordneten Viertelstunden).
