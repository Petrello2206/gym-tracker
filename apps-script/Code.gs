/**
 * Gym Tracker – Google Apps Script (Backend in deinem Google-Konto)
 *
 * - speichert alle App-Daten in Google Drive (Ordner "Gym Tracker Backup", Datei gym-tracker-db.json)
 * - legt jede Nacht ein Backup mit Datum an (+ CSV-Dateien für Google Sheets)
 * - importiert beim ersten Start das neueste Backup aus der Claude-App
 *
 * Einrichtung: siehe ANLEITUNG.md im Repository.
 */

const FOLDER_NAME = 'Gym Tracker Backup';
const DB_FILE = 'gym-tracker-db.json';
const APP_URL = 'https://petrello2206.github.io/gym-tracker/';
// Web-App-URL aus "Bereitstellen → Bereitstellungen verwalten" (endet auf /exec) hier eintragen:
const WEBAPP_URL = '';

/* ------------------------------------------------------------------ */
/* 1) Einmal ausführen: setup                                          */
/* ------------------------------------------------------------------ */
function setup() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('TOKEN')) {
    props.setProperty('TOKEN', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8));
  }
  const folder = getFolder_();
  if (!findFile_(folder, DB_FILE)) {
    const imported = importNewestBackup_(folder);
    Logger.log(imported ? 'Daten aus Backup übernommen: ' + imported + ' Dokumente.' : 'Kein Backup gefunden – starte mit leerer Datenbank.');
  } else {
    Logger.log('Datenbank existiert bereits.');
  }
  // täglicher Backup-Trigger (nur einmal anlegen)
  const has = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyBackup');
  if (!has) ScriptApp.newTrigger('dailyBackup').timeBased().atHour(3).everyDays(1).inTimezone('Europe/Zurich').create();
  Logger.log('Setup fertig. Jetzt bereitstellen (Bereitstellen → Neue Bereitstellung → Web-App) und danach "zeigeEinrichtungslink" ausführen.');
}

/* ------------------------------------------------------------------ */
/* 2) Nach dem Bereitstellen ausführen: Link fürs Handy                */
/* ------------------------------------------------------------------ */
function zeigeEinrichtungslink() {
  const url = WEBAPP_URL || ScriptApp.getService().getUrl();
  const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
  if (!url) { Logger.log('Noch nicht als Web-App bereitgestellt.'); return; }
  if (!/\/exec$/.test(url)) {
    Logger.log('Die gefundene URL ist die Test-URL (' + url + ') – die funktioniert nicht in der App.\n' +
      'Öffne Bereitstellen → Bereitstellungen verwalten, kopiere die Web-App-URL (endet auf /exec), trage sie oben bei WEBAPP_URL ein, speichere und führe diese Funktion nochmals aus.');
    return;
  }
  const link = APP_URL + '#setup=' + encodeURIComponent(url) + '&t=' + token;
  Logger.log('Öffne diesen Link auf dem Handy (z. B. per Mail an dich selbst schicken):\n' + link);
  // zusätzlich als Datei in Drive ablegen, damit du ihn leicht aufs Handy bekommst
  const folder = getFolder_();
  const f = findFile_(folder, 'EINRICHTUNGSLINK.txt');
  if (f) f.setContent(link); else folder.createFile('EINRICHTUNGSLINK.txt', link, MimeType.PLAIN_TEXT);
}

/* ------------------------------------------------------------------ */
/* Web-App                                                             */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!auth_(p.token)) return json_({ error: 'auth' });
  if (p.action === 'ping') return json_({ ok: true });
  if (p.action === 'pull') return json_(loadDb_());
  if (p.action === 'reports') return json_({ reports: listReports_() });
  return json_({ ok: true, info: 'Gym Tracker Backend' });
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ error: 'bad_json' }); }
  if (!auth_(body.token || (e.parameter && e.parameter.token))) return json_({ error: 'auth' });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const db = loadDb_();
    let applied = 0;
    (body.ops || []).forEach(op => {
      if (!op || !op.path || typeof op.ts !== 'number') return;
      const cur = Math.max((db.docs[op.path] && db.docs[op.path].ts) || 0, db.deleted[op.path] || 0);
      if (op.ts < cur) return;               // ältere Änderung ignorieren
      if (op.op === 'delete') { delete db.docs[op.path]; db.deleted[op.path] = op.ts; }
      else { db.docs[op.path] = { data: op.data, ts: op.ts }; delete db.deleted[op.path]; }
      applied++;
    });
    if (applied) saveDb_(db);
    return json_({ ok: true, applied: applied });
  } finally {
    lock.releaseLock();
  }
}

