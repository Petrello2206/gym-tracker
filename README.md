# Gym Tracker

Persönliche Trainings- und Ernährungs-App (Web-App / PWA).

- **App:** https://petrello2206.github.io/gym-tracker/
- **Einrichtung:** siehe [ANLEITUNG.md](ANLEITUNG.md)

| Datei | Zweck |
|---|---|
| `index.html` | Die App (Training, Fortschritt, Körper, Ernährung) |
| `db.js` | Speicher auf dem Gerät + Synchronisation mit dem Google-Skript |
| `seed.js` | Startdaten (Trainingsplan, Technik-Hinweise) |
| `sw.js`, `manifest.webmanifest`, `icons/` | Installierbar und offline nutzbar |
| `apps-script/Code.gs` | Google-Skript: Daten in Google Drive, tägliche Backups |

Produktdaten: [Open Food Facts](https://openfoodfacts.org) (ODbL).
Der Code enthält keine Zugangsdaten – der Schlüssel zum Skript wird nur auf dem Handy gespeichert.
