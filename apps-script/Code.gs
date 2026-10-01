/**
 * Food Desk — backend του site (με λογαριασμούς για την παρέα).
 * Μπαίνει στο Google Sheet «Food Desk»: Επεκτάσεις → Apps Script.
 *
 * Λογαριασμοί:
 *  - Η πρώτη είσοδος (όταν δεν υπάρχει κανένας λογαριασμός) γίνεται με το παλιό PIN των Ιδιοτήτων σεναρίου
 *    και φτιάχνει τον λογαριασμό διαχειριστή· μετά ζητείται νέος κωδικός (τουλάχιστον 8 χαρακτήρες).
 *  - Οι φίλες κάνουν εγγραφή από το site και η διαχειρίστρια τις εγκρίνει από το μενού «Διαχείριση».
 *  - Οι κωδικοί ΔΕΝ αποθηκεύονται όπως είναι: κρατιέται μόνο το «αποτύπωμά» τους (SHA-256 με salt).
 *  - Μετά από 5 λάθος κωδικούς ο λογαριασμός κλειδώνει για 15 λεπτά.
 *
 * Δεδομένα:
 *  - Προσωπικά (καταγραφές, νερό, βάρος, πρόγραμμα, συνδυασμοί, αγαπημένα, ρυθμίσεις, ψώνια): η καθεμία βλέπει μόνο τα δικά της.
 *  - Κοινά (τρόφιμα, συνταγές, σχόλια): τα βλέπουν όλες· αλλάζει/σβήνει μόνο όποια τα πρόσθεσε ή η διαχειρίστρια.
 *  - Οι φωτογραφίες των σχολίων ανεβαίνουν στο Google Drive της διαχειρίστριας (φάκελος «Food Desk — φωτογραφίες»).
 *
 * Στήλες με «t» κρατιούνται ως απλό κείμενο (για να μη γίνονται οι ημερομηνίες/κωδικοί αριθμοί ή ημερομηνίες).
 */

