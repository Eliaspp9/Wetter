# Wetter

Persönliche Wetter-App im Stil von WetterOnline, als Webseite auf GitHub Pages:
https://eliaspp9.github.io/Wetter/

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
- **App und Offline:** als App auf dem Home-Bildschirm installierbar, offline mit dem letzten Stand.

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

- **Seite:** nur über HTTPS. Strenge Sicherheitsregel (CSP): Skripte laufen nur, wenn ihre Prüfsumme stimmt; von außen nur genau die Kartenbibliothek Leaflet 1.9.4 (ebenfalls mit Prüfsumme). Keine Formulare an fremde Seiten, keine Einbettung in fremde Seiten. Texte von Wetterdiensten werden vor der Anzeige entschärft.
- **Geheimnisse:** Kachelmann-Schlüssel und Passwort liegen nur bei Cloudflare (Secrets), nie im Code.
- **Anmeldung:** über den Worker. Signierte Tokens (30 Tage), Vergleich ohne Zeitunterschiede. Pro IP-Adresse höchstens 5 Fehlversuche in 15 Minuten, insgesamt höchstens 30, dann 15 Minuten Sperre. Ein neues Passwort meldet alle Geräte ab.
- **Zu tun für den Besitzer:** Zwei-Faktor-Anmeldung bei GitHub und Cloudflare einschalten. Ein Passwort verwenden, das nirgends sonst benutzt wird.

## Cloudflare-Worker (`worker/kachelmann-proxy.js`)

**Automatisch veröffentlichen (ab 1.6):** Liegt im Repository das Secret `CLOUDFLARE_API_TOKEN` (Cloudflare-Vorlage „Edit Cloudflare Workers“), veröffentlicht die GitHub-Action „Worker veröffentlichen“ den Worker bei jeder Änderung an `worker/kachelmann-proxy.js`. Sie liest dazu die bestehenden Einstellungen (Konto, KV-Bindung SUBS, Zeitplan) über die Cloudflare-API, ergänzt die Bindung AI und ruft `wrangler deploy` mit `keep_vars` auf; Secrets (Passwort, Kachelmann-Schlüssel) bleiben unberührt. Ohne Secret passiert nichts.

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
