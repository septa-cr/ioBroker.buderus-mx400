![Logo](../../admin/buderus-mx400.png)

# ioBroker.buderus-mx400

**[🇬🇧 English version](../../README.md)**

## Buderus-MX400-Adapter für ioBroker

Dieser Adapter liest die Daten einer **Buderus MX400** Wärmepumpen-Inneneinheit über die offizielle **lokale API** des Herstellers aus. Die Verbindung läuft direkt in deinem Heimnetz, ein Cloud-Konto ist nicht nötig.

Laut Hersteller bieten auch der Bosch Connect-Key K 40 RF sowie der K 40 RF von IVT, Vulcano und Worcester dieselbe API an. Entwickelt und getestet wurde der Adapter mit einer Buderus MX400.

> **Hinweis:** Die API des Herstellers ist derzeit **nur lesend**. Der Adapter kann alle Werte anzeigen, aber keine Einstellungen an der Wärmepumpe ändern.

## Funktionen

- **Liest automatisch alle verfügbaren Werte.** Beim Start prüft der Adapter alle Ressourcen aus der API-Beschreibung des Herstellers und legt nur für die Werte Datenpunkte an, die deine Anlage tatsächlich liefert. Zusätzlich werden alle Signale gelesen, die das Gerät selbst meldet.
- **Deutsche und englische Namen** für alle Datenpunkte, mit den passenden Einheiten (°C, kWh, %, l/h …)
- **Energiezähler** (z. B. Gesamtverbrauch, Heizen, Warmwasser) als einzelne Datenpunkte für erzeugte Wärme, Verdichter und Heizstab
- **Verlaufsdaten** zu Verbrauch, Starts, Laufzeiten und Temperaturen: Tageswerte der letzten 31 Tage, Monatswerte der letzten 12 Monate sowie *heute* und *dieser Monat*. Temperaturen werden als Durchschnitt angezeigt, Energiewerte als Summe.
- **Zusammengesetzte Antworten** wie Fehlermeldungen oder Systeminformationen werden in einzelne Datenpunkte zerlegt. Die vollständige Antwort steht zusätzlich als JSON bereit.
- **Sonderwerte von Fühlern** (Kurzschluss, Leitungsbruch, zu geringer Durchfluss …) werden nicht als Messwert angezeigt, der Datenpunkt bleibt stattdessen leer.
- **Verbindungsanzeige** (`info.connection`) in der Instanzenliste
- **Schonend für das Gerät:** Selten veränderliche Werte (Verlaufsdaten, WLAN-Liste) werden nur einmal pro Stunde abgefragt. Ressourcen, die beim Start nicht geantwortet haben, werden stündlich erneut versucht.

## Voraussetzungen

- Buderus MX400 (oder ein anderes unterstütztes K-40-RF-Gateway) mit **Gateway-Firmware 15.00.01 oder neuer**
- Inneneinheit und ioBroker im selben lokalen Netzwerk
- Ein **API-Token** für das Gerät (siehe unten)
- ioBroker mit js-controller 6.0.11 oder neuer und Admin 7.0.23 oder neuer, empfohlen Node.js 22 oder neuer

## API-Token erzeugen

Der Token wird **einmalig** mit den Werten `Login` und `Pass` vom Typenschild der Inneneinheit erzeugt. Er läuft nicht ab. Bewahre ihn sicher auf und behandle ihn wie ein Passwort.

Kurzfassung der Herstelleranleitung:

1. Ermittle die IP-Adresse der Inneneinheit in deinem Router.
2. Entferne beim Wert `Pass` alle Bindestriche.
3. Drücke die Tasten **WLAN** und **Wireless** am Gerät eine Sekunde lang gleichzeitig. Die LEDs blinken kurz blau.
4. Fordere **innerhalb von 5 Minuten** den Token an (Port 9442):

    ```bash
    curl --insecure --request POST "https://IP-ADRESSE:9442/auth/token" \
      --header "Content-Type: application/x-www-form-urlencoded" \
      --data-urlencode "grant_type=password" \
      --data-urlencode "username=LOGIN" \
      --data-urlencode "password=PASS-OHNE-BINDESTRICHE" \
      --data-urlencode "client_name=iobroker"
    ```

    Unter Windows (PowerShell) schreibst du `curl.exe` statt `curl` und gibst den Befehl in einer Zeile ohne die `\` ein.

5. Kopiere den Wert von `access_token` aus der Antwort.

Die vollständige Anleitung mit Fehlerbehebung: [K 40 RF API-Dokumentation (Bosch Home Comfort)](https://github.com/bosch-home-comfort/api-docs/blob/main/docs/k-40-rf.md)

## Installation

Solange der Adapter nicht im offiziellen ioBroker-Repository verfügbar ist, wird er direkt von GitHub installiert:

1. Öffne im ioBroker-Admin den Bereich **Adapter**.
2. Klicke in der Werkzeugleiste auf das **GitHub-Symbol** ("Installieren aus eigener URL").
3. Gib im Reiter **Benutzerdefiniert** `https://github.com/septa-cr/ioBroker.buderus-mx400` ein und bestätige.
4. Lege eine Instanz des Adapters an.

## Einstellungen

| Einstellung | Beschreibung |
| --- | --- |
| IP-Adresse der Inneneinheit | IP-Adresse der MX400 in deinem Netzwerk, z. B. `192.168.178.135` |
| API-Token | Der wie oben beschrieben erzeugte Token. Er wird verschlüsselt gespeichert. |
| Abfrageintervall (Sekunden) | Wie oft die Werte gelesen werden. Standard 60, mindestens 10 |

Beim ersten Start prüft der Adapter alle Ressourcen der API. Das dauert etwa ein bis zwei Minuten. Danach steht im Log, wie viele Ressourcen deine Anlage liefert, zum Beispiel: *"Suche abgeschlossen: 1286 Pfade geprüft, 118 vorhanden …"*.

## Datenpunkte

| Ordner | Inhalt |
| --- | --- |
| `info.connection` | Verbindung zur Inneneinheit (true/false) |
| `signals.*` | Alle vom Gerät gemeldeten Signale, z. B. Außentemperatur, Vorlauftemperatur, Verdichterdrehzahl |
| `heatSources.*` | Wärmepumpe: Temperaturen, Verdichterleistung, Anlagendruck, Energiezähler |
| `heatingCircuits.hc1.*` | Heizkreis 1: Raumtemperatur, Sollwerte, Pumpe und Status |
| `dhwCircuits.dhw1.*` | Warmwasser: Temperatur, Sollwert, Status |
| `devices.device1.*` | Gekoppelte Funkgeräte, z. B. Raumregler |
| `recordings.*` | Verlaufsdaten (`daily`, `monthly`, `today`, `thisMonth`) |
| `system.*`, `gateway.*`, `notifications.*` | Systeminformationen, Gateway, Fehlermeldungen |

Welche Ordner und Werte erscheinen, hängt von deiner Anlage ab.

## Hinweise zur Sicherheit

- Die Inneneinheit benutzt ein selbst signiertes Zertifikat. Der Adapter prüft das Zertifikat deshalb, wie vom Hersteller empfohlen, nur für diese eine Verbindung nicht. Die Daten werden trotzdem verschlüsselt übertragen. Benutze den Adapter nur in einem vertrauenswürdigen lokalen Netzwerk.
- Der Token wird in ioBroker verschlüsselt gespeichert und nur dem Adapter selbst zur Verfügung gestellt.

## Entwicklung unterstützen

Gefällt dir der Adapter? Mit einer Kaffeespende unterstützt du die Weiterentwicklung:

[![Spenden über PayPal](https://img.shields.io/badge/Kaffee%20spenden-PayPal-ffc439.svg?style=for-the-badge)](https://www.paypal.com/donate/?hosted_button_id=BW2WL8QCH2AMU)

## Haftungsausschluss

Dieser Adapter ist ein privates Projekt und steht in keiner Verbindung zur Bosch Thermotechnik GmbH oder zu Buderus. Alle Produkt- und Firmennamen sind Marken ihrer jeweiligen Inhaber. Die Nutzung erfolgt auf eigene Gefahr.

Änderungsprotokoll und Lizenz findest du in der [englischen README](../../README.md#changelog).