const USER_COL = ['user', 'Χρήστης', 't'];
const SHEETS = {
  log: { name: 'Καταγραφές', cols: [['id', 'ID', 't'], ['date', 'Ημερομηνία', 't'], ['meal', 'Γεύμα', 't'], ['kind', 'Είδος', 't'], ['ref', 'Κωδικός', 't'],
    ['name', 'Όνομα', 't'], ['qty', 'Ποσότητα'], ['unit', 'Μονάδα', 't'], ['g', 'Γραμμάρια'], ['kcal', 'Θερμίδες'], ['p', 'Πρωτεΐνη'], ['c', 'Υδατάνθρακες'], ['f', 'Λιπαρά'], USER_COL] },
  water: { name: 'Νερό', cols: [['id', 'Ημερομηνία', 't'], ['glasses', 'Ποτήρια'], USER_COL] },
  weight: { name: 'Βάρος', cols: [['id', 'Ημερομηνία', 't'], ['kg', 'Κιλά'], USER_COL] },
  plan: { name: 'Πρόγραμμα', cols: [['id', 'ID', 't'], ['date', 'Ημερομηνία', 't'], ['meal', 'Γεύμα', 't'], ['kind', 'Είδος', 't'], ['ref', 'Κωδικός', 't'],
    ['name', 'Όνομα', 't'], ['qty', 'Ποσότητα'], ['unit', 'Μονάδα', 't'], ['g', 'Γραμμάρια'], ['kcal', 'Θερμίδες'], ['p', 'Πρωτεΐνη'], ['c', 'Υδατάνθρακες'], ['f', 'Λιπαρά'], USER_COL] },
  foods: { name: 'Τρόφιμα', cols: [['id', 'ID'], ['name', 'Όνομα', 't'], ['cat', 'Κατηγορία', 't'], ['kcal', 'Θερμίδες / 100γρ.'], ['p', 'Πρωτεΐνη'],
    ['c', 'Υδατάνθρακες'], ['f', 'Λιπαρά'], ['use', 'Χρήση', 't'], ['portions', 'Μερίδες (όνομα:γραμμάρια)', 't'], ['origin', 'Προέλευση', 't'], ['hidden', 'Κρυφό'],
    ['author', 'Πρόσθεσε (χρήστης)', 't']] },
  recipes: { name: 'Συνταγές', cols: [['id', 'ID'], ['name', 'Όνομα', 't'], ['icon', 'Εικονίδιο', 't'], ['cat', 'Κατηγορία', 't'], ['servings', 'Μερίδες'],
    ['itemsText', 'Υλικά', 't'], ['steps', 'Βήματα', 't'], ['notes', 'Σημειώσεις', 't'], ['origin', 'Προέλευση', 't'], ['hidden', 'Κρυφή'], ['type', 'Είδος (recipe/prep)', 't'], ['tags', 'Ετικέτες', 't'],
    ['items', 'Δεδομένα υλικών (μην αλλάζεις)', 't'], ['author', 'Πρόσθεσε (χρήστης)', 't']] },
  combos: { name: 'Συνδυασμοί', cols: [['id', 'ID', 't'], ['name', 'Όνομα', 't'], ['icon', 'Εικονίδιο', 't'], ['itemsText', 'Περιεχόμενα', 't'],
    ['items', 'Δεδομένα (μην αλλάζεις)', 't'], USER_COL] },
  favs: { name: 'Αγαπημένα', cols: [['id', 'Κωδικός', 't'], ['name', 'Όνομα', 't'], USER_COL] },
  settings: { name: 'Ρυθμίσεις', cols: [['id', 'Ρύθμιση', 't'], ['value', 'Τιμή', 't'], USER_COL] },
  shop: { name: 'Ψώνια', cols: [['id', 'ID', 't'], ['name', 'Όνομα', 't'], ['food', 'Κωδικός τροφίμου'], ['g', 'Γραμμάρια'], ['pieces', 'Τεμάχια'], ['pcsOnly', 'Μόνο τεμάχια'],
    ['cat', 'Κατηγορία', 't'], ['checked', 'Στο καλάθι'], ['note', 'Σημείωση', 't'], ['src', 'Από (συνταγή/εβδομάδα)', 't'], USER_COL] },
  comments: { name: 'Σχόλια', cols: [['id', 'ID', 't'], ['recipe', 'Συνταγή'], ['user', 'Χρήστης', 't'], ['text', 'Σχόλιο', 't'], ['photo', 'Φωτογραφία', 't'], ['created', 'Ημερομηνία', 't']] },
  users: { name: 'Χρήστες', cols: [['id', 'ID', 't'], ['name', 'Όνομα', 't'], ['role', 'Ρόλος (admin/user)', 't'], ['status', 'Κατάσταση (pending/active/disabled)', 't'],
    ['hash', 'Αποτύπωμα κωδικού (όχι ο κωδικός)', 't'], ['salt', 'Salt', 't'], ['created', 'Δημιουργία', 't'], ['fails', 'Λάθος προσπάθειες'], ['lockUntil', 'Κλείδωμα έως (ms)'],
    ['mustChange', 'Πρέπει να αλλάξει κωδικό']] },
};
const PERSONAL = ['log', 'water', 'weight', 'plan', 'combos', 'favs', 'settings', 'shop'];
const SHARED = ['foods', 'recipes'];

function doGet() {
  return json_({ ok: true, data: 'Food Desk API' });
}

