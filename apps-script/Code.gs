/**
 * Food Desk — backend του site.
 * Μπαίνει στο Google Sheet «Food Desk»: Επεκτάσεις → Apps Script.
 *
 * PIN: Ρυθμίσεις έργου → Ιδιότητες σεναρίου (Script properties) → ιδιότητα «PIN» με τιμή το PIN σου.
 * Οι καρτέλες του Sheet φτιάχνονται μόνες τους την πρώτη φορά που μπαίνεις από το site.
 *
 * Το site στέλνει γραμμές ως αντικείμενα με αγγλικά κλειδιά· εδώ αντιστοιχίζονται στις ελληνικές στήλες.
 * Στήλες με «t» κρατιούνται ως απλό κείμενο (για να μη γίνονται οι ημερομηνίες/κωδικοί αριθμοί ή ημερομηνίες).
 */

const SHEETS = {
  log: { name: 'Καταγραφές', cols: [['id', 'ID', 't'], ['date', 'Ημερομηνία', 't'], ['meal', 'Γεύμα', 't'], ['kind', 'Είδος', 't'], ['ref', 'Κωδικός', 't'],
    ['name', 'Όνομα', 't'], ['qty', 'Ποσότητα'], ['unit', 'Μονάδα', 't'], ['g', 'Γραμμάρια'], ['kcal', 'Θερμίδες'], ['p', 'Πρωτεΐνη'], ['c', 'Υδατάνθρακες'], ['f', 'Λιπαρά']] },
  water: { name: 'Νερό', cols: [['id', 'Ημερομηνία', 't'], ['glasses', 'Ποτήρια']] },
  foods: { name: 'Τρόφιμα', cols: [['id', 'ID'], ['name', 'Όνομα', 't'], ['cat', 'Κατηγορία', 't'], ['kcal', 'Θερμίδες / 100γρ.'], ['p', 'Πρωτεΐνη'],
    ['c', 'Υδατάνθρακες'], ['f', 'Λιπαρά'], ['use', 'Χρήση', 't'], ['portions', 'Μερίδες (όνομα:γραμμάρια)', 't'], ['origin', 'Προέλευση', 't'], ['hidden', 'Κρυφό']] },
  recipes: { name: 'Συνταγές', cols: [['id', 'ID'], ['name', 'Όνομα', 't'], ['icon', 'Εικονίδιο', 't'], ['cat', 'Κατηγορία', 't'], ['servings', 'Μερίδες'],
    ['itemsText', 'Υλικά', 't'], ['steps', 'Βήματα', 't'], ['notes', 'Σημειώσεις', 't'], ['origin', 'Προέλευση', 't'], ['hidden', 'Κρυφή'],
    ['items', 'Δεδομένα υλικών (μην αλλάζεις)', 't']] },
  combos: { name: 'Συνδυασμοί', cols: [['id', 'ID', 't'], ['name', 'Όνομα', 't'], ['icon', 'Εικονίδιο', 't'], ['itemsText', 'Περιεχόμενα', 't'],
    ['items', 'Δεδομένα (μην αλλάζεις)', 't']] },
  favs: { name: 'Αγαπημένα', cols: [['id', 'Κωδικός', 't'], ['name', 'Όνομα', 't']] },
  settings: { name: 'Ρυθμίσεις', cols: [['id', 'Ρύθμιση', 't'], ['value', 'Τιμή', 't']] },
};

