# Changelog

## 1.4.1 (2025-01-XX)

- Amazon-Anpassungen:
  - Telefonnummer wird nicht mehr aus Amazon kopiert
  - E-Mail-Adresse bei Amazon-Bestellungen wird auf "Paket@Stonehiller.de" gesetzt

## 1.4.0 (2025-01-XX)

- Amazon Seller Central-Unterstützung hinzugefügt:
  - Button auf Amazon-Bestellseiten zum Kopieren der Versanddaten
  - Extrahiert Lieferadresse und Bestellnummer aus Amazon
  - Kompatibel mit bestehender DHL/Iloxx-Integration
  - Bestellnummer wird aus URL oder DOM extrahiert

## 1.3.0 (2024-12-08)

- Iloxx-Unterstützung hinzugefügt:
  - Button auf Iloxx-Versandseite zum Einfügen der Bricklink-Daten
  - Flexible Feldzuordnung für Iloxx-Formularfelder
  - Iloxx benötigt KEIN Gewicht (im Gegensatz zu DHL)
- Kopiervorgang bleibt unverändert (einmal kopieren, mehrfach einfügen möglich)

## 1.2.0 (2024-06-27)

- Gewichtsermittlung komplett überarbeitet:
  - 35g Verpackungspuffer werden automatisch zum ermittelten Gewicht addiert.
  - Das Gesamtgewicht wird auf das nächste volle 100g aufgerundet (z.B. 53g+35g=88g → 100g, 224g+35g=259g → 300g).
  - Umrechnung in kg mit nur einer Nachkommastelle, Komma als Dezimaltrennzeichen (z.B. 0,1 / 0,3 / 1,2).
  - Mindestgewicht ist immer 0,1 kg, auch bei sehr leichten Sendungen.
- Adress-Parsing robust gegen beliebige Zeilenzahl im Adressblock (Name2/Name3 werden nur befüllt, wenn wirklich vorhanden).
- Alle Felder werden gezielt und kompatibel für das DHL Geschäftskundenportal ausgefüllt.
- Debug-Logging für die wichtigsten Schritte und Fehlerquellen.
- Das Skript ist damit für alle gängigen Bricklink-Bestellseiten und DHL-Formate (Stand 2024-06) optimiert.

## 1.0.1 (2024-06-27)

- Clipboard-Handling überarbeitet: Das Skript nutzt jetzt zuerst die Tampermonkey-APIs (GM_setClipboard/GM_getClipboard), fällt aber automatisch auf navigator.clipboard.writeText/readText zurück, falls diese nicht verfügbar sind.
- Damit funktioniert das Skript auch in stabilen Tampermonkey-Versionen und in allen modernen Browsern.
- Fehlerbehandlung und Nutzerhinweise ergänzt, falls kein Zugriff auf die Zwischenablage möglich ist.
- Versionierung im Skript auf 1.0.1 erhöht.

## 1.0.0 (Erstveröffentlichung)

### Funktionen
- **Bricklink-Bestellseite:**
  - Extrahiert automatisch folgende Daten aus der geöffneten Bestelldetailseite:
    - Order ID
    - Name (Vorname Nachname)
    - Straße
    - Hausnummer
    - PLZ
    - Ort
    - Land
    - E-Mail-Adresse
    - Gewicht (in Gramm)
    - Hinweise/zusätzliche Informationen (z.B. z.Hd. ...)
  - Fügt einen Button "Daten für DHL kopieren" oben rechts ein.
  - Kopiert die Daten als JSON-String in die Zwischenablage (Clipboard), um maximale Kompatibilität und Fehlerfreiheit beim Einfügen zu gewährleisten.

- **DHL Geschäftskundenportal (Sendungserfassung):**
  - Fügt einen Button "Daten aus Bricklink einfügen" oben rechts ein.
  - Liest die JSON-Daten aus der Zwischenablage und füllt die folgenden Felder automatisch aus:
    - Sendungsreferenz (`shipment-reference`) ← Order ID
    - Name 1 (`receiver.name1`) ← Name
    - Straße (`receiver.street`) ← Straße
    - Nr. (`receiver.streetNumber`) ← Hausnummer
    - PLZ (`receiver.plz`) ← PLZ
    - Ort (`receiver.city`) ← Ort
    - Land/Region (`receiver-country`) ← Land
    - E-Mail-Adresse (`receiver.email`) ← E-Mail
    - Gewicht (`shipment-weight`) ← Gewicht (automatische Umrechnung von g in kg, 3 Nachkommastellen)
    - Name 2 (`receiver.name2`) ← Hinweise/zusätzliche Informationen
  - Löst nach dem Einfügen jeweils ein Input-Event aus, damit die DHL-Seite die Werte korrekt übernimmt.
  - Zeigt nach dem Einfügen eine Bestätigungsmeldung an.

### Technische Details
- Das Skript erkennt die Zielseiten automatisch anhand der URL (`@match`).
- Die Buttons werden per JavaScript dynamisch eingefügt und sind immer oben rechts sichtbar.
- Die Daten werden als JSON gespeichert, um eine stabile und fehlerfreie Übertragung zu gewährleisten.
- Gewicht wird automatisch von Gramm (Bricklink) in Kilogramm (DHL) umgerechnet.
- Hinweise werden standardmäßig in das Feld `Name 2` eingetragen.
- Das Skript ist modular aufgebaut und kann für weitere Paketdienste/Felder erweitert werden.

### Hinweise
- Der Absender wird im DHL-Portal nicht verändert (wie gewünscht).
- Die Feldzuordnung basiert auf der aktuellen HTML-Struktur von Bricklink und DHL (Stand 2024-06).
- Sollte sich die Struktur ändern, müssen ggf. die Selektoren angepasst werden.
- Das Skript nutzt Tampermonkey-APIs (`GM_setClipboard`, `GM_getClipboard`).

## 1.1.0 (2024-06-27)

- Käuferadresse wird jetzt gezielt aus dem "Buyer Information"-Block extrahiert (nicht mehr versehentlich die eigene/Verkäuferadresse).
- Order ID wird direkt aus dem Kontakt-Link des Käufers übernommen.
- Gewicht wird zuverlässig aus dem Block "Estimated Weight of Order" extrahiert.
- DHL-Felder werden jetzt robuster ausgefüllt: Neben .value und input-Event wird auch ein change-Event ausgelöst und ggf. der Property-Setter verwendet (bessere Kompatibilität mit React/Angular).
- Kleinere Robustheitsverbesserungen bei der Adress- und E-Mail-Extraktion.

---

**Letzte Änderung:** 2025-01-XX 