function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) {}
  const write = !['all', 'ping', 'users'].includes(p.action);
  const lock = LockService.getScriptLock();
  try {
    if (write) lock.waitLock(20000);
    let res;
    if (p.action === 'login') res = login_(p);
    else if (p.action === 'signup') res = signup_(p);
    else {
      const me = userFromToken_(p.token);
      if (!me) return json_({ ok: false, error: 'Χρειάζεται σύνδεση' });
      switch (p.action) {
        case 'ping':      res = { me: pub_(me) }; break;
        case 'all':       res = all_(me); break;
        case 'put':       res = putChecked_(me, p.sheet, p.rows || []); break;
        case 'del':       res = delChecked_(me, p.sheet, p.ids || []); break;
        case 'changePin': res = changePin_(me, p); break;
        case 'rename':    res = rename_(me, p); break;
        case 'logout':    props_().deleteProperty('tok_' + p.token); res = {}; break;
        case 'upload':    res = upload_(me, p); break;
        case 'users':     res = adminUsers_(me); break;
        case 'setStatus': res = setStatus_(me, p); break;
        case 'resetPin':  res = resetPin_(me, p); break;
        default: throw new Error('Άγνωστη ενέργεια');
      }
    }
    return json_({ ok: true, data: res });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    if (write) try { lock.releaseLock(); } catch (err) {}
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
const props_ = () => PropertiesService.getScriptProperties();
const bool_ = v => v === true || String(v).toUpperCase() === 'TRUE';
const nowIso_ = () => new Date().toISOString();

/* ---------- λογαριασμοί ---------- */
function hash_(pin, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + '|' + pin, Utilities.Charset.UTF_8);
  return bytes.map(b => ((b + 256) % 256).toString(16).padStart(2, '0')).join('');
}
const normName_ = n => String(n || '').trim().replace(/\s+/g, ' ');
const findByName_ = (list, name) => list.find(u => normName_(u.name).toLowerCase() === normName_(name).toLowerCase());
const users_ = () => read_('users');
const pub_ = u => ({ id: String(u.id), name: String(u.name), role: String(u.role), mustChange: bool_(u.mustChange) });
const isAdmin_ = u => String(u.role) === 'admin';

function checkPin_(pin, role) {
  if (pin.length > 64) throw new Error('Πολύ μεγάλος κωδικός');
  if (role === 'admin' && pin.length < 8) throw new Error('Ο κωδικός διαχειρίστριας θέλει τουλάχιστον 8 χαρακτήρες');
  if (pin.length < 6) throw new Error('Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες');
}
function checkName_(name) {
  if (name.length < 2 || name.length > 30) throw new Error('Το όνομα πρέπει να έχει 2–30 χαρακτήρες');
}
function createUser_(name, pin, role, status, mustChange) {
  const salt = Utilities.getUuid(), id = 'u' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const u = { id, name, role, status, hash: hash_(pin, salt), salt, created: nowIso_(), fails: 0, lockUntil: '', mustChange };
  put_('users', [u]);
  return u;
}
function newToken_(uid) {
  const t = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  props_().setProperty('tok_' + t, String(uid));
  return t;
}
function userFromToken_(t) {
  if (!t) return null;
  const uid = props_().getProperty('tok_' + t);
  if (!uid) return null;
  const u = users_().find(x => String(x.id) === uid);
  return u && String(u.status) === 'active' ? u : null;
}
/** Βγάζει τον χρήστη από όλες τις συσκευές (εκτός από αυτήν με το token keep). */
function revokeTokens_(uid, keep) {
  const all = props_().getProperties();
  for (const k in all) if (k.indexOf('tok_') === 0 && all[k] === String(uid) && k !== 'tok_' + keep) props_().deleteProperty(k);
}
const session_ = u => ({ token: newToken_(u.id), me: pub_(u) });

function login_(p) {
  const name = normName_(p.name), pin = String(p.pin || '');
  if (!name || !pin) throw new Error('Γράψε όνομα και κωδικό');
  const list = users_();
  // Πρώτη φορά (κανένας λογαριασμός): το παλιό PIN του Sheet φτιάχνει τον λογαριασμό διαχειριστή.
  if (!list.length) {
    const legacy = props_().getProperty('PIN');
    if (!legacy || pin !== String(legacy)) throw new Error('Λάθος όνομα ή κωδικός');
    checkName_(name);
    const u = createUser_(name, pin, 'admin', 'active', true);
    claimOrphans_(u.id);
    return session_(u);
  }
  const u = findByName_(list, name);
  if (!u) throw new Error('Λάθος όνομα ή κωδικός');
  const now = Date.now();
  if (Number(u.lockUntil) > now) throw new Error('Πολλές λάθος προσπάθειες · ξαναδοκίμασε σε ' + Math.ceil((Number(u.lockUntil) - now) / 60000) + ' λεπτά');
  if (hash_(pin, u.salt) !== String(u.hash)) {
    // Ιδιότητα NO_LOCKOUT = 1: χωρίς κλείδωμα (μόνο για δοκιμές).
    if (props_().getProperty('NO_LOCKOUT') === '1') throw new Error('Λάθος όνομα ή κωδικός');
    const fails = (Number(u.fails) || 0) + 1;
    put_('users', [{ id: u.id, fails: fails >= 5 ? 0 : fails, lockUntil: fails >= 5 ? now + 15 * 60000 : '' }]);
    throw new Error(fails >= 5 ? 'Πολλές λάθος προσπάθειες · ο λογαριασμός κλείδωσε για 15 λεπτά' : 'Λάθος όνομα ή κωδικός');
  }
  if (Number(u.fails)) put_('users', [{ id: u.id, fails: 0, lockUntil: '' }]);
  if (String(u.status) === 'pending') throw new Error('Ο λογαριασμός περιμένει έγκριση από τη διαχειρίστρια');
  if (String(u.status) !== 'active') throw new Error('Ο λογαριασμός είναι απενεργοποιημένος');
  return session_(u);
}