function doGet() {
  return json_({ ok: true, data: 'Food Desk API' });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  // Έλεγχος σύνδεσης χωρίς PIN: επιστρέφει ΜΟΝΟ πόσες γραμμές έχει κάθε φύλλο (κανένα δεδομένο).
  if (p.action === 'diag') {
    const a = all_(), n = {};
    for (const k in a) if (Array.isArray(a[k])) n[k] = a[k].length;
    return json_({ ok: true, data: { counts: a.counts, returned: n, size: JSON.stringify(a).length } });
  }
  if (!pinOk_(p.pin)) return json_({ ok: false, error: 'Λάθος PIN' });
  // Γρήγορος έλεγχος PIN για την είσοδο (δεν ανοίγει το Sheet, οπότε απαντάει αμέσως).
  if (p.action === 'ping') return json_({ ok: true, data: {} });

  const write = p.action !== 'all';
  const lock = LockService.getScriptLock();
  if (write) lock.waitLock(20000);
  try {
    let res;
    switch (p.action) {
      case 'all':       res = all_(); break;
      case 'put':       res = put_(p.sheet, p.rows || []); break;
      case 'del':       res = del_(p.sheet, p.ids || []); break;
      case 'seed':      res = seed_(p.sheet, p.rows || []); break;
      case 'changePin': res = changePin_(p); break;
      default: throw new Error('Άγνωστη ενέργεια');
    }
    return json_({ ok: true, data: res });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (write) lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- PIN ---------- */
function pinOk_(pin) {
  const real = PropertiesService.getScriptProperties().getProperty('PIN');
  return !!real && String(pin || '') === String(real);
}
function changePin_(p) {
  const pin = String(p.newPin || '');
  if (!/^\d{4,12}$/.test(pin)) throw new Error('Το PIN πρέπει να έχει 4 έως 12 ψηφία');
  PropertiesService.getScriptProperties().setProperty('PIN', pin);
  return {};
}

/* ---------- φύλλα ---------- */
function spec_(key) {
  const s = SHEETS[key];
  if (!s) throw new Error('Άγνωστο φύλλο: ' + key);
  return s;
}
/** Βρίσκει (ή φτιάχνει) το φύλλο και επιστρέφει { sh, idx: κλειδί → αριθμός στήλης (0-based) }. */
function sheet_(key) {
  const s = spec_(key), ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(s.name);
  if (!sh) {
    sh = ss.insertSheet(s.name);
    sh.getRange(1, 1, 1, s.cols.length).setValues([s.cols.map(c => c[1])]).setFontWeight('bold').setBackground('#e3f4ea');
    sh.setFrozenRows(1);
    s.cols.forEach((c, i) => { if (c[2] === 't') sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  }
  // Αν λείπει κάποια στήλη (νέα έκδοση), προστίθεται στο τέλος.
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const head = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const idx = {};
  s.cols.forEach(c => {
    let i = head.indexOf(c[1]);
    if (i < 0) {
      i = head.length;
      head.push(c[1]);
      sh.getRange(1, i + 1).setValue(c[1]).setFontWeight('bold').setBackground('#e3f4ea');
      if (c[2] === 't') sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@');
    }
    idx[c[0]] = i;
  });
  return { sh, idx, width: head.length };
}

function read_(key) {
  const { sh, idx } = sheet_(key);
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, sh.getLastColumn()).getValues();
  const out = [];
  for (const r of vals) {
    const id = r[idx.id];
    if (id === '' || id === null) continue;
    const o = {};
    for (const k in idx) {
      let v = r[idx[k]];
      if (v instanceof Date) v = Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
      o[k] = v;
    }
    out.push(o);
  }
  return out;
}

/**
 * Όλα τα δεδομένα με μία φόρτωση. Από Τρόφιμα/Συνταγές στέλνονται ΜΟΝΟ όσα διαφέρουν από τη βάση
 * (δικά σου, διορθωμένα, κρυφά): τη βάση την έχει ήδη το site, και έτσι η απάντηση μένει μικρή.
 */
function all_() {
  const out = {}, counts = {};
  for (const k in SHEETS) {
    let rows = read_(k);
    if (k === 'foods' || k === 'recipes') {
      counts[k] = rows.length;
      rows = rows.filter(r => String(r.origin) !== 'βάση' || r.hidden === true || String(r.hidden).toUpperCase() === 'TRUE');
    }
    out[k] = rows;
  }
  out.counts = counts;
  return out;
}

/**
 * Όταν αλλάζεις με το χέρι μια γραμμή στα Τρόφιμα/Συνταγές, σημειώνεται «διορθωμένο»/«αλλαγμένη»,
 * ώστε το site να καταλάβει την αλλαγή (simple trigger: τρέχει μόνο του, δεν θέλει ρύθμιση).
 */
function onEdit(e) {
  const sh = e.range.getSheet(), name = sh.getName();
  const key = name === SHEETS.foods.name ? 'foods' : name === SHEETS.recipes.name ? 'recipes' : null;
  if (!key || e.range.getRow() < 2) return;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = head.indexOf(SHEETS[key].cols.find(c => c[0] === 'origin')[1]) + 1;
  if (!col || (e.range.getColumn() <= col && col <= e.range.getLastColumn())) return;
  for (let r = e.range.getRow(); r <= e.range.getLastRow(); r++) {
    const cell = sh.getRange(r, col);
    if (String(cell.getValue()) === 'βάση') cell.setValue(key === 'foods' ? 'διορθωμένο' : 'αλλαγμένη');
  }
}

/** Γράφει γραμμές: αν υπάρχει ήδη το ID αλλάζει, αλλιώς προστίθεται. */
function put_(key, rows) {
  if (!rows.length) return { n: 0 };
  const { sh, idx, width } = sheet_(key);
  const n = sh.getLastRow() - 1;
  const ids = n > 0 ? sh.getRange(2, idx.id + 1, n, 1).getValues().map(r => String(r[0])) : [];
  const toRow = (o, base) => {
    const r = base ? base.slice() : new Array(width).fill('');
    for (const k in idx) if (o[k] !== undefined) r[idx[k]] = o[k] === null ? '' : o[k];
    return r;
  };
  const fresh = [];
  for (const o of rows) {
    const at = ids.indexOf(String(o.id));
    if (at >= 0) {
      const range = sh.getRange(at + 2, 1, 1, width);
      range.setValues([toRow(o, range.getValues()[0])]);
    } else {
      fresh.push(toRow(o));
      ids.push(String(o.id));
    }
  }
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, width).setValues(fresh);
  return { n: rows.length };
}

function del_(key, delIds) {
  const { sh, idx } = sheet_(key);
  const n = sh.getLastRow() - 1;
  if (n < 1 || !delIds.length) return { n: 0 };
  const want = new Set(delIds.map(String));
  const ids = sh.getRange(2, idx.id + 1, n, 1).getValues().map(r => String(r[0]));
  let count = 0;
  // Από κάτω προς τα πάνω, για να μη μετακινούνται οι γραμμές που μένουν.
  for (let i = ids.length - 1; i >= 0; i--) if (want.has(ids[i])) { sh.deleteRow(i + 2); count++; }
  return { n: count };
}

/** Αρχικό γέμισμα (π.χ. τα 590 τρόφιμα): γίνεται μόνο αν το φύλλο είναι άδειο. */
function seed_(key, rows) {
  const { sh } = sheet_(key);
  if (sh.getLastRow() > 1) return { seeded: false };
  put_(key, rows);
  return { seeded: true };
}
