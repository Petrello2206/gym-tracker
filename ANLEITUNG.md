# Gym Tracker – Einrichtung

Die App läuft als Web-App auf GitHub Pages. Deine Daten liegen auf dem Handy und in deinem Google Drive.
Ein kleines Google-Skript speichert sie und legt jede Nacht ein Backup an. Das funktioniert auch ohne Claude-Abo.

Dauer: etwa 15 Minuten, am besten am PC.

## 1. GitHub Pages einschalten

1. Öffne https://github.com/Petrello2206/gym-tracker → **Settings** → **Pages**.
2. Unter *Build and deployment*: Source **Deploy from a branch**, Branch **main**, Ordner **/ (root)** → **Save**.
3. Nach 1–2 Minuten ist die App erreichbar unter: **https://petrello2206.github.io/gym-tracker/**

## 2. Google-Skript anlegen

1. Öffne https://script.google.com mit dem Google-Konto, in dem der Ordner „Gym Tracker Backup“ liegt → **Neues Projekt**.
2. Nenne das Projekt oben links „Gym Tracker“.
3. Lösche den Inhalt von `Code.gs` und füge den ganzen Inhalt von [`apps-script/Code.gs`](apps-script/Code.gs) ein → **Speichern** (Disketten-Symbol).
4. Oben in der Funktionsauswahl **setup** wählen → **Ausführen**.
   - Google fragt nach Berechtigungen: **Berechtigungen prüfen** → dein Konto → bei „Google hat diese App nicht überprüft“ auf **Erweitert** → **Gym Tracker öffnen (unsicher)** → **Zulassen**.
     Das ist normal bei eigenen Skripten: Es ist dein Skript in deinem Konto, niemand sonst hat Zugriff.
   - Im Protokoll steht, ob Daten aus dem neuesten Backup übernommen wurden.

## 3. Als Web-App bereitstellen

1. Oben rechts **Bereitstellen** → **Neue Bereitstellung**.
2. Zahnrad bei „Typ auswählen“ → **Web-App**.
3. *Ausführen als*: **Ich** · *Zugriff*: **Jeder** → **Bereitstellen**.
   („Jeder“ ist nötig, damit die App das Skript erreicht. Geschützt ist es durch einen geheimen Schlüssel, den nur deine App kennt.)
4. In der Funktionsauswahl **zeigeEinrichtungslink** wählen → **Ausführen**.
   Der Link steht im Protokoll und zusätzlich in der Datei **EINRICHTUNGSLINK.txt** im Drive-Ordner.

## 4. Auf dem Handy einrichten

1. Öffne den Einrichtungslink auf dem Handy in **Chrome** (z. B. die Datei EINRICHTUNGSLINK.txt in der Drive-App öffnen und den Link antippen).
2. Oben rechts in der App sollte „gespeichert“ stehen. Unter **Körper → Daten & Synchronisation** siehst du den Status.
3. Chrome-Menü (⋮) → **Zum Startbildschirm hinzufügen** → **Installieren**. Ab jetzt startet die App wie eine normale App.

## Gerichte und Nährwerttabellen schätzen

Barcodes erkennt die App selbst und holt die Werte direkt von Open Food Facts.
Für Gerichte und Nährwerttabellen ohne Barcode öffnet die App die **Schätz-App in Claude** (funktioniert auch mit dem Gratis-Konto, angemeldet):
Foto → Schätzen → **In Gym Tracker übernehmen** → in der App bestätigen.

## Updates

Änderungen an der App landen in diesem Repository. Auf dem Handy die App einmal schliessen und neu öffnen – dann ist die neue Version da.
Wird `apps-script/Code.gs` geändert: Inhalt im Skript-Editor ersetzen → **Bereitstellen → Bereitstellungen verwalten → Bearbeiten (Stift) → Version: Neue Version → Bereitstellen**. Die URL bleibt gleich.

## Wenn etwas schiefgeht

- **Sync-Fehler „auth“**: Einrichtungslink erneut öffnen.
- **Daten wiederherstellen**: Im Skript-Editor `wiederherstellenAusNeuestemBackup` ausführen (ersetzt die Datenbank durch das neueste Backup im Drive-Ordner).
- **Zusätzliche Sicherung**: In der App unter Körper → *Daten exportieren* (JSON-Datei); *Backup importieren* spielt sie wieder ein.