function signup_(p) {
  const name = normName_(p.name), pin = String(p.pin || '');
  checkName_(name);
  checkPin_(pin, 'user');
  const list = users_();
  if (!list.length) throw new Error('Ο λογαριασμός διαχειρίστριας δεν έχει στηθεί ακόμα');
  if (findByName_(list, name)) throw new Error('Υπάρχει ήδη λογαριασμός με αυτό το όνομα');
  if (list.filter(u => String(u.status) === 'pending').length >= 20) throw new Error('Πολλές αιτήσεις σε αναμονή · δοκίμασε αργότερα');
  createUser_(name, pin, 'user', 'pending', false);
  return { pending: true };
}

function changePin_(me, p) {
  if (hash_(String(p.oldPin || ''), me.salt) !== String(me.hash)) throw new Error('Λάθος τωρινός κωδικός');
  const pin = String(p.newPin || '');
  checkPin_(pin, String(me.role));
  const salt = Utilities.getUuid();
  put_('users', [{ id: me.id, hash: hash_(pin, salt), salt, mustChange: false }]);
  revokeTokens_(me.id, p.token);
  return { me: pub_({ ...me, mustChange: false }) };
}

function rename_(me, p) {
  const name = normName_(p.name);
  checkName_(name);
  const other = findByName_(users_(), name);
  if (other && String(other.id) !== String(me.id)) throw new Error('Υπάρχει ήδη λογαριασμός με αυτό το όνομα');
  put_('users', [{ id: me.id, name }]);
  return { me: pub_({ ...me, name }) };
}

function adminUsers_(me) {
  if (!isAdmin_(me)) throw new Error('Μόνο για τη διαχειρίστρια');
  return users_().map(u => ({ id: String(u.id), name: String(u.name), role: String(u.role), status: String(u.status), created: String(u.created) }));
}
function setStatus_(me, p) {
  if (!isAdmin_(me)) throw new Error('Μόνο για τη διαχειρίστρια');
  const u = users_().find(x => String(x.id) === String(p.id));
  if (!u) throw new Error('Δεν βρέθηκε ο λογαριασμός');
  if (String(u.id) === String(me.id)) throw new Error('Δεν μπορείς να αλλάξεις τον δικό σου λογαριασμό');
  if (p.status === 'delete') {
    revokeTokens_(u.id);
    for (const k of PERSONAL) delWhere_(k, r => String(r.user) === String(u.id));
    del_('users', [u.id]);
    return { deleted: true };
  }
  if (!['active', 'disabled'].includes(p.status)) throw new Error('Άγνωστη κατάσταση');
  put_('users', [{ id: u.id, status: p.status }]);
  if (p.status === 'disabled') revokeTokens_(u.id);
  return {};
}

/** Η διαχειρίστρια δίνει προσωρινό κωδικό σε όποια τον ξέχασε· στην πρώτη είσοδο αλλάζει υποχρεωτικά. */
function resetPin_(me, p) {
  if (!isAdmin_(me)) throw new Error('Μόνο για τη διαχειρίστρια');
  const u = users_().find(x => String(x.id) === String(p.id));
  if (!u) throw new Error('Δεν βρέθηκε ο λογαριασμός');
  if (String(u.id) === String(me.id)) throw new Error('Τον δικό σου κωδικό τον αλλάζεις από τις Ρυθμίσεις');
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789', hex = Utilities.getUuid().replace(/-/g, '');
  let pin = '';
  for (let i = 0; i < 8; i++) pin += abc[parseInt(hex.substr(i * 2, 2), 16) % abc.length];
  const salt = Utilities.getUuid();
  put_('users', [{ id: u.id, hash: hash_(pin, salt), salt, mustChange: true, fails: 0, lockUntil: '' }]);
  revokeTokens_(u.id);
  return { pin, name: String(u.name) };
}