/** Zyklus-Berichte: JSON-Dateien im Unterordner "Berichte" (von Claude erstellt) */
function listReports_() {
  const it = getFolder_().getFoldersByName('Berichte');
  if (!it.hasNext()) return [];
  const files = it.next().getFiles(), out = [];
  while (files.hasNext()) {
    const f = files.next();
    if (!/\.json$/.test(f.getName())) continue;
    try { const r = JSON.parse(f.getBlob().getDataAsString('UTF-8')); r.id = r.id || f.getId(); out.push(r); } catch (e) {}
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Tägliches Backup (Trigger)                                          */
/* ------------------------------------------------------------------ */
function dailyBackup() {
  const folder = getFolder_();
  const db = loadDb_();
  const date = Utilities.formatDate(new Date(), 'Europe/Zurich', 'yyyy-MM-dd');
  const name = 'gym-tracker-' + date + '.json';
  const content = JSON.stringify(toCollections_(db));
  const ex = findFile_(folder, name);
  if (ex) ex.setContent(content); else folder.createFile(name, content, 'application/json');
  writeCsvs_(folder, db);
  cleanup_(folder);
}

/* ------------------------------------------------------------------ */
/* Hilfsfunktionen                                                     */
/* ------------------------------------------------------------------ */
function auth_(t) {
  const tok = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!tok && t === tok;
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function getFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(FOLDER_NAME);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}
function findFile_(folder, name) { const it = folder.getFilesByName(name); return it.hasNext() ? it.next() : null; }

function loadDb_() {
  const f = findFile_(getFolder_(), DB_FILE);
  if (!f) return { docs: {}, deleted: {} };
  try { const d = JSON.parse(f.getBlob().getDataAsString('UTF-8')); d.docs = d.docs || {}; d.deleted = d.deleted || {}; return d; }
  catch (e) { throw new Error('Datenbankdatei beschädigt – bitte aus Backup wiederherstellen'); }
}
function saveDb_(db) {
  const folder = getFolder_();
  const f = findFile_(folder, DB_FILE);
  const s = JSON.stringify(db);
  if (f) f.setContent(s); else folder.createFile(DB_FILE, s, 'application/json');
}

function toCollections_(db) {
  const c = {};
  Object.keys(db.docs).forEach(p => {
    const i = p.lastIndexOf('/'); const col = p.slice(0, i), id = p.slice(i + 1);
    (c[col] = c[col] || {})[id] = db.docs[p].data;
  });
  return { exportedAt: new Date().toISOString(), app: 'Gym Tracker', collections: c };
}

/** Übernimmt das neueste Backup (gym-tracker-YYYY-MM-DD.json) als Datenbank */
function importNewestBackup_(folder) {
  const files = []; const it = folder.getFiles();
  while (it.hasNext()) { const f = it.next(); if (/^gym-tracker-\d{4}-\d{2}-\d{2}\.json$/.test(f.getName())) files.push(f); }
  if (!files.length) return 0;
  files.sort((a, b) => a.getName() < b.getName() ? 1 : -1);
  const obj = JSON.parse(files[0].getBlob().getDataAsString('UTF-8'));
  const db = { docs: {}, deleted: {} }; const ts = Date.now() - 60000; let n = 0;
  Object.keys(obj.collections || {}).forEach(col => {
    Object.keys(obj.collections[col]).forEach(id => { db.docs[col + '/' + id] = { data: obj.collections[col][id], ts: ts }; n++; });
  });
  saveDb_(db);
  return n;
}
/** Manuell ausführbar: Datenbank aus dem neuesten Backup neu aufbauen (überschreibt!) */
function wiederherstellenAusNeuestemBackup() { Logger.log(importNewestBackup_(getFolder_()) + ' Dokumente wiederhergestellt.'); }

function writeCsvs_(folder, db) {
  const col = name => Object.keys(db.docs).filter(p => p.indexOf(name + '/') === 0 && p.split('/').length === 2).map(p => db.docs[p].data);
  const esc = v => { if (v === null || v === undefined) return ''; const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const csv = rows => rows.map(r => r.map(esc).join(';')).join('\n');
  const products = {}; Object.keys(db.docs).forEach(p => { if (p.indexOf('products/') === 0) products[p.slice(9)] = db.docs[p].data; });
  const r1 = x => x == null ? '' : Math.round(x * 10) / 10;

  const body = col('body').sort((a, b) => a.date < b.date ? -1 : 1);
  const g = [['datum', 'gewicht_kg', 'arm_cm', 'brust_cm', 'taille_cm']].concat(body.map(b => [b.date, b.weight, b.arm, b.chest, b.waist]));

  const e = [['datum', 'mahlzeit', 'name', 'gramm', 'kcal', 'protein', 'kh', 'fett', 'geschaetzt']];
  col('nutrition').sort((a, b) => a.date < b.date ? -1 : 1).forEach(d => (d.items || []).forEach(it => {
    let m = null;
    if (it.barcode && products[it.barcode] && products[it.barcode].per100 && it.grams) {
      const p = products[it.barcode].per100, f = it.grams / 100; m = { kcal: p.kcal * f, protein: p.protein * f, carbs: p.carbs * f, fat: p.fat * f };
    } else if (it.kcal != null) m = it;
    const name = it.name || (it.barcode && products[it.barcode] ? products[it.barcode].name : it.barcode) || '';
    e.push([d.date, it.meal, name, it.grams || '', m ? r1(m.kcal) : '', m ? r1(m.protein) : '', m ? r1(m.carbs) : '', m ? r1(m.fat) : '', it.est ? 'ja' : '']);
  }));

  const t = [['datum', 'training', 'ort', 'uebung', 'satz', 'kg', 'wdh', 'rir']];
  col('workouts').sort((a, b) => a.date < b.date ? -1 : 1).forEach(w => (w.entries || []).forEach(en => (en.log || []).forEach((s, i) => {
    if (s && s.done) t.push([w.date, w.dayName || w.day, w.location || 'gym', en.name, i + 1, s.kg, s.reps, s.rir]);
  })));

  [['gewicht.csv', g], ['ernaehrung.csv', e], ['training.csv', t]].forEach(([n, rows]) => {
    const f = findFile_(folder, n); const s = csv(rows);
    if (f) f.setContent(s); else folder.createFile(n, s, MimeType.CSV);
  });
}

/** Behalte 30 Tage täglich, danach das erste Backup jedes Monats. Rest in den Papierkorb. */
function cleanup_(folder) {
  const it = folder.getFiles(); const files = [];
  while (it.hasNext()) { const f = it.next(); const m = f.getName().match(/^gym-tracker-(\d{4})-(\d{2})-(\d{2})\.json$/); if (m) files.push({ f: f, d: m[1] + '-' + m[2] + '-' + m[3], mon: m[1] + '-' + m[2] }); }
  files.sort((a, b) => a.d < b.d ? -1 : 1);
  const limit = Utilities.formatDate(new Date(Date.now() - 30 * 86400000), 'Europe/Zurich', 'yyyy-MM-dd');
  const firstOfMonth = {};
  files.forEach(x => { if (!firstOfMonth[x.mon]) firstOfMonth[x.mon] = x.d; });
  files.forEach(x => { if (x.d < limit && firstOfMonth[x.mon] !== x.d) x.f.setTrashed(true); });
}