/** Τα δεδομένα από την εποχή πριν τους λογαριασμούς ανήκουν στη διαχειρίστρια. */
function claimOrphans_(uid) {
  for (const k of PERSONAL) {
    const { sh, idx } = sheet_(k);
    const n = sh.getLastRow() - 1;
    if (n < 1) continue;
    const col = sh.getRange(2, idx.user + 1, n, 1), vals = col.getValues();
    const ids = sh.getRange(2, idx.id + 1, n, 1).getValues();
    col.setValues(vals.map((r, i) => [r[0] === '' && ids[i][0] !== '' ? uid : r[0]]));
  }
}

/* ---------- φωτογραφίες σχολίων (Google Drive) ---------- */
function photoFolder_() {
  const id = props_().getProperty('PHOTO_FOLDER');
  if (id) try { return DriveApp.getFolderById(id); } catch (err) {}
  const f = DriveApp.createFolder('Food Desk — φωτογραφίες');
  props_().setProperty('PHOTO_FOLDER', f.getId());
  return f;
}
const photoUrl_ = id => (typeof PHOTO_URL_ === 'function' ? PHOTO_URL_(id) : 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1200');
function upload_(me, p) {
  const b64 = String(p.data || '');
  if (!b64 || b64.length > 4000000) throw new Error('Η φωτογραφία είναι πολύ μεγάλη');
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', 'foto-' + me.id + '-' + Date.now() + '.jpg');
  const file = photoFolder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: photoUrl_(file.getId()) };
}
function trashPhoto_(url) {
  const m = String(url || '').match(/[?&]id=([\w-]+)/);
  if (m) try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (err) {}
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
 * Όλα τα δεδομένα με μία φόρτωση: τα προσωπικά ΜΟΝΟ του χρήστη, και τα κοινά.
 * Από Τρόφιμα/Συνταγές στέλνονται μόνο όσα διαφέρουν από τη βάση (τη βάση την έχει ήδη το site).
 */
function all_(me) {
  const out = {}, counts = {};
  for (const k of PERSONAL) out[k] = read_(k).filter(r => String(r.user) === String(me.id)).map(r => { delete r.user; return r; });
  for (const k of SHARED) {
    let rows = read_(k);
    counts[k] = rows.length;
    out[k] = rows.filter(r => String(r.origin) !== 'βάση' || bool_(r.hidden));
  }
  out.comments = read_('comments');
  const us = users_();
  out.users = us.filter(u => String(u.status) === 'active').map(u => ({ id: String(u.id), name: String(u.name), role: String(u.role) }));
  if (isAdmin_(me)) out.pending = us.filter(u => String(u.status) === 'pending').length;
  out.me = pub_(me);
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

/* ---------- εγγραφές με έλεγχο δικαιωμάτων ---------- */
function putChecked_(me, key, rows) {
  if (PERSONAL.includes(key)) return put_(key, rows.map(r => ({ ...r, user: me.id })), me.id);
  if (SHARED.includes(key)) {
    const existing = {};
    for (const r of read_(key)) existing[String(r.id)] = r;
    const ok = rows.map(r => {
      const ex = existing[String(r.id)], o = { ...r };
      delete o.author;
      if (!ex) {
        // Τα id κάτω από 100000 είναι της βάσης (τρόφιμα/συνταγές του site): τα γράφει μόνο η διαχειρίστρια.
        if ((String(r.origin) === 'βάση' || Number(r.id) < 100000) && !isAdmin_(me)) throw new Error('Δεν επιτρέπεται');
        o.author = String(r.origin) === 'βάση' ? '' : me.id;
      } else if (!isAdmin_(me) && String(ex.author) !== String(me.id)) {
        throw new Error('Δεν επιτρέπεται: αλλάζει μόνο όποια την πρόσθεσε ή η διαχειρίστρια');
      }
      return o;
    });
    return put_(key, ok);
  }
  if (key === 'comments') {
    const existing = {};
    for (const r of read_('comments')) existing[String(r.id)] = r;
    const ok = rows.map(r => {
      const ex = existing[String(r.id)];
      if (ex && String(ex.user) !== String(me.id) && !isAdmin_(me)) throw new Error('Δεν επιτρέπεται');
      const text = String(r.text || '').slice(0, 1500), photo = String(r.photo || '');
      if (photo && !/^(https:\/\/drive\.google\.com\/|\/mock-photos\/)/.test(photo)) throw new Error('Μη έγκυρη φωτογραφία');
      if (!text.trim() && !photo) throw new Error('Γράψε κάτι ή βάλε φωτογραφία');
      return { id: String(r.id), recipe: Number(r.recipe), text, photo, user: ex ? ex.user : me.id, created: ex ? ex.created : nowIso_() };
    });
    return put_('comments', ok);
  }
  throw new Error('Δεν επιτρέπεται');
}
function delChecked_(me, key, ids) {
  if (PERSONAL.includes(key)) return del_(key, ids, me.id);
  if (SHARED.includes(key) || key === 'comments') {
    const rows = read_(key), want = new Set(ids.map(String)), owner = key === 'comments' ? 'user' : 'author';
    for (const r of rows) if (want.has(String(r.id)) && !isAdmin_(me) && String(r[owner]) !== String(me.id)) throw new Error('Δεν επιτρέπεται');
    if (key === 'comments') for (const r of rows) if (want.has(String(r.id)) && r.photo) trashPhoto_(r.photo);
    return del_(key, ids);
  }
  throw new Error('Δεν επιτρέπεται');
}

/**
 * Γράφει γραμμές: αν υπάρχει ήδη το ID αλλάζει, αλλιώς προστίθεται.
 * Με user: το «κλειδί» είναι χρήστης + ID (π.χ. το νερό μιας μέρας έχει ID την ημερομηνία για κάθε χρήστη).
 */
function put_(key, rows, user) {
  if (!rows.length) return { n: 0 };
  const { sh, idx, width } = sheet_(key);
  const n = sh.getLastRow() - 1;
  const keyOf = (id, u) => (user === undefined ? '' : String(u) + '|') + String(id);
  const ids = n > 0 ? sh.getRange(2, 1, n, width).getValues().map(r => keyOf(r[idx.id], user === undefined ? '' : r[idx.user])) : [];
  const toRow = (o, base) => {
    const r = base ? base.slice() : new Array(width).fill('');
    for (const k in idx) if (o[k] !== undefined) r[idx[k]] = o[k] === null ? '' : o[k];
    return r;
  };
  const fresh = [];
  for (const o of rows) {
    const k = keyOf(o.id, user), at = ids.indexOf(k);
    if (at >= 0) {
      const range = sh.getRange(at + 2, 1, 1, width);
      range.setValues([toRow(o, range.getValues()[0])]);
    } else {
      fresh.push(toRow(o));
      ids.push(k);
    }
  }
  if (fresh.length) sh.getRange(sh.getLastRow() + 1, 1, fresh.length, width).setValues(fresh);
  return { n: rows.length };
}

function del_(key, delIds, user) {
  const want = new Set(delIds.map(String));
  return delWhere_(key, r => want.has(String(r.id)) && (user === undefined || String(r.user) === String(user)));
}
function delWhere_(key, test) {
  const { sh, idx, width } = sheet_(key);
  const n = sh.getLastRow() - 1;
  if (n < 1) return { n: 0 };
  const vals = sh.getRange(2, 1, n, width).getValues();
  let count = 0;
  // Από κάτω προς τα πάνω, για να μη μετακινούνται οι γραμμές που μένουν.
  for (let i = vals.length - 1; i >= 0; i--) {
    const o = {};
    for (const k in idx) o[k] = vals[i][idx[k]];
    if (test(o)) { sh.deleteRow(i + 2); count++; }
  }
  return { n: count };
}
