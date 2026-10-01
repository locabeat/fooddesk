'use strict';

/* ============ Food Desk ============
 * Προς το παρόν όλα τα δεδομένα μένουν στον browser (localStorage).
 * Όταν στήσουμε το Google Sheet, το store θα μιλάει με το Apps Script όπως στο Household Desk.
 */

const MEALS = [
  { key: 'breakfast', name: 'Πρωινό', en: 'Breakfast', icon: '☀️' },
  { key: 'lunch', name: 'Μεσημεριανό', en: 'Lunch', icon: '🍽️' },
  { key: 'dinner', name: 'Βραδινό', en: 'Dinner', icon: '🌙' },
  { key: 'snack', name: 'Σνακ', en: 'Snack', icon: '🍎' },
];
const CAT_ICONS = {
  'Λαχανικά': '🥬', 'Φρούτα': '🍎', 'Όσπρια': '🫘', 'Ψωμί, ζυμαρικά, ρύζι, δημητριακά': '🍞', 'Κρέας & πουλερικά': '🍗',
  'Ψάρια & θαλασσινά': '🐟', 'Αυγά': '🥚', 'Γαλακτοκομικά & τυριά': '🧀', 'Λάδια, λίπη & ξηροί καρποί': '🥜',
  'Σάλτσες, αλείμματα & υλικά': '🫙', 'Καφέδες & ροφήματα': '☕', 'Χυμοί & αναψυκτικά': '🥤', 'Αλκοόλ': '🍷',
  'Γλυκά & σνακ': '🍫', 'Μαγειρευτά (ελληνική κουζίνα)': '🥘', 'Καντίνα, φούρνος & πρωινό έξω': '🥪',
  'Σουβλατζίδικο & delivery': '🌯', 'Σαλάτες & μεζέδες': '🥗',
};
const GLASS_ML = 250;

/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
};
/* ---------- γλώσσα (Ελληνικά / English) ----------
 * T('ελληνικά', 'english') διαλέγει με βάση τη ρύθμιση. Τα τρόφιμα/συνταγές έχουν πεδίο `en` (data/en/*.txt).
 * Τα δικά σου τρόφιμα/συνταγές και ό,τι έχεις μετονομάσει εμφανίζονται όπως τα έγραψες.
 */
let LANG = store.get('food.lang', 'el');
const EN = () => LANG === 'en';
const T = (el, en) => (LANG === 'en' ? en : el);
const LOCALE = () => (EN() ? 'en-GB' : 'el-GR');
let I18N = { cats: {} };
// Κατηγορίες: απλές (τρόφιμα) ή «διαδρομές» συνταγών, π.χ. «Κυρίως γεύμα/Κρέας/Μοσχάρι» → «Main dishes › Meat › Beef».
const catName = c => String(c).split('/').map(s => (EN() && I18N.cats[s]) || s).join(' › ');
const catLeaf = c => { const s = String(c).split('/'); const l = s[s.length - 1]; return (EN() && I18N.cats[l]) || l; };
const inCat = (r, path) => r.cat === path || String(r.cat).startsWith(path + '/');
// Δέντρο κατηγοριών συνταγών (όπως του Άκη) — σειρά και εικονίδια. Ό,τι άλλο υπάρχει σε συνταγές προστίθεται στο τέλος.
const REC_TREE = [
  ['Κυρίως γεύμα', '🍽️'], ['Κυρίως γεύμα/Κρέας', '🥩'], ['Κυρίως γεύμα/Κρέας/Μοσχάρι', '🐄'], ['Κυρίως γεύμα/Κρέας/Χοιρινό', '🐖'],
  ['Κυρίως γεύμα/Κρέας/Αρνί', '🐑'], ['Κυρίως γεύμα/Κρέας/Κατσίκι', '🐐'], ['Κυρίως γεύμα/Κρέας/Κουνέλι', '🐇'], ['Κυρίως γεύμα/Κρέας/Κυνήγι', '🦌'], ['Κυρίως γεύμα/Κρέας/Πουλερικά', '🍗'],
  ['Κυρίως γεύμα/Ψάρια', '🐟'], ['Κυρίως γεύμα/Θαλασσινά', '🦐'], ['Κυρίως γεύμα/Λαδερά', '🫛'],
  ['Κυρίως γεύμα/Λαχανικά', '🥕'], ['Κυρίως γεύμα/Όσπρια', '🫘'], ['Κυρίως γεύμα/Ζυμαρικά', '🍝'], ['Κυρίως γεύμα/Ρύζι', '🍚'],
  ['Κυρίως γεύμα/Πατάτα', '🥔'], ['Κυρίως γεύμα/Αλμυρές πίτες & Τάρτες', '🥧'],
  ['Σούπες', '🍲'], ['Σαλάτες & συνοδευτικά', '🥗'], ['Πρωινό', '☀️'], ['Γλυκά', '🍰'], ['Σνακ', '🥨'],
];
const treeIcon = p => REC_TREE.find(t => t[0] === p)?.[1] || '📁';
/** Όλες οι διαδρομές (δέντρο + όσες υπάρχουν σε συνταγές, μαζί με τους «γονείς» τους), με τη σειρά του δέντρου. */
function allCatPaths(pool = RECIPES) {
  const set = new Set(REC_TREE.map(t => t[0]));
  for (const r of pool) { const s = String(r.cat).split('/'); for (let i = 1; i <= s.length; i++) set.add(s.slice(0, i).join('/')); }
  const order = p => { const i = REC_TREE.findIndex(t => t[0] === p); return i < 0 ? 999 : i; };
  return [...set].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}
const childrenOf = (path, paths) => paths.filter(p => path ? p.startsWith(path + '/') && p.split('/').length === path.split('/').length + 1 : !p.includes('/'));
// Ετικέτες: χαρακτηριστικά που μπορεί να έχει μια συνταγή μαζί με την κατηγορία της.
const TAGS = [['airfryer', '🌀', 'Air fryer', 'Air fryer'], ['quick', '⚡', 'Γρήγορο', 'Quick'], ['five', '5️⃣', 'Μέχρι 5 υλικά', 'Up to 5 ingredients'],
  ['budget', '💶', 'Οικονομικό', 'Budget'], ['kids', '🧒', 'Παιδικό', 'Kids'], ['light', '🥗', 'Light', 'Light'], ['protein', '💪', 'Πολλή πρωτεΐνη', 'High protein'],
  ['fasting', '🌿', 'Νηστίσιμο', 'Fasting'], ['vegan', '🌱', 'Vegan', 'Vegan'], ['onepan', '🍳', 'One pan', 'One pan']];
const tagLabel = k => { const t = TAGS.find(x => x[0] === k); return t ? `${t[1]} ${T(t[2], t[3])}` : k; };
// Οι «light» και «πολλή πρωτεΐνη» βγαίνουν και αυτόματα από τις θερμίδες της μερίδας.
function recipeTags(r) {
  const tags = new Set(r.tags || []);
  if (r.perServing && r.perServing.p >= 30) tags.add('protein');
  if (r.perServing && r.perServing.kcal <= 400 && inCat(r, 'Κυρίως γεύμα')) tags.add('light');
  return [...tags];
}
const mealName = m => T(m.name, m.en);
const G = () => T('γρ.', 'g');
function foodName(f) {
  if (!f) return '';
  const base = BASE_FOODS.find(b => b.id === f.id);
  return EN() && f.en && (!base || f.name === base.name) ? f.en : f.name;
}
function portionName(food, name) {
  const p = food?.portions.find(x => x.name === name);
  return EN() && p?.en ? p.en : name;
}
const recipeName = r => (r ? (EN() && r.en && !r.edited ? r.en.name : r.name) : '');
const recipeSteps = r => (EN() && r.en && !r.edited ? r.en.steps : r.steps);
const recipeNotes = r => (EN() && r.en && !r.edited ? r.en.notes : r.notes);
// Μηνύματα λάθους: εσωτερικά μένουν στα ελληνικά (τα συγκρίνει ο κώδικας), εδώ μεταφράζονται για εμφάνιση.
const ERR_EN = { 'Λάθος PIN': 'Wrong PIN', 'Δεν υπάρχει σύνδεση': 'No connection',
  'Χρειάζεται σύνδεση': 'Please sign in again', 'Λάθος όνομα ή κωδικός': 'Wrong name or password', 'Γράψε όνομα και κωδικό': 'Enter your name and password',
  'Ο λογαριασμός περιμένει έγκριση από τη διαχειρίστρια': 'Your account is waiting for the admin to approve it',
  'Ο λογαριασμός είναι απενεργοποιημένος': 'This account has been disabled', 'Υπάρχει ήδη λογαριασμός με αυτό το όνομα': 'An account with this name already exists',
  'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες': 'The password needs at least 6 characters', 'Ο κωδικός διαχειρίστριας θέλει τουλάχιστον 8 χαρακτήρες': 'The admin password needs at least 8 characters',
  'Λάθος τωρινός κωδικός': 'Wrong current password', 'Το όνομα πρέπει να έχει 2–30 χαρακτήρες': 'The name must have 2–30 characters',
  'Πολλές λάθος προσπάθειες · ο λογαριασμός κλείδωσε για 15 λεπτά': 'Too many wrong attempts · the account is locked for 15 minutes',
  'Η Google δεν απάντησε σωστά · ξαναδοκίμασε σε λίγο': 'Google did not respond properly · try again shortly',
  'Το PIN πρέπει να έχει 4 έως 12 ψηφία': 'The PIN must have 4 to 12 digits' };
const errText = m => (EN() && ERR_EN[m]) || m;

const fmt = n => Math.round(n).toLocaleString(LOCALE());
const fmtQty = n => { const s = String(Math.round(n * 100) / 100); return EN() ? s : s.replace('.', ','); };
// 0,5 → ½ · 1,5 → 1½ (για τις συνταγές).
const frac = n => { const w = Math.floor(n), h = Math.round((n - w) * 2) === 1; return h ? (w ? `${w}½` : '½') : String(Math.round(n)); };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// Αναζήτηση χωρίς τόνους/κεφαλαία: «φετα» βρίσκει «Φέτα».
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');

function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayIso() { return isoDate(new Date()); }
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); }
function dayTitle(iso) {
  if (iso === todayIso()) return T('Σήμερα', 'Today');
  if (iso === addDays(todayIso(), -1)) return T('Χθες', 'Yesterday');
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString(LOCALE(), { weekday: 'long' });
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}
// Γεύμα με βάση την ώρα, για να είναι ήδη επιλεγμένο το σωστό.
function mealByTime() {
  const h = new Date().getHours();
  return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 18 ? 'snack' : 'dinner';
}

/* ---------- δεδομένα ---------- */
// BASE_* = η έτοιμη βάση (data/*.json). FOODS/RECIPES = η βάση + οι δικές σου αλλαγές (rebuildCatalog).
let BASE_FOODS = [], BASE_RECIPES = [], FOODS = [], RECIPES = [];
const foodById = id => FOODS.find(f => f.id === id);
const recipeById = id => RECIPES.find(r => r.id === id);
const CUSTOM_ID = 100000; // τα δικά σου τρόφιμα/συνταγές παίρνουν id από εδώ και πάνω

let data = store.get('food.data', null);
function save() { store.set('food.data', data); }
function freshData() {
  return {
    // Στοιχεία για τον υπολογισμό στόχου: ύψος (εκ.), ηλικία, φύλο f/m, κίνηση (συντελεστής), στόχος, κιλά-στόχος.
    settings: { kcalGoal: 1800, waterGoal: 8, theme: 'light', height: 0, age: 0, sex: 'f', activity: 1.375, goalType: 'lose05', targetKg: 0,
      themes: '{}' },   // θέμα ανά μέρα της εβδομάδας (JSON: { "0": "legumes", … }, 0 = Δευτέρα)
    weights: [],      // { date, kg }
    plan: [],         // προγραμματισμένα φαγητά: ίδια μορφή με log (id, date, meal, kind, ref, name, qty, unit, g, kcal, p, c, f)
    log: [],          // { id, date, meal, kind: food|recipe|quick, ref, name, qty, unit, g, kcal, p, c, f }
    water: {},        // { 'YYYY-MM-DD': ποτήρια }
    favs: [],         // 'food:12' / 'recipe:3'
    combos: [],       // { id, name, icon, items: [ίδια μορφή με log, χωρίς id/date/meal] }
    customFoods: [], foodEdits: {}, hiddenFoods: [],
    customRecipes: [], recipeEdits: {}, hiddenRecipes: [],
    users: [],        // λογαριασμοί της παρέας: { id, name, role } (μόνο ενεργοί)
    comments: [],     // σχόλια συνταγών (κοινά): { id, recipe, user, text, photo, created }
  };
}
// Παλιά αποθηκευμένα δεδομένα: συμπληρώνουμε ό,τι λείπει.
function migrate(d) {
  const f = freshData();
  for (const k in f) if (d[k] === undefined) d[k] = f[k];
  d.settings = { ...f.settings, ...d.settings };
  return d;
}
// Τυχαίο (μεγάλο) id, για να μη «συγκρουστούν» δύο φίλες που φτιάχνουν συνταγή την ίδια στιγμή.
function nextCustomId(list) { let id; do { id = CUSTOM_ID + Math.floor(Math.random() * 9e8); } while (list.some(x => x.id === id)); return id; }

function rebuildCatalog() {
  const hiddenF = new Set(data.hiddenFoods);
  FOODS = BASE_FOODS.filter(f => !hiddenF.has(f.id))
    .map(f => data.foodEdits[f.id] ? { ...f, ...data.foodEdits[f.id], edited: true } : f)
    .concat(data.customFoods.map(f => ({ ...f, custom: true })));
  const hiddenR = new Set(data.hiddenRecipes);
  RECIPES = BASE_RECIPES.filter(r => !hiddenR.has(r.id))
    .map(r => data.recipeEdits[r.id] ? { tags: r.tags, ...data.recipeEdits[r.id], id: r.id, meta: r.meta, en: r.en, edited: true } : r)
    .concat(data.customRecipes.map(r => ({ ...r, custom: true })))
    .map(computeRecipe);
}
// Θερμίδες συνταγής από τα υλικά της (με τις τρέχουσες τιμές τροφίμων).
function computeRecipe(r) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0, g: 0 };
  for (const it of r.items) {
    const x = foodById(it.food);
    if (!x) continue;
    for (const k of ['kcal', 'p', 'c', 'f']) tot[k] += x[k] * it.g / 100;
    tot.g += it.g;
  }
  const s = r.servings || 1;
  return { ...r, total: roundAll(tot, 1), perServing: roundAll(tot, s) };
}
const roundAll = (o, div) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v / div)]));
// Γραμμάρια ενός υλικού από ποσότητα + μονάδα (γρ / τεμ / όνομα μερίδας).
function itemGrams(food, qty, unit) {
  if (unit === 'γρ') return qty;
  const p = unit === 'τεμ' ? food.portions.find(x => x.piece) || food.portions[0] : food.portions.find(x => x.name === unit);
  return qty * (p ? p.g : 0);
}
const isFav = key => data.favs.includes(key);
function toggleFav(key) {
  const on = !isFav(key);
  data.favs = on ? [...data.favs, key] : data.favs.filter(k => k !== key);
  save();
  if (on) { const [k, id] = key.split(':'); push('favs', [{ id: key, name: (k === 'recipe' ? recipeById(+id) : foodById(+id))?.name || '' }]); }
  else drop('favs', [key]);
}

/* ============ σύνδεση με το Google Sheet ============
 * Κάθε αλλαγή γίνεται αμέσως εδώ (για να είναι γρήγορο) και μπαίνει σε ουρά που στέλνεται στο Sheet.
 * Χωρίς internet η ουρά περιμένει και στέλνεται μόλις γυρίσει η σύνδεση (όπως στο Household Desk).
 */
// Η διεύθυνση του Apps Script (μπαίνει εδώ μόλις γίνει η ανάπτυξη), ώστε να χρειάζεται μόνο PIN.
const API_URL = 'https://script.google.com/macros/s/AKfycbwzuoy90XYCzb0_z6BMWmpRaxheEyrfreKn_sPMaO5aXUOKHb4jVKj4MKvdJTDYqSkY4Q/exec';
let cfg = store.get('food.cfg', null);           // { url, token, me: { id, name, role } } · url === 'demo' = δοκιμή χωρίς Sheet
// Παλιά σύνδεση με PIN (πριν τους λογαριασμούς): χρειάζεται νέα είσοδος.
if (cfg && cfg.url !== 'demo' && !cfg.token) cfg = null;
let queue = store.get('food.queue', []);         // [{ action: put|del, sheet, rows|ids }]
const online = () => cfg && cfg.url && cfg.url !== 'demo';

/* ---------- λογαριασμοί ---------- */
const me = () => cfg?.me || null;
const isAdmin = () => !online() || me()?.role === 'admin';
const userName = id => (data.users || []).find(u => u.id === id)?.name || (id && id === me()?.id ? me().name : T('μια φίλη', 'a friend'));
const adminName = () => (data.users || []).find(u => u.role === 'admin')?.name || (isAdmin() ? me()?.name : '') || 'Admin';
// Αλλάζει μια κοινή συνταγή/τρόφιμο μόνο η διαχειρίστρια ή όποια το πρόσθεσε.
const canEditRecipe = r => isAdmin() || (r.custom && r.author === me()?.id);
const canEditFood = f => isAdmin() || (f.custom && f.author === me()?.id);
const AUTH_ERR = /^(Χρειάζεται σύνδεση|Λάθος όνομα|Ο λογαριασμός|Πολλές λάθος|Γράψε όνομα)/;
const pendingText = () => T(`👑 ${ui.pending} αίτηση/εις λογαριασμού σε αναμονή · Ρυθμίσεις → Διαχείριση`, `👑 ${ui.pending} account request(s) waiting · Settings → Manage accounts`);
const shortDate = s => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString(LOCALE(), { day: 'numeric', month: 'short' }); };

async function api(action, payload = {}, tries = action === 'all' ? 3 : 1) {
  for (let i = 1; ; i++) {
    try { return await apiOnce(action, payload); } catch (e) {
      if (i >= tries || AUTH_ERR.test(e.message)) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
async function apiOnce(action, payload) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    // text/plain: το Apps Script δεν δέχεται «preflight» αιτήματα.
    res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ token: cfg.token, action, ...payload }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal });
  } catch (e) {
    throw new Error('Δεν υπάρχει σύνδεση');
  } finally { clearTimeout(t); }
  let j;
  // Όταν η Google έχει πρόβλημα απαντάει με σελίδα HTML αντί για δεδομένα.
  try { j = JSON.parse(await res.text()); } catch { throw new Error('Η Google δεν απάντησε σωστά · ξαναδοκίμασε σε λίγο'); }
  if (!j.ok) throw new Error(j.error || 'Σφάλμα');
  // Αν η Google «έχασε» το αίτημα, γυρνάει την απλή σελίδα (doGet) αντί για δεδομένα.
  if (j.data === 'Food Desk API' || (action === 'all' && (!j.data || !Array.isArray(j.data.foods)))) throw new Error('Η Google δεν απάντησε σωστά · ξαναδοκίμασε σε λίγο');
  return j.data;
}

function push(sheet, rows) { if (online() && rows.length) enqueue({ action: 'put', sheet, rows }); }
function drop(sheet, ids) { if (online() && ids.length) enqueue({ action: 'del', sheet, ids }); }
function enqueue(op) { queue.push(op); store.set('food.queue', queue); flush(); }

let flushing = null;
function flush() {
  if (flushing || !online()) return flushing;
  flushing = (async () => {
    let failed = false;
    while (queue.length) {
      const op = queue[0];
      try {
        await api(op.action, op.action === 'put' ? { sheet: op.sheet, rows: op.rows } : { sheet: op.sheet, ids: op.ids });
      } catch (e) {
        if (e.message === 'Χρειάζεται σύνδεση') { logout(); toast(errText(e.message)); break; }
        // Αλλαγή που δεν επιτρέπεται (π.χ. σε συνταγή άλλης): πετιέται, για να μην κολλήσει η ουρά.
        if (e.message.startsWith('Δεν επιτρέπεται')) { toast(errText(e.message)); queue.shift(); store.set('food.queue', queue); continue; }
        failed = true;
        break;
      }
      queue.shift();
      store.set('food.queue', queue);
    }
    showPending(failed);
  })().finally(() => { flushing = null; });
  return flushing;
}
function showPending(failed) {
  const el = $('#pending');
  if (!el) return;
  el.hidden = !queue.length || !failed;
  el.textContent = `📴 ${queue.length}`;
  el.title = T('Δεν στάλθηκαν ακόμα στο Sheet · θα σταλούν μόλις υπάρξει internet', 'Not sent to the Sheet yet · will be sent when online');
}

/* ---------- γραμμές του Sheet ↔ δεδομένα του site ---------- */
const portionsText = ps => ps.map(p => `${p.name}:${p.g}${p.piece ? '*' : ''}`).join('; ');
const parsePortions = s => String(s || '').split(';').map(x => x.trim()).filter(Boolean).map(x => {
  const k = x.lastIndexOf(':'), piece = x.endsWith('*');
  return { name: x.slice(0, k).trim(), g: parseFloat(x.slice(k + 1).replace('*', '').replace(',', '.')) || 0, piece };
}).filter(p => p.name && p.g > 0);
const itemsText = items => items.map(it => `${it.name} — ${it.unit === 'γρ' ? `${Math.round(it.g)} γρ.` : `${fmtQty(it.qty)} ${it.unit === 'τεμ' ? 'τεμ.' : it.unit}`}`).join('\n');

function foodRowOut(id) {
  const base = BASE_FOODS.find(f => f.id === id), custom = data.customFoods.find(f => f.id === id);
  const f = custom || (base && { ...base, ...(data.foodEdits[id] || {}) });
  if (!f) return null;
  return { id, name: f.name, cat: f.cat, kcal: f.kcal, p: f.p, c: f.c, f: f.f, use: f.use, portions: portionsText(f.portions), // το author το βάζει ο server
    origin: custom ? 'δικό μου' : data.foodEdits[id] ? 'διορθωμένο' : 'βάση', hidden: data.hiddenFoods.includes(id) };
}
function recipeRowOut(id) {
  const base = BASE_RECIPES.find(r => r.id === id), custom = data.customRecipes.find(r => r.id === id);
  const r = custom || data.recipeEdits[id] || base;
  if (!r) return null;
  return { id, name: r.name, icon: r.icon, cat: r.cat, type: r.type === 'prep' ? 'prep' : 'recipe', tags: (r.tags || []).join(','), servings: r.servings, itemsText: itemsText(r.items), steps: r.steps.join('\n'), notes: r.notes.join('\n'),
    origin: custom ? 'δική μου' : data.recipeEdits[id] ? 'αλλαγμένη' : 'βάση', hidden: data.hiddenRecipes.includes(id),
    items: JSON.stringify(r.items.map(({ food, name, qty, unit, g }) => ({ food, name, qty, unit, g }))) };
}
const comboRowOut = c => ({ id: c.id, name: c.name, icon: c.icon, itemsText: c.items.map(e => `${e.name} (${fmt(e.kcal)} kcal)`).join('\n'), items: JSON.stringify(c.items) });
const SET_NUM = ['kcalGoal', 'waterGoal', 'height', 'age', 'activity', 'targetKg'], SET_STR = ['sex', 'goalType', 'themes'];
const settingsRows = () => [...SET_NUM, ...SET_STR].map(k => ({ id: k, value: String(data.settings[k] ?? '') }));
const boolOf = v => v === true || String(v).toUpperCase() === 'TRUE';
const numOf = v => typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')) || 0;

/** Φτιάχνει τα δεδομένα του site από αυτά που γύρισε το Sheet. */
function fromSheet(all) {
  const d = freshData();
  d.settings.theme = data?.settings?.theme || 'light';
  for (const r of all.settings) {
    if (SET_NUM.includes(r.id)) d.settings[r.id] = numOf(r.value) || d.settings[r.id];
    else if (SET_STR.includes(r.id) && r.value !== '') d.settings[r.id] = String(r.value);
  }
  d.plan = (all.plan || []).map(r => ({ id: String(r.id), date: String(r.date), meal: r.meal, kind: r.kind, ref: r.kind === 'quick' ? null : numOf(r.ref),
    name: String(r.name), qty: numOf(r.qty), unit: String(r.unit), g: numOf(r.g), kcal: numOf(r.kcal), p: numOf(r.p), c: numOf(r.c), f: numOf(r.f) }));
  d.weights = (all.weight || []).map(r => ({ date: String(r.id), kg: numOf(r.kg) })).filter(w => w.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  d.log = all.log.map(r => ({ id: String(r.id), date: String(r.date), meal: r.meal, kind: r.kind, ref: r.kind === 'quick' ? null : numOf(r.ref),
    name: String(r.name), qty: numOf(r.qty), unit: String(r.unit), g: numOf(r.g), kcal: numOf(r.kcal), p: numOf(r.p), c: numOf(r.c), f: numOf(r.f) }));
  for (const r of all.water) d.water[String(r.id)] = numOf(r.glasses);
  d.users = (all.users || []).map(u => ({ id: String(u.id), name: String(u.name), role: String(u.role) }));
  d.comments = (all.comments || []).map(c => ({ id: String(c.id), recipe: numOf(c.recipe), user: String(c.user), text: String(c.text || ''), photo: String(c.photo || ''), created: String(c.created || '') }))
    .sort((a, b) => a.created.localeCompare(b.created));
  d.favs = all.favs.map(r => String(r.id));
  d.combos = all.combos.map(r => { try { return { id: String(r.id), name: String(r.name), icon: String(r.icon), items: JSON.parse(r.items) }; } catch { return null; } }).filter(Boolean);
  // Τρόφιμα: ό,τι διαφέρει από τη βάση μετράει ως διόρθωση (ακόμα κι αν άλλαξες κάτι απευθείας στο Sheet).
  for (const r of all.foods) {
    const id = numOf(r.id);
    const f = { name: String(r.name), cat: String(r.cat), kcal: numOf(r.kcal), p: numOf(r.p), c: numOf(r.c), f: numOf(r.f), use: String(r.use || 'Φ'), portions: parsePortions(r.portions) };
    if (!f.portions.length) f.portions = [{ name: 'μερίδα', g: 100, piece: true }];
    if (boolOf(r.hidden)) d.hiddenFoods.push(id);
    const base = BASE_FOODS.find(x => x.id === id);
    if (id >= CUSTOM_ID || !base) d.customFoods.push({ id, ...f, author: String(r.author || '') });
    else if (['name', 'cat', 'kcal', 'p', 'c', 'f', 'use'].some(k => String(base[k]) !== String(f[k])) || portionsText(base.portions) !== portionsText(f.portions)) d.foodEdits[id] = f;
  }
  for (const r of all.recipes) {
    const id = numOf(r.id);
    let items;
    try { items = JSON.parse(r.items); } catch { items = null; }
    const base = BASE_RECIPES.find(x => x.id === id);
    if (boolOf(r.hidden)) d.hiddenRecipes.push(id);
    if (!items) continue;
    const lines = s => String(s || '').split('\n').map(x => x.trim()).filter(Boolean);
    const rec = { name: String(r.name), icon: String(r.icon), cat: String(r.cat), type: String(r.type || '') === 'prep' ? 'prep' : 'recipe',
      tags: String(r.tags || '').split(',').map(t => t.trim()).filter(Boolean), servings: numOf(r.servings) || 1, items, steps: lines(r.steps), notes: lines(r.notes) };
    if (id >= CUSTOM_ID || !base) d.customRecipes.push({ id, ...rec, author: String(r.author || '') });
    // Βασική συνταγή: μετράει ως αλλαγμένη μόνο όταν το λέει η «Προέλευση» (τη σημειώνει μόνο του το Sheet όταν την αλλάζεις με το χέρι).
    else if (String(r.origin) === 'αλλαγμένη' || false || rec.steps.join('\n') !== base.steps.join('\n') || rec.notes.join('\n') !== base.notes.join('\n')) d.recipeEdits[id] = rec;
  }
  return d;
}

/** Φέρνει τα πάντα από το Sheet. Την πρώτη φορά γεμίζει τα Τρόφιμα και τις Συνταγές. */
let refreshing = null;
function refresh() {
  if (!refreshing) refreshing = doRefresh().finally(() => { refreshing = null; });
  return refreshing;
}
async function seedInChunks(sheet, rows, label) {
  for (let i = 0; i < rows.length; i += 150) {
    toast(T(`Πρώτη φορά: στήνω το Sheet σου… ${label} `, `First time: setting up your Sheet… `) + `${Math.min(i + 150, rows.length)}/${rows.length} ⏳`);
    await api('put', { sheet, rows: rows.slice(i, i + 150) });
  }
}
async function doRefresh() {
  if (!online()) return false;
  await flush();
  if (queue.length) return false; // πρώτα να σταλούν οι αλλαγές, αλλιώς θα «γύριζαν πίσω»
  document.body.classList.add('busy');
  try {
    let all = await api('all');
    const counts = all.counts || { foods: all.foods.length, recipes: all.recipes.length };
    if (all.me) { cfg.me = all.me; store.set('food.cfg', cfg); }
    // Τη βάση (τρόφιμα/συνταγές του site) τη γράφει στο Sheet μόνο η διαχειρίστρια.
    if (isAdmin() && (counts.foods < BASE_FOODS.length || counts.recipes < BASE_RECIPES.length)) {
      // Σε κομμάτια (put = upsert), ώστε ένα διακοπτόμενο γέμισμα να συνεχίζει από εκεί που έμεινε.
      // put = upsert: ό,τι υπάρχει ήδη απλά ξαναγράφεται ίδιο, οπότε ένα διακοπτόμενο γέμισμα συνεχίζει με ασφάλεια.
      if (counts.foods < BASE_FOODS.length) await seedInChunks('foods', BASE_FOODS.slice(Math.max(0, counts.foods - 5)).map(f => foodRowOut(f.id)), 'τρόφιμα');
      if (counts.recipes < BASE_RECIPES.length) await seedInChunks('recipes', BASE_RECIPES.map(r => recipeRowOut(r.id)), 'συνταγές');
      all = await api('all');
    }
    if (!all.settings.length) { await api('put', { sheet: 'settings', rows: settingsRows() }); all = await api('all'); }
    data = fromSheet(all);
    save(); rebuildCatalog(); render();
    ui.pending = all.pending || 0;
    if (isAdmin() && ui.pending && ui.pendingSeen !== ui.pending) { ui.pendingSeen = ui.pending; setTimeout(() => toast(pendingText()), 2600); }
    if (me()?.mustChange && !ui.pinAsked) { ui.pinAsked = true; openChangePin(true); }
    return true;
  } catch (e) {
    if (e.message === 'Χρειάζεται σύνδεση') { logout(); toast(errText(e.message)); }
    else toast(e.message === 'Δεν υπάρχει σύνδεση' ? T('📴 Χωρίς internet · βλέπεις τα τελευταία δεδομένα', '📴 Offline · showing your latest data') : errText(e.message));
    return false;
  } finally { document.body.classList.remove('busy'); }
}
function logout() {
  if (online() && cfg.token) api('logout').catch(() => {});
  cfg = null; store.set('food.cfg', null);
  data = freshData(); save(); rebuildCatalog();
  queue = []; store.set('food.queue', []);
  render();
}

const ui = { tab: 'today', day: todayIso(), recCat: 'Όλες' };

/* ---------- υπολογισμοί ---------- */
function dayEntries(iso) { return data.log.filter(e => e.date === iso); }
function totals(entries) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const e of entries) for (const k in t) t[k] += e[k] || 0;
  return t;
}
function nutrFor(food, g) {
  const k = g / 100;
  return { kcal: food.kcal * k, p: food.p * k, c: food.c * k, f: food.f * k };
}
// Πρόσφατα: ό,τι έχεις γράψει, πιο συχνά/πιο πρόσφατα πρώτα.
function recentItems(limit = 12) {
  const score = new Map();
  data.log.slice(-200).forEach((e, i) => {
    if (e.kind === 'quick') return;
    const key = `${e.kind}:${e.ref}`;
    const s = score.get(key) || { key, n: 0, last: 0, e };
    s.n++; s.last = i; s.e = e;
    score.set(key, s);
  });
  return [...score.values()].sort((a, b) => (b.n + b.last / 50) - (a.n + a.last / 50)).slice(0, limit);
}

/* ---------- render ---------- */
function render() {
  const out = !cfg;
  document.body.classList.toggle('logged-out', out);
  $('#refreshBtn').hidden = !online();
  if (out) return renderLogin($('#view'));
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === ui.tab));
  const labels = { today: T('Σήμερα', 'Today'), progress: T('Πρόοδος', 'Progress'), recipes: T('Συνταγές', 'Recipes'), plan: T('Πρόγραμμα', 'Plan') };
  $('#settingsBtn').classList.toggle('on', ui.tab === 'settings');
  $('#settingsBtn').setAttribute('aria-label', T('Ρυθμίσεις', 'Settings'));
  $$('.tabbar [data-label]').forEach(s => { s.textContent = labels[s.dataset.label]; });
  document.documentElement.lang = LANG;
  const v = $('#view');
  ({ today: renderToday, progress: renderProgress, recipes: renderRecipes, plan: renderPlan, settings: renderSettings })[ui.tab](v);
}

function ring(eaten, goal) {
  const r = 64, C = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const cls = statusOf(eaten, goal);
  const color = { ok: 'var(--ok)', near: 'var(--near)', over: 'var(--over)' }[cls];
  return `<div class="ring" role="img" aria-label="${fmt(eaten)} ${T('από', 'of')} ${fmt(goal)} ${T('θερμίδες', 'calories')}">
    <svg viewBox="0 0 150 150"><circle class="track" cx="75" cy="75" r="${r}" stroke-width="13"/>
      <circle class="val" cx="75" cy="75" r="${r}" stroke-width="13" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
    <div class="ring-center"><b>${fmt(eaten)}</b><span>${T('από', 'of')} ${fmt(goal)} kcal</span></div>
  </div>`;
}
function statusOf(eaten, goal) { return eaten > goal ? 'over' : eaten >= goal * 0.9 ? 'near' : 'ok'; }

function renderToday(v) {
  const day = ui.day, entries = dayEntries(day), t = totals(entries);
  const goal = data.settings.kcalGoal, left = goal - t.kcal, st = statusOf(t.kcal, goal);
  const statusText = st === 'over' ? T(`Πέρασες τον στόχο κατά ${fmt(-left)} kcal`, `${fmt(-left)} kcal over your goal`) : T(`Σου μένουν ${fmt(left)} kcal`, `${fmt(left)} kcal left`);
  const glasses = data.water[day] || 0, wGoal = data.settings.waterGoal;
  const isToday = day === todayIso();

  v.innerHTML = `
    <div class="daynav">
      <button class="icon-btn" id="dPrev" aria-label="${T('Προηγούμενη μέρα', 'Previous day')}"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2>${dayTitle(day)}</h2>
      <button class="icon-btn" id="dNext" aria-label="${T('Επόμενη μέρα', 'Next day')}" ${isToday ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <section class="card">
      <div class="hero">
        ${ring(t.kcal, goal)}
        <div class="hero-info">
          <p class="hero-status ${st}">${statusText}</p>
          <div class="muted small">${fmt(t.kcal)} / ${fmt(goal)} ${T('θερμίδες', 'calories')} ${isToday ? T('για σήμερα', 'today') : ''}</div>
          ${macrosHtml(t)}
        </div>
      </div>
    </section>
    <section class="card">
      <div class="water">
        <div><b>💧 ${T('Νερό', 'Water')}</b><div class="muted small">${glasses} / ${wGoal} ${T('ποτήρια', 'glasses')} · ${(glasses * GLASS_ML / 1000).toLocaleString(LOCALE())} ${T('λίτρα', 'litres')}</div></div>
        <button class="btn small" id="wMinus" aria-label="${T('Ένα ποτήρι λιγότερο', 'One glass less')}" ${glasses ? '' : 'disabled'}>−</button>
        <button class="btn small primary" id="wPlus">${T('+ ποτήρι', '+ glass')}</button>
      </div>
      <div class="water-glasses" style="margin-top:10px">${Array.from({ length: Math.max(wGoal, glasses) }, (_, i) => `<button class="glass ${i < glasses ? 'full' : ''}" data-g="${i + 1}" aria-label="${i + 1} ${T('ποτήρια', 'glasses')}"></button>`).join('')}</div>
    </section>
    ${todayPlanCard(day)}
    ${isToday ? fitsCard(day, left) : ''}
    ${MEALS.map(m => {
      const es = entries.filter(e => e.meal === m.key), mt = totals(es);
      const prev = es.length ? [] : dayEntries(addDays(day, -1)).filter(e => e.meal === m.key);
      return `<section class="meal">
        <div class="meal-head"><h3>${m.icon} ${mealName(m)}</h3><span>${es.length ? fmt(mt.kcal) + ' kcal' : ''}
          ${es.length ? `<button class="mini-btn" data-combo="${m.key}" title="${T('Αποθήκευσε ως συνδυασμό', 'Save as combo')}">🍱 ${T('Συνδυασμός', 'Combo')}</button>` : ''}</span></div>
        ${es.length ? `<div class="list">${es.map(entryRow).join('')}</div>` : ''}
        <div class="meal-actions" style="margin-top:${es.length ? 8 : 0}px">
          <button class="add-meal" data-meal="${m.key}">${T(`+ Πρόσθεσε στο ${m.name.toLowerCase()}`, `+ Add to ${m.en.toLowerCase()}`)}</button>
          ${prev.length ? `<button class="add-meal again" data-again="${m.key}">🔁 ${T('Όπως χθες', 'Same as yesterday')} · ${fmt(totals(prev).kcal)} kcal</button>` : ''}
        </div>
      </section>`;
    }).join('')}`;

  $('#dPrev', v).onclick = () => { ui.day = addDays(ui.day, -1); render(); };
  $('#dNext', v).onclick = () => { if (!isToday) { ui.day = addDays(ui.day, 1); render(); } };
  const setWater = n => { data.water[day] = Math.max(0, n); save(); push('water', [{ id: day, glasses: data.water[day] }]); render(); };
  $('#wPlus', v).onclick = () => setWater(glasses + 1);
  $('#wMinus', v).onclick = () => setWater(glasses - 1);
  $$('.glass', v).forEach(b => b.onclick = () => setWater(+b.dataset.g === glasses ? glasses - 1 : +b.dataset.g));
  $$('[data-meal]', v).forEach(b => b.onclick = () => openAdd(b.dataset.meal));
  $$('[data-again]', v).forEach(b => b.onclick = () => {
    const prev = dayEntries(addDays(day, -1)).filter(e => e.meal === b.dataset.again);
    addItems(prev, b.dataset.again, day, `${T('Όπως χθες', 'Same as yesterday')}: +${fmt(totals(prev).kcal)} kcal ✓`);
  });
  $$('[data-combo]', v).forEach(b => b.onclick = () => saveCombo(entries.filter(e => e.meal === b.dataset.combo), b.dataset.combo));
  $$('[data-entry]', v).forEach(b => b.onclick = () => openEntry(data.log.find(e => e.id === b.dataset.entry)));
  $$('[data-tplan]', v).forEach(b => b.onclick = () => openPlanItem(data.plan.find(p => p.id === b.dataset.tplan)));
  $$('[data-tate]', v).forEach(b => b.onclick = e => { e.stopPropagation(); ateFromPlan(data.plan.find(p => p.id === b.dataset.tate)); });
  $$('[data-fit]', v).forEach(b => b.onclick = () => { const [k, id] = b.dataset.fit.split(':'); k === 'recipe' ? openPortion({ recipe: recipeById(+id), meal: mealByTime(), day }) : openPortion({ food: foodById(+id), meal: mealByTime(), day }); });
}

/** «Σήμερα στο πρόγραμμα»: ό,τι έχεις προγραμματίσει για τη μέρα, με «✅» για να το γράψεις με ένα πάτημα. */
function todayPlanCard(day) {
  const items = planOf(day);
  if (!items.length) return '';
  const th = dayTheme(day);
  return `<section class="card">
    <div class="card-head"><h2>📅 ${T('Στο πρόγραμμα', 'On the plan')}</h2>${th ? `<span class="chip theme-chip">${esc(themeName(th))}</span>` : ''}</div>
    <div class="list flat">${MEALS.flatMap(m => items.filter(p => p.meal === m.key).map(p => {
      const done = planDone(p);
      return `<div class="item ${done ? 'is-done' : ''}" data-tplan="${p.id}" role="button" tabindex="0"><span class="ico">${m.icon}</span>
        <span class="txt"><b>${esc(entryName(p))}</b><small>${mealName(m)} · ${fmt(p.kcal)} kcal</small></span>
        ${done ? `<span class="ok-txt small">✓ ${T('έγινε', 'done')}</span>` : `<button class="btn small" data-tate="${p.id}">✅ ${T('Το έφαγα', 'Ate it')}</button>`}</div>`;
    })).join('')}</div></section>`;
}
/** «Χωράνε ακόμα»: 3 προτάσεις για το επόμενο γεύμα, με βάση τις θερμίδες που σου μένουν. */
function fitsCard(day, left) {
  if (left < 150 || !dayEntries(day).length) return '';
  const meal = mealByTime(), target = mealTarget(day, meal, data.settings.kcalGoal - left);
  const list = suggest(meal, Math.min(target || left, left), dayTheme(day), 3);
  if (!list.length) return '';
  return `<section class="card">
    <h2>💡 ${T(`Χωράνε ακόμα · ${fmt(left)} kcal`, `Still fits · ${fmt(left)} kcal`)}</h2>
    <div class="list flat">${list.map(c => `<button class="item" data-fit="${c.kind}:${c.x.id}"><span class="ico">${c.kind === 'recipe' ? c.x.icon : CAT_ICONS[c.x.cat] || '🍴'}</span>
      <span class="txt"><b>${esc(c.kind === 'recipe' ? recipeName(c.x) : foodName(c.x))}</b><small>${esc(c.kind === 'recipe' ? T('1 μερίδα', '1 serving') : portionName(c.x, c.x.portions[0].name))} · ${fmt(c.kcal)} kcal</small></span></button>`).join('')}</div>
  </section>`;
}

/** Προσθέτει πολλά μαζί (όπως χθες / συνδυασμός), με «Αναίρεση». */
function addItems(items, meal, day, msg) {
  const added = items.map(({ id, date, meal: _m, ...rest }) => ({ ...rest, id: newId(), date: day, meal }));
  data.log.push(...added);
  push('log', added);
  save(); closeSheet(); ui.tab = 'today'; ui.day = day; render();
  const ids = new Set(added.map(e => e.id));
  toast(msg, () => { data.log = data.log.filter(e => !ids.has(e.id)); save(); drop('log', [...ids]); render(); });
}

/* ---------- συνδυασμοί ---------- */
const COMBO_ICONS = ['☀️', '🥪', '☕', '🥗', '🍝', '🍎', '🥛', '🍳', '🥣', '🌙', '⭐', '💪'];
async function saveCombo(entries, meal, combo) {
  const body = openSheet(combo ? T('Συνδυασμός', 'Combo') : T('Νέος συνδυασμός', 'New combo'));
  const st = { icon: combo?.icon || MEALS.find(m => m.key === meal)?.icon || '⭐' };
  const items = combo ? combo.items : entries.map(({ id, date, meal: _m, ...rest }) => rest);
  body.innerHTML = `
    <p class="muted small" style="margin-top:4px">${T('Με ένα πάτημα θα προσθέτεις όλα αυτά μαζί.', 'One tap will add all of these together.')}</p>
    <div class="list">${items.map(e => `<div class="item"><span class="ico">${entryIcon(e)}</span><span class="txt"><b>${esc(entryName(e))}</b><small>${esc(e.kind === 'quick' ? T('στο περίπου', 'estimate') : qtyLabel(e))}</small></span><span class="kcal">${fmt(e.kcal)} <small>kcal</small></span></div>`).join('')}</div>
    <label class="field"><span>${T('Όνομα', 'Name')}</span><input id="cName" value="${esc(combo?.name || '')}" placeholder="${T('π.χ. Το πρωινό μου', 'e.g. My breakfast')}"></label>
    <div class="chips" id="cIcons">${COMBO_ICONS.map(i => `<button class="chip emoji-chip" data-i="${i}">${i}</button>`).join('')}</div>
    <div class="actions">${combo ? `<button class="btn danger" id="cDel">${T('Διαγραφή', 'Delete')}</button>` : ''}<button class="btn primary" id="cSave">${T('Αποθήκευση', 'Save')} · ${fmt(totals(items).kcal)} kcal</button></div>`;
  const drawIcons = () => $$('#cIcons .chip', body).forEach(b => b.classList.toggle('on', b.dataset.i === st.icon));
  $$('#cIcons .chip', body).forEach(b => b.onclick = () => { st.icon = b.dataset.i; drawIcons(); });
  drawIcons();
  $('#cSave', body).onclick = () => {
    const name = $('#cName', body).value.trim();
    if (!name) return toast(T('Δώσε ένα όνομα', 'Give it a name'));
    const c = combo ? Object.assign(combo, { name, icon: st.icon }) : { id: newId(), name, icon: st.icon, items };
    if (!combo) data.combos.push(c);
    push('combos', [comboRowOut(c)]);
    save(); closeSheet(); render(); toast(T('Ο συνδυασμός αποθηκεύτηκε ✓', 'Combo saved ✓'));
  };
  if (combo) $('#cDel', body).onclick = () => {
    data.combos = data.combos.filter(c => c !== combo); save(); drop('combos', [combo.id]); closeSheet(); render();
    toast(T('Διαγράφηκε', 'Deleted'), () => { data.combos.push(combo); save(); push('combos', [comboRowOut(combo)]); render(); });
  };
  setTimeout(() => $('#cName', body).focus(), 80);
}

function entryIcon(e) {
  if (e.kind === 'recipe') return recipeById(e.ref)?.icon || '🍲';
  if (e.kind === 'quick') return '✍️';
  return CAT_ICONS[foodById(e.ref)?.cat] || '🍴';
}
function qtyLabel(e) {
  if (e.unit === 'γρ') return `${fmt(e.g)} ${G()}`;
  if (e.kind === 'recipe') return `${fmtQty(e.qty)} ${e.qty === 1 ? T('μερίδα', 'serving') : T('μερίδες', 'servings')}`;
  const unit = portionName(foodById(e.ref), e.unit);
  return e.qty === 1 ? unit : `${fmtQty(e.qty)} × ${unit}`;
}
// Όνομα καταγραφής στη γλώσσα που έχεις διαλέξει (αν υπάρχει ακόμα το τρόφιμο/η συνταγή).
function entryName(e) {
  if (e.kind === 'food') { const f = foodById(e.ref); return f ? foodName(f) : e.name; }
  if (e.kind === 'recipe') { const r = recipeById(e.ref); return r ? recipeName(r) : e.name; }
  return e.name;
}
const favLabel = on => (on ? T('⭐ Στα αγαπημένα', '⭐ In favourites') : T('☆ Αγαπημένο', '☆ Favourite'));
function macrosHtml(n) {
  return `<div class="macros"><div class="macro"><b>${fmt(n.p)}${G()}</b><span>${T('Πρωτεΐνη', 'Protein')}</span></div><div class="macro"><b>${fmt(n.c)}${G()}</b><span>${T('Υδατάνθ.', 'Carbs')}</span></div><div class="macro"><b>${fmt(n.f)}${G()}</b><span>${T('Λιπαρά', 'Fat')}</span></div></div>`;
}
function entryRow(e) {
  return `<button class="item" data-entry="${e.id}">
    <span class="ico">${entryIcon(e)}</span>
    <span class="txt"><b>${esc(entryName(e))}</b><small>${e.kind === 'quick' ? T('στο περίπου', 'estimate') : esc(qtyLabel(e))}</small></span>
    <span class="kcal">${fmt(e.kcal)} <small>kcal</small></span>
  </button>`;
}

/* ---------- προσθήκη φαγητού ---------- */
function openAdd(meal = mealByTime(), day = ui.day) {
  const body = openSheet(T('Τι έφαγες;', 'What did you eat?'));
  const st = { meal, q: '', cat: null };
  body.innerHTML = `
    <div class="seg" id="aMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${mealName(m)}</button>`).join('')}</div>
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="aQ" type="search" placeholder="${T('Ψάξε, π.χ. φέτα, τοστ, καπουτσίνο…', 'Search, e.g. feta, toastie, cappuccino…')}" autocomplete="off"></label>
    <div class="chips scroll" id="aCats"></div>
    <div class="results" id="aRes"></div>
    <div class="row2" style="margin-top:14px">
      <button class="btn" id="aQuick">✍️ ${T('Στο περίπου', 'Estimate')}</button>
      <button class="btn" id="aNew">➕ ${T('Νέο τρόφιμο', 'New food')}</button>
    </div>`;

  const cats = ['⭐ Για σένα', '📖 Συνταγές', ...Object.keys(CAT_ICONS)];
  const catLabel = (c, i) => i === 0 ? T('⭐ Για σένα', '⭐ For you') : i === 1 ? T('📖 Συνταγές', '📖 Recipes') : `${CAT_ICONS[c]} ${catName(c)}`;
  $('#aCats', body).innerHTML = cats.map((c, i) => `<button class="chip" data-c="${i}">${esc(catLabel(c, i))}</button>`).join('');
  const markMeal = () => $$('#aMeal button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.meal));
  $$('#aMeal button', body).forEach(b => b.onclick = () => { st.meal = b.dataset.m; markMeal(); });
  markMeal();

  const pick = (kind, ref) => kind === 'recipe' ? openPortion({ recipe: recipeById(ref), meal: st.meal, day }) : openPortion({ food: foodById(ref), meal: st.meal, day });
  const draw = () => {
    $$('#aCats .chip', body).forEach(b => b.classList.toggle('on', st.cat === +b.dataset.c && !st.q));
    const res = $('#aRes', body);
    let html = '';
    if (st.q) {
      const words = fold(st.q).split(/\s+/).filter(Boolean);
      // Ψάχνει και στα ελληνικά και στα αγγλικά ονόματα.
      const match = (...names) => names.some(name => { if (!name) return false; const n = fold(name); return words.every(w => n.includes(w)); });
      const recs = RECIPES.filter(r => match(r.name, r.en?.name)).slice(0, 8);
      // Πρώτα όσα ξεκινάνε με τη λέξη, μετά τα υπόλοιπα.
      const shown = f => fold(foodName(f));
      // Σειρά: ολόκληρη λέξη (π.χ. «egg» → Egg, όχι Eggplant) → ξεκινάει με τη λέξη → πιο σύντομο όνομα.
      const whole = f => shown(f).split(/[^a-z0-9α-ω]+/).includes(words[0]);
      const foods = FOODS.filter(f => f.use !== 'Υ' && match(f.name, f.en))
        .sort((a, b) => (whole(b) - whole(a)) || (shown(b).startsWith(words[0]) - shown(a).startsWith(words[0])) || foodName(a).length - foodName(b).length).slice(0, 40);
      if (recs.length) html += `<div class="section-label">${T('Οι συνταγές σου', 'Your recipes')}</div><div class="list">${recs.map(recRow).join('')}</div>`;
      if (foods.length) html += `<div class="section-label">${T('Τρόφιμα', 'Foods')}</div><div class="list">${foods.map(foodRow).join('')}</div>`;
      if (!html) html = T(`<div class="empty">Δεν βρέθηκε «${esc(st.q)}».<br>Γράψ' το στο περίπου από κάτω 👇</div>`, `<div class="empty">Nothing found for “${esc(st.q)}”.<br>Log it as an estimate below 👇</div>`);
    } else if (st.cat === 0) {
      const rowOf = key => { const [k, id] = key.split(':'); const x = k === 'recipe' ? recipeById(+id) : foodById(+id); return x ? (k === 'recipe' ? recRow(x) : foodRow(x)) : ''; };
      const favs = data.favs.map(rowOf).filter(Boolean);
      const rec = recentItems().filter(r => !isFav(r.key)).map(r => rowOf(r.key)).filter(Boolean);
      if (data.combos.length) html += `<div class="section-label">🍱 ${T('Συνδυασμοί · ένα πάτημα', 'Combos · one tap')}</div><div class="combo-grid">${data.combos.map(c =>
        `<button class="combo" data-cb="${c.id}"><span>${c.icon}</span><b>${esc(c.name)}</b><small>${fmt(totals(c.items).kcal)} kcal</small></button>`).join('')}</div>`;
      if (favs.length) html += `<div class="section-label">⭐ ${T('Αγαπημένα', 'Favourites')}</div><div class="list">${favs.join('')}</div>`;
      if (rec.length) html += `<div class="section-label">🕒 ${T('Πρόσφατα', 'Recent')}</div><div class="list">${rec.join('')}</div>`;
      if (!html) html = T(`<div class="empty">Εδώ θα βλέπεις τα αγαπημένα σου ⭐, ό,τι γράφεις συχνά και τους συνδυασμούς σου 🍱.<br>Ψάξε κάτι από πάνω ή διάλεξε κατηγορία.</div>`,
        `<div class="empty">Your favourites ⭐, frequent foods and combos 🍱 will show up here.<br>Search above or pick a category.</div>`);
    } else if (st.cat === 1) {
      html = `<div class="list">${RECIPES.map(recRow).join('')}</div>`;
    } else {
      const cat = cats[st.cat];
      html = `<div class="list">${FOODS.filter(f => f.cat === cat && f.use !== 'Υ').map(foodRow).join('')}</div>`;
    }
    res.innerHTML = html;
    $$('[data-pick]', res).forEach(b => b.onclick = () => { const [k, id] = b.dataset.pick.split(':'); pick(k, +id); });
    $$('[data-cb]', res).forEach(b => b.onclick = () => {
      const c = data.combos.find(x => x.id === b.dataset.cb);
      addItems(c.items, st.meal, day, `${c.icon} ${c.name}: +${fmt(totals(c.items).kcal)} kcal ✓`);
    });
  };
  const q = $('#aQ', body);
  q.oninput = () => { st.q = q.value.trim(); draw(); };
  $$('#aCats .chip', body).forEach(b => b.onclick = () => { st.cat = +b.dataset.c; st.q = ''; q.value = ''; draw(); });
  $('#aQuick', body).onclick = () => openQuick({ meal: st.meal, day, name: st.q });
  $('#aNew', body).onclick = () => openFoodForm(null, { name: st.q, after: f => openPortion({ food: f, meal: st.meal, day }) });
  st.cat = 0;
  draw();
  setTimeout(() => q.focus(), 80);
}
function foodRow(f, attr = 'data-pick') {
  const p = f.portions[0];
  return `<button class="item" ${attr}="food:${f.id}"><span class="ico">${CAT_ICONS[f.cat] || '🍴'}</span>
    <span class="txt"><b>${esc(foodName(f))}${isFav('food:' + f.id) ? ' ⭐' : ''}${f.custom ? ` <em class="tag">${T('δικό μου', 'mine')}</em>` : f.edited ? ` <em class="tag">${T('διορθωμένο', 'edited')}</em>` : ''}</b><small>${esc(portionName(f, p.name))} · ${fmt(f.kcal * p.g / 100)} kcal</small></span></button>`;
}
function recRow(r) {
  return `<button class="item" data-pick="recipe:${r.id}"><span class="ico">${r.icon}</span>
    <span class="txt"><b>${esc(recipeName(r))}${isFav('recipe:' + r.id) ? ' ⭐' : ''}${r.type === 'prep' ? ' <em class="tag">🥡 prep</em>' : ''}</b><small>${T('1 μερίδα', '1 serving')} · ${fmt(r.perServing.kcal)} kcal</small></span></button>`;
}

/** Επιλογή ποσότητας: μερίδα (μικρό/μεσαίο/…) ή γραμμάρια, με ζωντανό υπολογισμό θερμίδων. */
function openPortion({ food, recipe, meal, day, entry }) {
  const isRec = !!recipe;
  const units = isRec ? [{ name: 'μερίδα', g: null }] : [...food.portions.map(p => ({ name: p.name, g: p.g })), { name: 'γρ', g: 1 }];
  const st = entry
    ? { unit: Math.max(0, units.findIndex(u => u.name === entry.unit)), qty: entry.qty, meal: entry.meal }
    : { unit: 0, qty: 1, meal };
  const body = openSheet(isRec ? `${recipe.icon} ${recipeName(recipe)}` : foodName(food));
  const favKey = isRec ? `recipe:${recipe.id}` : `food:${food.id}`;
  body.innerHTML = `
    <div class="sheet-tools">
      <button class="mini-btn" id="pFav">${favLabel(isFav(favKey))}</button>
      ${isRec || !canEditFood(food) ? '' : `<button class="mini-btn" id="pEdit">✏️ ${T('Διόρθωση τροφίμου', 'Edit food')}</button>`}
    </div>
    ${units.length > 1 ? `<div class="chips" id="pUnits">${units.map((u, i) => `<button class="chip" data-u="${i}">${u.name === 'γρ' ? T('γραμμάρια', 'grams') : esc(portionName(food, u.name))}${u.g && u.name !== 'γρ' ? `<small>${u.g}${G()}</small>` : ''}</button>`).join('')}</div>` : ''}
    <div class="stepper"><button id="pMinus" aria-label="${T('Λιγότερο', 'Less')}">−</button><input id="pQty" inputmode="decimal"><span class="unit" id="pUnit"></span><button id="pPlus" aria-label="${T('Περισσότερο', 'More')}">+</button></div>
    <div class="portion-kcal"><b id="pKcal">0</b> <span>kcal</span></div>
    <div class="macros" id="pMac"></div>
    <label class="field"><span>${T('Γεύμα', 'Meal')}</span><div class="seg" id="pMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${mealName(m)}</button>`).join('')}</div></label>
    ${isRec ? `<button class="btn block" id="pRec">📖 ${T('Δες τη συνταγή', 'View recipe')}</button>` : ''}
    <div class="actions">
      ${entry ? `<button class="btn danger" id="pDel">${T('Διαγραφή', 'Delete')}</button>` : ''}
      <button class="btn primary" id="pSave">${entry ? T('Αποθήκευση', 'Save') : T('Πρόσθεσε', 'Add')}</button>
    </div>`;
  const qtyIn = $('#pQty', body);
  const calc = () => {
    const u = units[st.unit];
    if (isRec) {
      const k = st.qty;
      return { g: 0, kcal: recipe.perServing.kcal * k, p: recipe.perServing.p * k, c: recipe.perServing.c * k, f: recipe.perServing.f * k };
    }
    const g = st.qty * u.g;
    return { g, ...nutrFor(food, g) };
  };
  const draw = () => {
    const u = units[st.unit];
    $$('#pUnits .chip', body).forEach(b => b.classList.toggle('on', +b.dataset.u === st.unit));
    $$('#pMeal button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.meal));
    if (document.activeElement !== qtyIn) qtyIn.value = fmtQty(st.qty);
    $('#pUnit', body).textContent = u.name === 'γρ' ? G() : st.qty === 1 ? '' : '×';
    const n = calc();
    $('#pKcal', body).textContent = fmt(n.kcal);
    $('#pMac', body).outerHTML = macrosHtml(n).replace('class="macros"', 'class="macros" id="pMac"');
  };
  const step = () => units[st.unit].name === 'γρ' ? 10 : 0.5;
  $('#pMinus', body).onclick = () => { st.qty = Math.max(step(), Math.round((st.qty - step()) * 100) / 100); draw(); };
  $('#pPlus', body).onclick = () => { st.qty = Math.round((st.qty + step()) * 100) / 100; draw(); };
  qtyIn.oninput = () => { const n = parseFloat(qtyIn.value.replace(',', '.')); if (n > 0) { st.qty = n; draw(); } };
  qtyIn.onblur = draw;
  $$('#pUnits .chip', body).forEach(b => b.onclick = () => {
    const prevG = units[st.unit].g * st.qty, nu = +b.dataset.u;
    st.unit = nu;
    // Στα γραμμάρια κρατάμε την ίδια ποσότητα (π.χ. 1 μεσαίο → 60 γρ.).
    st.qty = units[nu].name === 'γρ' ? Math.round(prevG) : 1;
    draw();
  });
  $$('#pMeal button', body).forEach(b => b.onclick = () => { st.meal = b.dataset.m; draw(); });
  if (isRec) $('#pRec', body).onclick = () => openRecipe(recipe);
  $('#pFav', body).onclick = e => { toggleFav(favKey); e.target.textContent = favLabel(isFav(favKey)); };
  if ($('#pEdit', body)) $('#pEdit', body).onclick = () => openFoodForm(food, { after: f => openPortion({ food: f, meal: st.meal, day, entry }) });
  $('#pSave', body).onclick = () => {
    const n = calc(), u = units[st.unit];
    const e = {
      id: entry?.id || newId(), date: entry?.date || day, meal: st.meal,
      kind: isRec ? 'recipe' : 'food', ref: isRec ? recipe.id : food.id, name: isRec ? recipe.name : food.name,
      qty: st.qty, unit: isRec ? 'μερίδα' : u.name, g: Math.round(n.g), kcal: Math.round(n.kcal),
      p: Math.round(n.p * 10) / 10, c: Math.round(n.c * 10) / 10, f: Math.round(n.f * 10) / 10,
    };
    if (entry) Object.assign(entry, e); else data.log.push(e);
    push('log', [e]);
    save(); closeSheet(); ui.tab = 'today'; ui.day = e.date; render();
    toast(entry ? T('Αποθηκεύτηκε ✓', 'Saved ✓') : `+${fmt(e.kcal)} kcal ✓`);
  };
  if (entry) $('#pDel', body).onclick = () => deleteEntry(entry);
  draw();
}

function openQuick({ meal, day, entry, name = '' }) {
  const body = openSheet(entry ? T('Στο περίπου', 'Estimate') : T('Γράψε το στο περίπου', 'Log an estimate'));
  const st = { meal: entry?.meal || meal };
  body.innerHTML = `
    <label class="field"><span>${T('Τι έφαγες', 'What you ate')}</span><input id="qName" value="${esc(entry?.name || name)}" placeholder="${T('π.χ. Φαγητό έξω, κομμάτι τούρτα…', 'e.g. Dinner out, slice of cake…')}"></label>
    <label class="field"><span>${T('Θερμίδες (περίπου)', 'Calories (approx.)')}</span><input id="qKcal" inputmode="numeric" value="${entry ? entry.kcal : ''}" placeholder="${T('π.χ. 600', 'e.g. 600')}"></label>
    <div class="chips">${[100, 200, 300, 500, 800, 1000].map(k => `<button class="chip" data-k="${k}">~${k}</button>`).join('')}</div>
    <label class="field"><span>${T('Γεύμα', 'Meal')}</span><div class="seg" id="qMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${mealName(m)}</button>`).join('')}</div></label>
    <div class="actions">${entry ? `<button class="btn danger" id="qDel">${T('Διαγραφή', 'Delete')}</button>` : ''}<button class="btn primary" id="qSave">${entry ? T('Αποθήκευση', 'Save') : T('Πρόσθεσε', 'Add')}</button></div>`;
  const drawMeal = () => $$('#qMeal button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.meal));
  $$('#qMeal button', body).forEach(b => b.onclick = () => { st.meal = b.dataset.m; drawMeal(); });
  drawMeal();
  $$('[data-k]', body).forEach(b => b.onclick = () => { $('#qKcal', body).value = b.dataset.k; });
  $('#qSave', body).onclick = () => {
    const kcal = parseInt($('#qKcal', body).value, 10);
    if (!(kcal >= 0)) return toast(T('Γράψε θερμίδες', 'Enter calories'));
    const e = { id: entry?.id || newId(), date: entry?.date || day, meal: st.meal, kind: 'quick', ref: null,
      name: $('#qName', body).value.trim() || T('Φαγητό', 'Food'), qty: 1, unit: '', g: 0, kcal, p: 0, c: 0, f: 0 };
    if (entry) Object.assign(entry, e); else data.log.push(e);
    push('log', [e]);
    save(); closeSheet(); ui.tab = 'today'; ui.day = e.date; render(); toast(T('Αποθηκεύτηκε ✓', 'Saved ✓'));
  };
  if (entry) $('#qDel', body).onclick = () => deleteEntry(entry);
  setTimeout(() => $(entry || name ? '#qKcal' : '#qName', body).focus(), 80);
}

function openEntry(e) {
  if (!e) return;
  if (e.kind === 'quick') return openQuick({ entry: e });
  if (e.kind === 'recipe') return openPortion({ recipe: recipeById(e.ref), entry: e });
  openPortion({ food: foodById(e.ref), entry: e });
}
function deleteEntry(e) {
  data.log = data.log.filter(x => x.id !== e.id);
  drop('log', [e.id]);
  save(); closeSheet(); render();
  toast(T('Διαγράφηκε', 'Deleted'), () => { data.log.push(e); save(); push('log', [e]); render(); });
}

/* ---------- δικά μου τρόφιμα / διόρθωση ---------- */
const USE_LABELS = [['Φ', 'Το τρώω έτσι', 'I eat it as is'], ['ΦΥ', 'Και τα δύο', 'Both'], ['Υ', 'Μόνο υλικό συνταγής', 'Recipe ingredient only']];
/**
 * Νέο τρόφιμο ή διόρθωση. Οι θερμίδες γράφονται είτε ανά 100γρ. είτε «ανά μερίδα»
 * (π.χ. από τη συσκευασία: «1 μπάρα 45γρ. = 190 kcal») και μετατρέπονται.
 */
function openFoodForm(food, { name = '', after } = {}) {
  if (food && !canEditFood(food)) return toast(T('Το αλλάζει μόνο η διαχειρίστρια ή όποια το πρόσθεσε', 'Only the admin or whoever added it can change it'));
  const base = food ? BASE_FOODS.find(f => f.id === food.id) : null;
  const st = {
    mode: '100',
    use: food?.use || 'Φ',
    portions: food ? food.portions.map(p => ({ ...p })) : [{ name: T('μερίδα', 'serving'), g: 100, piece: true }],
  };
  const body = openSheet(food ? T('Διόρθωση τροφίμου', 'Edit food') : T('Νέο τρόφιμο', 'New food'));
  const cats = [...new Set([...Object.keys(CAT_ICONS), ...FOODS.map(f => f.cat)])];
  body.innerHTML = `
    <label class="field"><span>${T('Όνομα', 'Name')}</span><input id="fName" value="${esc(food ? foodName(food) : name)}" placeholder="${T('π.χ. Μπάρα πρωτεΐνης Χ', 'e.g. Protein bar X')}"></label>
    <label class="field"><span>${T('Κατηγορία', 'Category')}</span><select id="fCat">${cats.map(c => `<option value="${esc(c)}" ${c === (food?.cat || 'Γλυκά & σνακ') ? 'selected' : ''}>${esc(catName(c))}</option>`).join('')}</select></label>
    <label class="field"><span>${T('Μερίδες', 'Portions')}</span></label>
    <div id="fPortions"></div>
    <button class="mini-btn" id="fAddP" style="margin-top:6px">${T('+ άλλη μερίδα', '+ another portion')}</button>
    <label class="field"><span>${T('Θερμίδες & θρεπτικά γράφω', 'I enter calories & nutrients')}</span><div class="seg" id="fMode"><button data-m="100">${T('ανά 100 γρ.', 'per 100 g')}</button><button data-m="p">${T('ανά 1η μερίδα', 'per 1st portion')}</button></div></label>
    <div class="row2">
      <label class="field"><span id="fKcalL">${T('Θερμίδες', 'Calories')}</span><input id="fKcal" inputmode="decimal"></label>
      <label class="field"><span>${T('Πρωτεΐνη (γρ.)', 'Protein (g)')}</span><input id="fP" inputmode="decimal"></label>
      <label class="field"><span>${T('Υδατάνθρακες (γρ.)', 'Carbs (g)')}</span><input id="fC" inputmode="decimal"></label>
      <label class="field"><span>${T('Λιπαρά (γρ.)', 'Fat (g)')}</span><input id="fF" inputmode="decimal"></label>
    </div>
    <p class="small muted" style="margin-top:-6px">${T('Αν δεν τα ξέρεις, γράψε μόνο θερμίδες.', "If you don't know them, just enter calories.")}</p>
    <label class="field"><span>${T('Πού το χρησιμοποιώ', 'Where I use it')}</span><div class="seg" id="fUse">${USE_LABELS.map(([k, l, le]) => `<button data-u="${k}">${T(l, le)}</button>`).join('')}</div></label>
    <div class="actions">
      ${food ? (food.custom ? `<button class="btn danger" id="fDel">${T('Διαγραφή', 'Delete')}</button>` : food.edited ? `<button class="btn" id="fReset">${T('↺ Αρχικές τιμές', '↺ Original values')}</button>` : `<button class="btn danger" id="fDel">${T('Απόκρυψη', 'Hide')}</button>`) : ''}
      <button class="btn primary" id="fSave">${T('Αποθήκευση', 'Save')}</button>
    </div>`;
  const nums = ['fKcal', 'fP', 'fC', 'fF'].map(id => $('#' + id, body));
  const setNums = vals => nums.forEach((inp, i) => { inp.value = vals[i] ? String(Math.round(vals[i] * 10) / 10).replace('.', ',') : ''; });
  const readNums = () => nums.map(inp => parseFloat(inp.value.replace(',', '.')) || 0);
  if (food) setNums([food.kcal, food.p, food.c, food.f]);

  const drawPortions = () => {
    $('#fPortions', body).innerHTML = st.portions.map((p, i) => `
      <div class="portion-row">
        <input data-pn="${i}" value="${esc(p.name)}" placeholder="${T('π.χ. 1 μπάρα', 'e.g. 1 bar')}">
        <input data-pg="${i}" value="${p.g}" inputmode="decimal" aria-label="${T('γραμμάρια', 'grams')}"><span class="muted small">${G()}</span>
        ${st.portions.length > 1 ? `<button class="icon-btn" data-px="${i}" aria-label="${T('Αφαίρεση', 'Remove')}">✕</button>` : ''}
      </div>`).join('');
    $$('[data-pn]', body).forEach(inp => inp.oninput = () => { st.portions[+inp.dataset.pn].name = inp.value; });
    $$('[data-pg]', body).forEach(inp => inp.oninput = () => { st.portions[+inp.dataset.pg].g = parseFloat(inp.value.replace(',', '.')) || 0; });
    $$('[data-px]', body).forEach(b => b.onclick = () => { st.portions.splice(+b.dataset.px, 1); drawPortions(); });
  };
  const drawSeg = () => {
    $$('#fMode button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    $$('#fUse button', body).forEach(b => b.classList.toggle('on', b.dataset.u === st.use));
    $('#fKcalL', body).textContent = st.mode === '100' ? T('Θερμίδες / 100 γρ.', 'Calories / 100 g') : `${T('Θερμίδες', 'Calories')} / ${st.portions[0]?.name || T('μερίδα', 'portion')}`;
  };
  $('#fAddP', body).onclick = () => { st.portions.push({ name: '', g: 100 }); drawPortions(); };
  $$('#fMode button', body).forEach(b => b.onclick = () => {
    if (b.dataset.m === st.mode) return;
    // Μετατρέπουμε ό,τι έχει ήδη γραφτεί, για να μη χαθεί.
    const k = (st.portions[0]?.g || 100) / 100, v = readNums();
    setNums(v.map(x => b.dataset.m === 'p' ? x * k : x / k));
    st.mode = b.dataset.m; drawSeg();
  });
  $$('#fUse button', body).forEach(b => b.onclick = () => { st.use = b.dataset.u; drawSeg(); });
  drawPortions(); drawSeg();

  $('#fSave', body).onclick = () => {
    let nm = $('#fName', body).value.trim();
    // Αν δεν άλλαξες το (αγγλικό) όνομα που εμφανίζεται, κρατάμε το αρχικό ελληνικό.
    if (food && nm === foodName(food)) nm = food.name;
    const portions = st.portions.filter(p => p.name.trim() && p.g > 0).map((p, i) => ({ name: p.name.trim(), g: p.g, piece: i === 0 }));
    let [kcal, p, c, f] = readNums();
    if (!nm) return toast(T('Γράψε όνομα', 'Enter a name'));
    if (!portions.length) return toast(T('Βάλε τουλάχιστον μία μερίδα με γραμμάρια', 'Add at least one portion with grams'));
    if (!(kcal > 0) && !confirm(T('Θερμίδες 0; Σίγουρα;', '0 calories? Are you sure?'))) return;
    if (st.mode === 'p') { const k = 100 / portions[0].g; [kcal, p, c, f] = [kcal * k, p * k, c * k, f * k]; }
    const r1 = x => Math.round(x * 10) / 10;
    const vals = { name: nm, cat: $('#fCat', body).value, kcal: r1(kcal), p: r1(p), c: r1(c), f: r1(f), use: st.use, portions };
    let id;
    if (food?.custom) { Object.assign(data.customFoods.find(x => x.id === food.id), vals); id = food.id; }
    else if (food) { data.foodEdits[food.id] = vals; id = food.id; }
    else { id = nextCustomId(data.customFoods); data.customFoods.push({ id, ...vals, author: me()?.id || '' }); }
    save(); rebuildCatalog(); push('foods', [foodRowOut(id)]);
    toast(T('Αποθηκεύτηκε ✓', 'Saved ✓'));
    if (after) after(foodById(id)); else { closeSheet(); render(); }
  };
  const del = $('#fDel', body);
  if (del) del.onclick = () => {
    const msg = food.custom ? T(`Να διαγραφεί το «${food.name}»;`, `Delete “${food.name}”?`) : T(`Να κρυφτεί το «${foodName(food)}» από τη λίστα; (οι παλιές καταγραφές μένουν)`, `Hide “${foodName(food)}” from the list? (past entries stay)`);
    if (!confirm(msg)) return;
    if (food.custom) { data.customFoods = data.customFoods.filter(x => x.id !== food.id); drop('foods', [food.id]); }
    else { data.hiddenFoods.push(food.id); push('foods', [foodRowOut(food.id)]); }
    save(); rebuildCatalog(); closeSheet(); render(); toast(food.custom ? T('Διαγράφηκε', 'Deleted') : T('Κρύφτηκε', 'Hidden'));
  };
  const reset = $('#fReset', body);
  if (reset) reset.onclick = () => {
    delete data.foodEdits[food.id]; save(); rebuildCatalog(); push('foods', [foodRowOut(food.id)]);
    toast(`${T('Επανήλθε', 'Restored')}: ${foodName(base)}`);
    if (after) after(foodById(food.id)); else { closeSheet(); render(); }
  };
  if (!food) setTimeout(() => $('#fName', body).focus(), 80);
}

/* ---------- συνταγές ---------- */
// Δύο είδη: «Συνταγές» και «Prep food» (μαγειρεύεις μια φορά, μοιράζεις σε δοχεία για τις επόμενες μέρες).
const isPrep = r => r.type === 'prep';
function renderRecipes(v) {
  ui.recType = ui.recType || 'recipe';
  const pool = RECIPES.filter(r => (ui.recType === 'prep') === isPrep(r));
  // Πλοήγηση στο δέντρο: ui.recPath = '' (όλες) ή π.χ. «Κυρίως γεύμα/Κρέας». ui.recTag = μία ετικέτα για φίλτρο. ui.recFav = μόνο αγαπημένες.
  ui.recPath = ui.recPath || '';
  const paths = allCatPaths(pool).filter(p => pool.some(r => inCat(r, p)));
  if (ui.recPath && !paths.includes(ui.recPath)) ui.recPath = '';
  const kids = childrenOf(ui.recPath, paths);
  const list = pool.filter(r => (!ui.recPath || inCat(r, ui.recPath)) && (!ui.recTag || recipeTags(r).includes(ui.recTag)) && (!ui.recFav || isFav('recipe:' + r.id)));
  const usedTags = TAGS.filter(t => pool.some(r => recipeTags(r).includes(t[0])));
  const crumbs = ui.recPath ? ui.recPath.split('/').map((s, i, a) => `<button class="crumb" data-path="${esc(a.slice(0, i + 1).join('/'))}">${esc(catLeaf(s))}</button>`).join('<span class="muted">›</span>') : '';
  const prep = ui.recType === 'prep';
  v.innerHTML = `
    <div class="seg" id="rType" style="margin-bottom:12px"><button data-rt="recipe">📖 ${T('Συνταγές', 'Recipes')}</button><button data-rt="prep">🥡 Prep food</button></div>
    <button class="btn primary block" id="rNew" style="margin:0 0 12px">${prep ? T('+ Νέο prep food', '+ New prep food') : T('+ Νέα συνταγή', '+ New recipe')}</button>
    ${prep && !pool.length ? `<div class="card empty">${T('Εδώ μπαίνουν τα φαγητά που μαγειρεύεις μία φορά και τα μοιράζεις σε δοχεία για τις επόμενες μέρες (meal prep). Οι «μερίδες» είναι τα δοχεία.', 'This is for food you cook once and split into containers for the next days (meal prep). “Servings” are the containers.')}</div>` : ''}
    <div class="crumbs"><button class="crumb ${ui.recPath ? '' : 'on'}" data-path="">📚 ${T('Όλες', 'All')}</button>${crumbs ? `<span class="muted">›</span>${crumbs}` : ''}</div>
    ${kids.length ? `<div class="cat-grid">${kids.map(p => `<button class="cat-tile" data-path="${esc(p)}"><span>${treeIcon(p)}</span><b>${esc(catLeaf(p))}</b><small>${pool.filter(r => inCat(r, p)).length}</small></button>`).join('')}</div>` : ''}
    <div class="chips scroll" style="margin:10px 0 12px">
      ${data.favs.some(k => pool.some(r => 'recipe:' + r.id === k)) ? `<button class="chip ${ui.recFav ? 'on' : ''}" id="rFavF">⭐ ${T('Αγαπημένες', 'Favourites')}</button>` : ''}
      ${usedTags.map(t => `<button class="chip ${ui.recTag === t[0] ? 'on' : ''}" data-tag="${t[0]}">${tagLabel(t[0])}</button>`).join('')}
    </div>
    ${!list.length && pool.length ? `<div class="empty">${T('Δεν υπάρχουν συνταγές εδώ ακόμα.', 'No recipes here yet.')}</div>` : ''}
    <div class="rec-grid">${list.map(r => `<button class="rec-card ${r.meta?.photo ? 'has-photo' : ''}" data-r="${r.id}">${r.meta?.photo ? `<img class="rec-thumb" src="${esc(r.meta.photo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : `<span class="emoji">${r.icon}</span>`}<b>${esc(recipeName(r))}${isFav('recipe:' + r.id) ? ' ⭐' : ''}</b><small>${fmt(r.perServing.kcal)} kcal / ${isPrep(r) ? T('δοχείο', 'container') : T('μερίδα', 'serving')}${r.custom ? ` · 👩‍🍳 ${esc(r.author === me()?.id ? T('δική μου', 'mine') : userName(r.author))}` : ''}${commentCount(r.id) ? ` · 💬 ${commentCount(r.id)}` : ''}</small></button>`).join('')}</div>`;
  $('#rNew', v).onclick = () => openRecipeForm(recipeFormState(null));
  $$('#rType button', v).forEach(b => { b.classList.toggle('on', b.dataset.rt === ui.recType); b.onclick = () => { ui.recType = b.dataset.rt; ui.recPath = ''; ui.recTag = null; render(); }; });
  $$('[data-path]', v).forEach(b => b.onclick = () => { ui.recPath = b.dataset.path; render(); });
  $$('[data-tag]', v).forEach(b => b.onclick = () => { ui.recTag = ui.recTag === b.dataset.tag ? null : b.dataset.tag; render(); });
  const ff = $('#rFavF', v);
  if (ff) ff.onclick = () => { ui.recFav = !ui.recFav; render(); };
  $$('[data-r]', v).forEach(b => b.onclick = () => openRecipe(recipeById(+b.dataset.r)));
}

/**
 * Φωτογραφία, χρόνος, δυσκολία, μερίδες και πηγή (π.χ. συνταγές του Άκη).
 * Η φωτογραφία φορτώνει απευθείας από το site της πηγής (δεν αντιγράφεται), με αναφορά και link.
 */
const DIFF_EN = { 'Εύκολη': 'Easy', 'Μεσαία': 'Medium', 'Δύσκολη': 'Hard' };
function recipeMetaHtml(r) {
  const tg = recipeTags(r);
  const where = `<p class="small muted rec-where">📂 ${esc(catName(r.cat))}${tg.length ? ` · ${tg.map(tagLabel).join(' · ')}` : ''}</p>`;
  const m = r.meta;
  if (!m) return where;
  const host = m.source ? new URL(m.source).hostname.replace('www.', '') : '';
  const who = /akispetretzikis/.test(host) ? 'Άκης Πετρετζίκης' : host;
  return `${m.photo ? `<figure class="rec-photo"><img src="${esc(m.photo)}" alt="${esc(recipeName(r))}" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.remove()"></figure>` : ''}
    <div class="rec-meta">${m.time ? `<span>⏱️ ${esc(m.time)}</span>` : ''}${m.difficulty ? `<span>📶 ${esc(T(m.difficulty, DIFF_EN[m.difficulty] || m.difficulty))}</span>` : ''}${m.servingsText ? `<span>🍽️ ${esc(m.servingsText)} ${T('μερίδες', 'servings')}</span>` : ''}</div>
    ${where}
    ${m.source ? `<p class="small muted rec-src">📷 ${T('Φωτογραφία & συνταγή', 'Photo & recipe')}: <a href="${esc(m.source)}" target="_blank" rel="noopener">${esc(who)}</a></p>` : ''}`;
}

// Όμορφο στρογγύλεμα ποσοτήτων όταν αλλάζουν οι μερίδες.
function niceGrams(g) {
  if (g < 20) return Math.max(1, Math.round(g));
  if (g < 200) return Math.round(g / 5) * 5;
  if (g < 1000) return Math.round(g / 10) * 10;
  return Math.round(g / 50) * 50;
}
function niceCount(n, food) {
  // Τα αυγά δεν κόβονται στη μέση· τα υπόλοιπα πάνε ανά μισό.
  if (/αυγ/i.test(fold(food.name))) return Math.max(1, Math.round(n));
  return Math.max(0.5, Math.round(n * 2) / 2);
}
function scaledItem(it, k) {
  const food = foodById(it.food);
  if (!food) return { text: it.unit === 'γρ' ? `${fmt(it.g * k)} ${G()}` : `${fmtQty(it.qty * k)} × ${it.unit}`, g: it.g * k };
  if (food.kcal === 0 && /Αλάτι/.test(food.name)) return { text: T('κατά βούληση', 'to taste'), g: 0 };
  if (it.unit === 'γρ') { const g = niceGrams(it.g * k); return { text: `${fmt(g)} ${G()}`, g }; }
  const n = it.unit === 'τεμ' ? niceCount(it.qty * k, food) : Math.max(0.5, Math.round(it.qty * k * 2) / 2);
  const g = it.g / it.qty * n;
  const unitName = it.unit === 'τεμ' ? (food.portions.find(p => p.piece)?.name || T('τεμ.', 'pcs')) : it.unit;
  const label = portionName(food, unitName).replace(/^1 /, '');
  return { text: n <= 1 ? `${frac(n)} ${label}` : `${frac(n)} × ${label}`, g };
}

/* ---------- εναλλακτικά υλικά (κανονικό / light / ολικής …) ---------- */
// Κάθε ομάδα: τρόφιμα που μπορούν να μπουν το ένα στη θέση του άλλου, με τα ίδια γραμμάρια.
const ALT_GROUPS = [
  ['Κιμάς μοσχαρίσιος ωμός', 'Κιμάς μοσχαρίσιος άπαχος ωμός', 'Κιμάς ανάμεικτος ωμός', 'Κοτόπουλο κιμάς ωμός'],
  ['Γάλα πλήρες 3,5%', 'Γάλα ημιαποβουτυρωμένο 1,5%', 'Γάλα 0%', 'Ρόφημα αμυγδάλου (χωρίς ζάχαρη)', 'Ρόφημα βρώμης', 'Ρόφημα σόγιας'],
  ['Γιαούρτι στραγγιστό 10%', 'Γιαούρτι στραγγιστό 2%', 'Γιαούρτι στραγγιστό 0%'],
  ['Κρέμα γάλακτος 35%', 'Κρέμα γάλακτος light'],
  ['Φέτα', 'Φέτα light'],
  ['Μοτσαρέλα', 'Μοτσαρέλα light'],
  ['Philadelphia (τυρί κρέμα)', 'Philadelphia light'],
  ['Μαγιονέζα', 'Μαγιονέζα light'],
  ['Μαρμελάδα', 'Μαρμελάδα light'],
  ['Ζάχαρη', 'Ζάχαρη καστανή', 'Μέλι', 'Γλυκαντικό (στέβια / ζαχαρίνη)'],
  ['Ζυμαρικά ωμά', 'Ζυμαρικά ολικής ωμά'],
  ['Ρύζι λευκό ωμό', 'Ρύζι καστανό ωμό'],
  ['Ψωμί λευκό', 'Ψωμί ολικής', 'Ψωμί σίκαλης'],
  ['Ψωμί τοστ λευκό', 'Ψωμί τοστ ολικής'],
  ['Αλεύρι για όλες τις χρήσεις', 'Αλεύρι ολικής'],
  ['Τυρί τοστ (φέτες)', 'Τυρί light (φέτες)', 'Γκούντα', 'Τσένταρ', 'Κασέρι'],
  ['Mix τυριών τριμμένο', 'Μοτσαρέλα light', 'Γκούντα'],
  ['Ηλιέλαιο / Σπορέλαιο', 'Ελαιόλαδο'],
  ['Βούτυρο', 'Μαργαρίνη / Φυτικό βούτυρο', 'Ελαιόλαδο'],
];
function altsFor(food) {
  if (!food) return [];
  const g = ALT_GROUPS.find(gr => gr.includes(food.name));
  return g ? g.map(n => FOODS.find(f => f.name === n)).filter(Boolean) : [];
}
// Υλικό με άλλο τρόφιμο: ίδια γραμμάρια (τα τεμάχια/μερίδες γίνονται γραμμάρια για σιγουριά).
function swapItem(it, food) {
  return it.unit === 'γρ' || !food.portions.some(p => p.name === it.unit || (it.unit === 'τεμ' && p.piece))
    ? { food: food.id, name: food.name, qty: Math.round(it.g), unit: 'γρ', g: it.g }
    : { ...it, food: food.id, name: food.name, g: itemGrams(food, it.qty, it.unit) };
}

/* ---------- σχόλια συνταγών (κοινά για την παρέα, με φωτογραφία) ---------- */
const commentCount = id => (data.comments || []).filter(c => c.recipe === id).length;
// Μικραίνει τη φωτογραφία πριν ανέβει (≈ 150–300 KB αντί για αρκετά MB από το κινητό).
function shrinkImage(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(T('Δεν διαβάστηκε η φωτογραφία', 'Could not read the photo'))); };
    img.src = url;
  });
}
function commentsHtml(r, st) {
  const list = (data.comments || []).filter(c => c.recipe === r.id);
  return `
    <h3 class="section-label">💬 ${T('Σχόλια', 'Comments')}${list.length ? ` (${list.length})` : ''}</h3>
    <div class="comments">${list.length ? list.map(c => `
      <div class="comment">
        <div class="c-head"><b>${esc(userName(c.user))}</b><small class="muted">${shortDate(c.created)}</small>
          ${c.user === me()?.id || isAdmin() ? `<button class="c-del" data-cdel="${esc(c.id)}" aria-label="${T('Διαγραφή σχολίου', 'Delete comment')}">🗑</button>` : ''}</div>
        ${c.text ? `<p>${esc(c.text)}</p>` : ''}
        ${c.photo ? `<img class="c-photo" src="${esc(c.photo)}" alt="${T('Φωτογραφία από', 'Photo by')} ${esc(userName(c.user))}" loading="lazy" referrerpolicy="no-referrer">` : ''}
      </div>`).join('') : `<div class="empty small">${T('Κανένα σχόλιο ακόμα. Την έφτιαξες; Πες πώς βγήκε ή ανέβασε φωτογραφία! 📷', 'No comments yet. Did you make it? Say how it went or upload a photo! 📷')}</div>`}</div>
    <div class="c-form">
      <textarea id="cText" rows="2" maxlength="1500" placeholder="${T('Γράψε ένα σχόλιο ή μια συμβουλή…', 'Write a comment or a tip…')}">${esc(st.cText || '')}</textarea>
      ${st.cPhoto ? `<div class="c-prev"><img src="${st.cPhoto}" alt=""><button class="c-del" id="cNoPhoto" aria-label="${T('Αφαίρεση φωτογραφίας', 'Remove photo')}">✕</button></div>` : ''}
      <div class="c-row">
        <label class="btn small" for="cFile">📷 ${st.cPhoto ? T('Άλλη φωτογραφία', 'Another photo') : T('Φωτογραφία', 'Photo')}</label>
        <input type="file" id="cFile" accept="image/*" hidden>
        <button class="btn small primary" id="cSend" ${st.cBusy ? 'disabled' : ''}>${st.cBusy ? T('Στέλνω… ⏳', 'Sending… ⏳') : T('Αποστολή', 'Send')}</button>
      </div>
    </div>`;
}
function wireComments(body, r, st, redraw) {
  $('#cText', body).oninput = e => { st.cText = e.target.value; };
  $('#cFile', body).onchange = async e => {
    const f = e.target.files[0];
    if (!f) return;
    try { st.cPhoto = await shrinkImage(f); redraw(); } catch (err) { toast(err.message); }
  };
  const np = $('#cNoPhoto', body);
  if (np) np.onclick = () => { st.cPhoto = null; redraw(); };
  $('#cSend', body).onclick = async () => {
    const text = (st.cText || '').trim();
    if (!text && !st.cPhoto) return toast(T('Γράψε κάτι ή βάλε φωτογραφία', 'Write something or add a photo'));
    const c = { id: newId(), recipe: r.id, user: me()?.id || 'demo', text, photo: '', created: new Date().toISOString() };
    if (online()) {
      st.cBusy = true; redraw();
      try {
        if (st.cPhoto) c.photo = (await api('upload', { data: st.cPhoto.split(',')[1] })).url;
        await api('put', { sheet: 'comments', rows: [{ id: c.id, recipe: c.recipe, text: c.text, photo: c.photo }] });
      } catch (err) { st.cBusy = false; redraw(); return toast(errText(err.message)); }
    } else c.photo = st.cPhoto || '';
    data.comments.push(c); save();
    Object.assign(st, { cText: '', cPhoto: null, cBusy: false });
    redraw(); toast(T('Το σχόλιο δημοσιεύτηκε ✓', 'Comment posted ✓'));
    if (ui.tab === 'recipes') render();
  };
  $$('[data-cdel]', body).forEach(b => b.onclick = () => {
    if (!confirm(T('Να διαγραφεί το σχόλιο;', 'Delete this comment?'))) return;
    data.comments = data.comments.filter(c => c.id !== b.dataset.cdel);
    drop('comments', [b.dataset.cdel]); save(); redraw();
    if (ui.tab === 'recipes') render();
  });
}

function openRecipe(base) {
  const st = { serv: base.servings, swaps: {} };
  const body = openSheet(`${base.icon} ${recipeName(base)}`);
  const draw = () => {
    // Η εκδοχή με τις αλλαγές υλικών (αν έχεις διαλέξει κάποια).
    const swapped = Object.keys(st.swaps).length > 0;
    const r = swapped ? computeRecipe({ ...base, items: base.items.map((it, i) => st.swaps[i] ? swapItem(it, foodById(st.swaps[i])) : it) }) : base;
    const k = st.serv / r.servings, favKey = `recipe:${r.id}`;
    body.innerHTML = `
      <div class="sheet-tools">
        <button class="mini-btn" id="rFav">${isFav(favKey) ? T('⭐ Στα αγαπημένα', '⭐ In favourites') : T('☆ Αγαπημένη', '☆ Favourite')}</button>
        ${canEditRecipe(base) ? `<button class="mini-btn" id="rEdit">✏️ ${T('Επεξεργασία', 'Edit')}</button>` : ''}
        ${isPrep(r) ? '<em class="tag">🥡 prep</em>' : ''}${r.custom && r.author === me()?.id ? `<em class="tag">${T('δική μου', 'mine')}</em>` : r.edited ? `<em class="tag">${T('αλλαγμένη', 'edited')}</em>` : ''}
      </div>
      ${recipeMetaHtml(r)}
      <p class="small muted rec-by">${r.custom ? `👩‍🍳 ${T('Πρόσθεσε', 'Added by')}: <b>${esc(userName(r.author))}</b>` : `📖 ${T('Πέρασε', 'Added by')}: <b>${esc(adminName())}</b>`}</p>
      <div class="rec-kpi">
        <div><b>${fmt(r.perServing.kcal)}</b><span>kcal / ${T('μερίδα', 'serving')}</span></div>
        <div><b>${fmt(r.perServing.p)}${G()}</b><span>${T('πρωτεΐνη / μερίδα', 'protein / serving')}</span></div>
        <div><b>${fmt(r.total.kcal * k)}</b><span>${T('kcal όλο το φαγητό', 'kcal whole dish')}</span></div>
      </div>
      <div class="stepper"><button id="sMinus" aria-label="${T('Λιγότερες μερίδες', 'Fewer servings')}">−</button><input id="sQty" inputmode="numeric" value="${st.serv}"><span class="unit">${T('μερίδες', 'servings')}</span><button id="sPlus" aria-label="${T('Περισσότερες μερίδες', 'More servings')}">+</button></div>
      ${st.serv !== r.servings ? `<p class="small muted" style="text-align:center;margin:-4px 0 8px">${T(`Η αρχική συνταγή είναι για ${r.servings} μερίδες`, `The original recipe makes ${r.servings} servings`)} · <a href="#" id="sReset">${T('επαναφορά', 'reset')}</a></p>` : ''}
      <h3 class="section-label">${T('Υλικά', 'Ingredients')}</h3>
      <div>${r.items.map((it, i) => {
        const s = scaledItem(it, k), f = foodById(it.food), alts = altsFor(foodById(base.items[i].food));
        const name = alts.length > 1
          ? `<select class="alt-sel ${st.swaps[i] ? 'changed' : ''}" data-alt="${i}" aria-label="${T('Εναλλακτικό υλικό', 'Alternative ingredient')}">${alts.map(a => `<option value="${a.id}" ${a.id === it.food ? 'selected' : ''}>${esc(foodName(a))}</option>`).join('')}</select> <span class="alt-ico" aria-hidden="true">⇄</span>`
          : esc(f ? foodName(f) : it.name);
        return `<div class="ing"><span>${name}</span><span>${esc(s.text)}</span></div>`;
      }).join('')}</div>
      ${swapped ? `<div class="note swap-note">⇄ ${T(`Άλλαξες υλικά: <b>${fmt(r.perServing.kcal)} kcal</b>/μερίδα αντί για ${fmt(base.perServing.kcal)}.`, `Swapped ingredients: <b>${fmt(r.perServing.kcal)} kcal</b>/serving instead of ${fmt(base.perServing.kcal)}.`)}
        <div class="row2" style="margin-top:8px"><button class="btn small" id="swReset">↺ ${T('Όπως ήταν', 'Undo swaps')}</button><button class="btn small primary" id="swKeep">💾 ${T('Κράτα αυτή την εκδοχή', 'Keep this version')}</button></div></div>` : ''}
      ${recipeNotes(r).map(n => `<div class="note">💡 ${esc(n)}</div>`).join('')}
      <h3 class="section-label">${T('Εκτέλεση', 'Method')}</h3>
      <ol class="steps">${recipeSteps(r).map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="actions">
        <button class="btn" id="rShop" title="${T('Έρχεται: θα στέλνει τα υλικά στα Ψώνια του Household Desk', 'Coming soon: sends the ingredients to Household Desk shopping')}" disabled>🛒 ${T('Στα ψώνια', 'To shopping')}</button>
        <button class="btn primary" id="rAte">🍽️ ${T('Το έφαγα', 'I ate this')}</button>
      </div>
      ${commentsHtml(base, st)}`;
    wireComments(body, base, st, draw);
    const setServ = n => { st.serv = Math.min(50, Math.max(1, n)); draw(); };
    $('#sMinus', body).onclick = () => setServ(st.serv - 1);
    $('#sPlus', body).onclick = () => setServ(st.serv + 1);
    $('#sQty', body).onchange = e => setServ(parseInt(e.target.value, 10) || r.servings);
    const reset = $('#sReset', body);
    if (reset) reset.onclick = e => { e.preventDefault(); setServ(r.servings); };
    $('#rAte', body).onclick = () => openPortion({ recipe: r, meal: mealByTime(), day: todayIso() });
    $('#rFav', body).onclick = () => { toggleFav(favKey); draw(); if (ui.tab === 'recipes') render(); };
    if ($('#rEdit', body)) $('#rEdit', body).onclick = () => openRecipeForm(recipeFormState(r));
    $$('[data-alt]', body).forEach(sel => sel.onchange = () => {
      const i = +sel.dataset.alt, id = +sel.value;
      if (id === base.items[i].food) delete st.swaps[i]; else st.swaps[i] = id;
      draw();
    });
    const swR = $('#swReset', body);
    if (swR) swR.onclick = () => { st.swaps = {}; draw(); };
    const swK = $('#swKeep', body);
    if (swK) swK.onclick = () => {
      // Μόνιμα: η συνταγή αποθηκεύεται με τα νέα υλικά (σαν «αλλαγμένη» ή στη δική σου).
      const rec = { name: base.name, icon: base.icon, cat: base.cat, type: base.type === 'prep' ? 'prep' : 'recipe', tags: base.tags || [], servings: base.servings, items: r.items, steps: base.steps, notes: base.notes };
      // Συνταγή που δεν μπορείς να αλλάξεις (π.χ. άλλης): κρατιέται ως νέα, δική σου εκδοχή.
      if (!canEditRecipe(base)) {
        const id = nextCustomId(data.customRecipes);
        data.customRecipes.push({ id, ...rec, name: `${base.name} (${me()?.name || T('δική μου', 'mine')})`, author: me()?.id || '' });
        push('recipes', [recipeRowOut(id)]);
        save(); rebuildCatalog(); if (ui.tab === 'recipes') render();
        toast(T('Κρατήθηκε ως δική σου εκδοχή ✓', 'Saved as your own version ✓'));
        return openRecipe(recipeById(id));
      }
      if (base.custom) Object.assign(data.customRecipes.find(x => x.id === base.id), rec);
      else data.recipeEdits[base.id] = rec;
      push('recipes', [recipeRowOut(base.id)]);
      save(); rebuildCatalog(); if (ui.tab === 'recipes') render();
      toast(T('Η συνταγή κρατήθηκε με τα νέα υλικά ✓', 'Recipe saved with the new ingredients ✓'));
      openRecipe(recipeById(base.id));
    };
  };
  draw();
}

/* ---------- δικές μου συνταγές / επεξεργασία ---------- */
const REC_ICONS = ['🍝', '🍲', '🥘', '🍗', '🥩', '🐟', '🥗', '🫘', '🍚', '🥔', '🥧', '🍕', '🥪', '🌯', '🍜', '🍛', '🍳', '🥞', '🥣', '🍰', '🍮', '🍏', '🍔', '🫑'];
function recipeFormState(r) {
  return r
    ? { id: r.id, custom: !!r.custom, edited: !!r.edited, name: r.name, icon: r.icon, cat: r.cat, type: r.type === 'prep' ? 'prep' : 'recipe', tags: [...(r.tags || [])], servings: r.servings,
      items: r.items.map(it => ({ ...it })), steps: r.steps.join('\n'), notes: r.notes.join('\n') }
    : { id: null, name: '', icon: ui.recType === 'prep' ? '🥡' : '🍲', cat: 'Δικές μου', type: ui.recType === 'prep' ? 'prep' : 'recipe', servings: 4, items: [], steps: '', notes: '' };
}
// Το state μένει ίδιο όσο πας στην επιλογή υλικού και πίσω, για να μη χάνεται τίποτα.
function openRecipeForm(st) {
  const body = openSheet(st.id ? T('Επεξεργασία συνταγής', 'Edit recipe') : T('Νέα συνταγή', 'New recipe'));
  const cats = [...new Set([...allCatPaths(), st.cat, 'Δικές μου'])];
  st.tags = st.tags || [];
  const preview = computeRecipe({ items: st.items, servings: st.servings });
  body.innerHTML = `
    <div class="seg" id="rfType"><button data-rt="recipe">📖 ${T('Συνταγή', 'Recipe')}</button><button data-rt="prep">🥡 Prep food</button></div>
    <label class="field"><span>${T('Όνομα', 'Name')}</span><input id="rfName" value="${esc(st.name)}" placeholder="${T('π.χ. Ριζότο με λαχανικά', 'e.g. Vegetable risotto')}"></label>
    <div class="chips scroll" id="rfIcons">${REC_ICONS.map(i => `<button class="chip emoji-chip ${i === st.icon ? 'on' : ''}" data-i="${i}">${i}</button>`).join('')}</div>
    <div class="row2">
      <label class="field"><span>${T('Κατηγορία', 'Category')}</span><select id="rfCat">${cats.map(c => `<option value="${esc(c)}" ${c === st.cat ? 'selected' : ''}>${'   '.repeat(c.split('/').length - 1)}${esc(catLeaf(c))}</option>`).join('')}<option value="__new">${T('+ Νέα κατηγορία…', '+ New category…')}</option></select></label>
      <label class="field"><span>${st.type === 'prep' ? T('Δοχεία / μερίδες', 'Containers / servings') : T('Μερίδες που βγάζει', 'Servings it makes')}</span><input id="rfServ" inputmode="numeric" value="${st.servings}"></label>
    </div>
    <label class="field"><span>${T('Ετικέτες', 'Tags')}</span><div class="chips" id="rfTags">${TAGS.map(t => `<button class="chip ${st.tags.includes(t[0]) ? 'on' : ''}" data-tg="${t[0]}">${tagLabel(t[0])}</button>`).join('')}</div></label>
    <div class="rec-kpi"><div><b>${fmt(preview.perServing.kcal)}</b><span>kcal / ${T('μερίδα', 'serving')}</span></div><div><b>${fmt(preview.perServing.p)}${G()}</b><span>${T('πρωτεΐνη / μερίδα', 'protein / serving')}</span></div><div><b>${fmt(preview.total.kcal)}</b><span>${T('kcal σύνολο', 'kcal total')}</span></div></div>
    <h3 class="section-label">${T('Υλικά', 'Ingredients')}</h3>
    <div class="list">${st.items.length ? st.items.map((it, i) => { const f = foodById(it.food); return `<button class="item" data-it="${i}"><span class="txt"><b>${esc(f ? foodName(f) : it.name)}</b><small>${esc(it.unit === 'γρ' ? `${fmt(it.g)} ${G()}` : `${fmtQty(it.qty)} × ${it.unit === 'τεμ' ? T('τεμ.', 'pcs') : portionName(f, it.unit)}`)} · ${fmt((f?.kcal || 0) * it.g / 100)} kcal</small></span><span class="muted">✎</span></button>`; }).join('') : `<div class="empty">${T('Δεν έχεις βάλει υλικά ακόμα', 'No ingredients yet')}</div>`}</div>
    <button class="btn block" id="rfAdd">${T('+ Πρόσθεσε υλικό', '+ Add ingredient')}</button>
    <label class="field"><span>${T('Βήματα (ένα σε κάθε γραμμή)', 'Steps (one per line)')}</span><textarea id="rfSteps" rows="5" placeholder="${T('Σοτάρεις το κρεμμύδι…', 'Sauté the onion…')}">${esc(st.steps)}</textarea></label>
    <label class="field"><span>${T('Σημειώσεις (προαιρετικά)', 'Notes (optional)')}</span><textarea id="rfNotes" rows="2">${esc(st.notes)}</textarea></label>
    <div class="actions">
      ${st.id ? (st.custom ? `<button class="btn danger" id="rfDel">${T('Διαγραφή', 'Delete')}</button>` : st.edited ? `<button class="btn" id="rfReset">${T('↺ Αρχική', '↺ Original')}</button>` : `<button class="btn danger" id="rfDel">${T('Απόκρυψη', 'Hide')}</button>`) : ''}
      <button class="btn primary" id="rfSave">${T('Αποθήκευση', 'Save')}</button>
    </div>`;
  // Κρατάμε ό,τι γράφεται στο state πριν από κάθε μετάβαση.
  const sync = () => {
    st.name = $('#rfName', body).value; st.steps = $('#rfSteps', body).value; st.notes = $('#rfNotes', body).value;
    st.servings = Math.max(1, parseInt($('#rfServ', body).value, 10) || st.servings);
  };
  $$('#rfIcons .chip', body).forEach(b => b.onclick = () => { st.icon = b.dataset.i; $$('#rfIcons .chip', body).forEach(x => x.classList.toggle('on', x === b)); });
  $$('#rfTags .chip', body).forEach(b => b.onclick = () => { const t = b.dataset.tg; st.tags = st.tags.includes(t) ? st.tags.filter(x => x !== t) : [...st.tags, t]; b.classList.toggle('on'); });
  $$('#rfType button', body).forEach(b => { b.classList.toggle('on', b.dataset.rt === st.type); b.onclick = () => { sync(); st.type = b.dataset.rt; openRecipeForm(st); }; });
  $('#rfCat', body).onchange = async e => {
    if (e.target.value !== '__new') { st.cat = e.target.value; return; }
    const n = prompt(T('Όνομα νέας κατηγορίας (για υποκατηγορία γράψε π.χ. «Κυρίως γεύμα/Κρέας/Μοσχάρι»)', 'New category name (for a subcategory write e.g. “Κυρίως γεύμα/Κρέας/Μοσχάρι”)'));
    if (n && n.trim()) { st.cat = n.trim(); sync(); openRecipeForm(st); } else e.target.value = st.cat;
  };
  $('#rfServ', body).onchange = () => { sync(); openRecipeForm(st); };
  $('#rfAdd', body).onclick = () => { sync(); pickIngredient(st); };
  $$('[data-it]', body).forEach(b => b.onclick = () => { sync(); editIngredient(st, +b.dataset.it); });
  $('#rfSave', body).onclick = () => {
    sync();
    const name = st.name.trim();
    if (!name) return toast(T('Γράψε όνομα συνταγής', 'Enter a recipe name'));
    if (!st.items.length) return toast(T('Βάλε τουλάχιστον ένα υλικό', 'Add at least one ingredient'));
    const lines = s => s.split('\n').map(x => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
    const rec = { name, icon: st.icon, cat: st.cat, type: st.type, tags: st.tags, servings: st.servings, items: st.items, steps: lines(st.steps), notes: lines(st.notes) };
    let id = st.id;
    if (st.custom) Object.assign(data.customRecipes.find(r => r.id === id), rec);
    else if (id) data.recipeEdits[id] = rec;
    else { id = nextCustomId(data.customRecipes); data.customRecipes.push({ id, ...rec, author: me()?.id || '' }); }
    push('recipes', [recipeRowOut(id)]);
    save(); rebuildCatalog(); ui.tab = 'recipes'; ui.recType = st.type; render();
    toast(T('Η συνταγή αποθηκεύτηκε ✓', 'Recipe saved ✓'));
    openRecipe(recipeById(id));
  };
  const del = $('#rfDel', body);
  if (del) del.onclick = () => {
    if (!confirm(st.custom ? T(`Να διαγραφεί η «${st.name}»;`, `Delete “${st.name}”?`) : T(`Να κρυφτεί η «${st.name}»;`, `Hide “${st.name}”?`))) return;
    if (st.custom) { data.customRecipes = data.customRecipes.filter(r => r.id !== st.id); drop('recipes', [st.id]); }
    else { data.hiddenRecipes.push(st.id); push('recipes', [recipeRowOut(st.id)]); }
    save(); rebuildCatalog(); closeSheet(); render(); toast(st.custom ? T('Διαγράφηκε', 'Deleted') : T('Κρύφτηκε', 'Hidden'));
  };
  const reset = $('#rfReset', body);
  if (reset) reset.onclick = () => {
    if (!confirm(T('Να επιστρέψει η συνταγή όπως ήταν αρχικά;', 'Restore the original recipe?'))) return;
    delete data.recipeEdits[st.id]; save(); rebuildCatalog(); push('recipes', [recipeRowOut(st.id)]); render(); openRecipe(recipeById(st.id)); toast(T('Επανήλθε ✓', 'Restored ✓'));
  };
}
function pickIngredient(st) {
  const body = openSheet(T('Πρόσθεσε υλικό', 'Add ingredient'));
  body.innerHTML = `
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="iQ" type="search" placeholder="${T('π.χ. ρύζι, κρεμμύδι, ελαιόλαδο…', 'e.g. rice, onion, olive oil…')}" autocomplete="off"></label>
    <div class="results" id="iRes"></div>
    <div class="actions"><button class="btn" id="iBack">${T('← Πίσω στη συνταγή', '← Back to recipe')}</button><button class="btn" id="iNew">➕ ${T('Νέο τρόφιμο', 'New food')}</button></div>`;
  const q = $('#iQ', body);
  const draw = () => {
    const words = fold(q.value.trim()).split(/\s+/).filter(Boolean);
    // Στις συνταγές πρώτα τα υλικά (ωμά), μετά τα υπόλοιπα.
    const hit = s => { if (!s) return false; const n = fold(s); return words.every(w => n.includes(w)); };
    const list = words.length ? FOODS.filter(f => hit(f.name) || hit(f.en))
      .sort((a, b) => ((b.use !== 'Φ') - (a.use !== 'Φ')) || (fold(foodName(b)).startsWith(words[0]) - fold(foodName(a)).startsWith(words[0])) || foodName(a).length - foodName(b).length).slice(0, 40) : [];
    $('#iRes', body).innerHTML = words.length
      ? (list.length ? `<div class="list">${list.map(f => foodRow(f, 'data-ing')).join('')}</div>` : `<div class="empty">${T("Δεν βρέθηκε. Φτιάξ' το ως νέο τρόφιμο 👇", 'Not found. Create it as a new food 👇')}</div>`)
      : `<div class="empty">${T('Γράψε το υλικό που θες.', 'Type the ingredient you need.')}</div>`;
    $$('[data-ing]', body).forEach(b => b.onclick = () => {
      const f = foodById(+b.dataset.ing.split(':')[1]);
      const piece = f.portions.find(p => p.piece);
      st.items.push({ food: f.id, name: f.name, qty: piece ? 1 : 100, unit: piece ? 'τεμ' : 'γρ', g: piece ? piece.g : 100 });
      editIngredient(st, st.items.length - 1);
    });
  };
  q.oninput = draw; draw();
  $('#iBack', body).onclick = () => openRecipeForm(st);
  $('#iNew', body).onclick = () => openFoodForm(null, { name: q.value.trim(), after: f => {
    const piece = f.portions.find(p => p.piece);
    st.items.push({ food: f.id, name: f.name, qty: 1, unit: piece ? 'τεμ' : 'γρ', g: piece ? piece.g : 100 });
    editIngredient(st, st.items.length - 1);
  } });
  setTimeout(() => q.focus(), 80);
}
function editIngredient(st, i) {
  const it = st.items[i], food = foodById(it.food);
  const units = food ? [{ key: 'γρ', label: T('γραμμάρια', 'grams') }, ...food.portions.map(p => ({ key: p.piece ? 'τεμ' : p.name, label: portionName(food, p.name), g: p.g }))] : [{ key: 'γρ', label: T('γραμμάρια', 'grams') }];
  const body = openSheet(food ? foodName(food) : it.name);
  body.innerHTML = `
    <div class="chips" id="eiU">${units.map(u => `<button class="chip ${u.key === it.unit ? 'on' : ''}" data-u="${esc(u.key)}">${esc(u.label)}${u.g ? `<small>${u.g}${G()}</small>` : ''}</button>`).join('')}</div>
    <div class="stepper"><input id="eiQ" inputmode="decimal" value="${fmtQty(it.qty)}"><span class="unit" id="eiUnit"></span></div>
    <p class="portion-kcal"><b id="eiK">0</b> <span>kcal</span></p>
    <div class="actions"><button class="btn danger" id="eiDel">${T('Αφαίρεση', 'Remove')}</button><button class="btn primary" id="eiOk">OK</button></div>`;
  const q = $('#eiQ', body);
  const draw = () => {
    it.qty = parseFloat(q.value.replace(',', '.')) || 0;
    it.g = food ? itemGrams(food, it.qty, it.unit) : it.g;
    $('#eiUnit', body).textContent = it.unit === 'γρ' ? G() : `× ${units.find(u => u.key === it.unit)?.label || ''}`;
    $('#eiK', body).textContent = fmt((food?.kcal || 0) * it.g / 100);
  };
  $$('#eiU .chip', body).forEach(b => b.onclick = () => {
    const prevG = it.g;
    it.unit = b.dataset.u;
    q.value = it.unit === 'γρ' ? String(Math.round(prevG)) : '1';
    $$('#eiU .chip', body).forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  q.oninput = draw; draw();
  $('#eiOk', body).onclick = () => { if (!(it.qty > 0)) return toast(T('Γράψε ποσότητα', 'Enter a quantity')); openRecipeForm(st); };
  $('#eiDel', body).onclick = () => { st.items.splice(i, 1); openRecipeForm(st); };
  setTimeout(() => { q.focus(); q.select(); }, 80);
}

/* ---------- πρόοδος: ιστορικό θερμίδων, εβδομαδιαίο σύνολο, βάρος ---------- */
// Δευτέρα της εβδομάδας μιας ημερομηνίας.
function weekStart(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const wd = (new Date(y, m - 1, d).getDay() + 6) % 7;
  return addDays(iso, -wd);
}
const shortDay = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(LOCALE(), { weekday: 'short' }).replace('.', ''); };
const dm = iso => { const [, m, d] = iso.split('-'); return `${+d}/${+m}`; };

/**
 * Ραβδόγραμμα θερμίδων ανά μέρα με γραμμή στόχου. Ένα χρώμα (ταυτότητα = «θερμίδες»),
 * οι μέρες πάνω από τον στόχο παίρνουν ▲ (όχι μόνο χρώμα). Πάτημα σε μπάρα → εκείνη η μέρα.
 */
function kcalChart(days, goal) {
  const W = 340, H = 170, top = 16, bottom = 22, left = 4, right = 4;
  const max = Math.max(goal * 1.25, ...days.map(d => d.kcal), 1);
  const y = v => top + (H - top - bottom) * (1 - v / max);
  const bw = (W - left - right) / days.length;
  const gap = Math.min(6, bw * 0.3), barW = bw - gap;
  const r = Math.min(4, barW / 2);
  const bars = days.map((d, i) => {
    const x = left + i * bw + gap / 2, h = Math.max(0, y(0) - y(d.kcal));
    const topY = y(d.kcal);
    // Στρογγυλεμένη μόνο η πάνω πλευρά, «πατάει» στη βάση.
    const path = h > r ? `M${x},${y(0)} V${topY + r} Q${x},${topY} ${x + r},${topY} H${x + barW - r} Q${x + barW},${topY} ${x + barW},${topY + r} V${y(0)} Z` : h > 0 ? `M${x},${y(0)} V${topY} H${x + barW} V${y(0)} Z` : '';
    const over = d.kcal > goal;
    const label = days.length <= 7 ? shortDay(d.date) : (i % 5 === 0 ? dm(d.date) : '');
    return `<g class="bar-g" data-day="${d.date}" tabindex="0" role="button" aria-label="${dayTitle(d.date)}: ${fmt(d.kcal)} kcal">
      <title>${dayTitle(d.date)} · ${fmt(d.kcal)} kcal</title>
      <rect x="${left + i * bw}" y="${top}" width="${bw}" height="${H - top}" fill="transparent"/>
      ${path ? `<path d="${path}" class="bar ${d.date === todayIso() ? 'today' : ''}"/>` : ''}
      ${over ? `<text x="${x + barW / 2}" y="${topY - 4}" class="over-mark" text-anchor="middle">▲</text>` : ''}
      ${label ? `<text x="${x + barW / 2}" y="${H - 6}" class="axis" text-anchor="middle">${label}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Θερμίδες ανά μέρα', 'Calories per day')}">
    <line x1="${left}" x2="${W - right}" y1="${y(0)}" y2="${y(0)}" class="baseline"/>
    ${bars}
    <line x1="${left}" x2="${W - right}" y1="${y(goal)}" y2="${y(goal)}" class="goal-line"/>
    <text x="${left + 2}" y="${y(goal) - 4}" class="goal-label halo">${T('στόχος', 'goal')} ${fmt(goal)}</text>
  </svg>`;
}

/** Γραμμή βάρους (2px, σημεία 8px) με διακεκομμένη γραμμή για τα κιλά-στόχο αν έχουν οριστεί. */
function weightChart(ws, target) {
  const W = 340, H = 150, top = 14, bottom = 20, left = 30, right = 8;
  const vals = ws.map(w => w.kg).concat(target ? [target] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
  const t0 = Date.parse(ws[0].date), t1 = Date.parse(ws[ws.length - 1].date) || t0;
  const x = iso => ws.length === 1 ? (left + W - right) / 2 : left + (W - left - right) * (Date.parse(iso) - t0) / Math.max(1, t1 - t0);
  const y = v => top + (H - top - bottom) * (1 - (v - lo) / (hi - lo));
  const line = ws.map((w, i) => `${i ? 'L' : 'M'}${x(w.date).toFixed(1)},${y(w.kg).toFixed(1)}`).join(' ');
  const fmtKg = v => (Math.round(v * 10) / 10).toLocaleString(LOCALE());
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${T('Βάρος στον χρόνο', 'Weight over time')}">
    <text x="${left - 6}" y="${y(hi - pad) + 4}" class="axis" text-anchor="end">${fmtKg(hi - pad)}</text>
    <text x="${left - 6}" y="${y(lo + pad) + 4}" class="axis" text-anchor="end">${fmtKg(lo + pad)}</text>
    ${target ? `<line x1="${left}" x2="${W - right}" y1="${y(target)}" y2="${y(target)}" class="goal-line"/><text x="${W - right}" y="${y(target) - 4}" class="goal-label" text-anchor="end">${T('στόχος', 'goal')} ${fmtKg(target)}</text>` : ''}
    <path d="${line}" class="wline"/>
    ${ws.map(w => `<circle cx="${x(w.date)}" cy="${y(w.kg)}" r="4" class="wdot"><title>${dm(w.date)} · ${fmtKg(w.kg)} kg</title></circle>`).join('')}
    <text x="${left}" y="${H - 4}" class="axis">${dm(ws[0].date)}</text>
    ${ws.length > 1 ? `<text x="${W - right}" y="${H - 4}" class="axis" text-anchor="end">${dm(ws[ws.length - 1].date)}</text>` : ''}
  </svg>`;
}

function renderProgress(v) {
  const goal = data.settings.kcalGoal;
  ui.range = ui.range || 'week';
  const n = ui.range === 'week' ? 7 : 30;
  // Εβδομάδα = Δευτέρα–Κυριακή. Μήνας = οι τελευταίες 30 μέρες.
  ui.pEnd = ui.pEnd || todayIso();
  const first = ui.range === 'week' ? weekStart(ui.pEnd) : addDays(ui.pEnd, -29);
  const days = Array.from({ length: n }, (_, i) => { const date = addDays(first, i); return { date, ...totals(dayEntries(date)) }; });
  const past = days.filter(d => d.date <= todayIso());
  const logged = past.filter(d => d.kcal > 0);
  const avg = logged.length ? totals(logged).kcal / logged.length : 0;
  const onTarget = logged.filter(d => d.kcal <= goal && d.kcal >= goal * 0.8).length;
  // Μετράνε μόνο οι μέρες που έχεις γράψει κάτι (μια ξεχασμένη μέρα δεν «χαρίζει» θερμίδες).
  const weekTotal = totals(logged).kcal, weekBudget = goal * logged.length;
  const isCurrent = days.some(d => d.date === todayIso());
  const title = ui.range === 'week' ? `${dm(days[0].date)} – ${dm(days[6].date)}` : `${dm(days[0].date)} – ${dm(days[29].date)}`;
  const mac = logged.length ? totals(logged) : { p: 0, c: 0, f: 0 };
  const div = Math.max(1, logged.length);

  const ws = data.weights;
  const lastW = ws[ws.length - 1];
  const monthAgo = [...ws].reverse().find(w => w.date <= addDays(todayIso(), -28));
  const diff = lastW && monthAgo ? lastW.kg - monthAgo.kg : null;
  const kg = n1 => (Math.round(n1 * 10) / 10).toLocaleString(LOCALE());

  v.innerHTML = `
    <div class="seg" id="pgRange" style="margin-bottom:12px"><button data-r="week">${T('Εβδομάδα', 'Week')}</button><button data-r="month">${T('30 μέρες', '30 days')}</button></div>
    <div class="daynav">
      <button class="icon-btn" id="pgPrev" aria-label="${T('Προηγούμενα', 'Previous')}"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2>${title}</h2>
      <button class="icon-btn" id="pgNext" aria-label="${T('Επόμενα', 'Next')}" ${isCurrent ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <section class="card">
      <h2>🔥 ${T('Θερμίδες', 'Calories')}</h2>
      ${kcalChart(days, goal)}
      <div class="legend small muted"><span><i class="sw bar-sw"></i>${T('θερμίδες μέρας', 'daily calories')}</span><span><i class="sw goal-sw"></i>${T('στόχος', 'goal')}</span><span>▲ ${T('πάνω από τον στόχο', 'over goal')}</span></div>
      <div class="stats">
        <div><b>${fmt(avg)}</b><span>${T('μέσος όρος / μέρα', 'average / day')}</span></div>
        <div><b>${onTarget}/${logged.length}</b><span>${T('μέρες στον στόχο', 'days on target')}</span></div>
        ${ui.range === 'week' && logged.length ? `<div><b class="${weekTotal > weekBudget ? 'over-txt' : 'ok-txt'}">${weekTotal > weekBudget ? '+' : '−'}${fmt(Math.abs(weekBudget - weekTotal))}</b><span>${weekTotal > weekBudget ? T('πάνω από την εβδομάδα', 'over for the week') : T('περισσεύουν στην εβδομάδα', 'left for the week')}</span></div>` : ''}
      </div>
      <p class="small muted">${T('«Στον στόχο» = μέρες με 80–100% του στόχου. Πάτα μια μπάρα για να δεις τη μέρα.', '“On target” = days at 80–100% of the goal. Tap a bar to open that day.')}</p>
    </section>
    <section class="card">
      <h2>🥩 ${T('Μέσος όρος θρεπτικών / μέρα', 'Average nutrients / day')}</h2>
      ${macrosHtml({ p: mac.p / div, c: mac.c / div, f: mac.f / div })}
    </section>
    <section class="card">
      <div class="card-head"><h2>⚖️ ${T('Βάρος', 'Weight')}</h2><button class="btn small primary" id="wAdd">${T('+ Ζυγίστηκα', '+ Log weight')}</button></div>
      ${lastW ? `<div class="stats">
          <div><b>${kg(lastW.kg)} kg</b><span>${T('τελευταίο', 'latest')} · ${dm(lastW.date)}</span></div>
          ${diff !== null ? `<div><b>${diff > 0 ? '+' : diff < 0 ? '−' : ''}${kg(Math.abs(diff))} kg</b><span>${T('σε σχέση με πριν από έναν μήνα', 'vs a month ago')}</span></div>` : ''}
          ${data.settings.targetKg ? `<div><b>${kg(Math.abs(lastW.kg - data.settings.targetKg))} kg</b><span>${T('μέχρι τον στόχο', 'to goal')}</span></div>` : ''}
        </div>
        ${weightChart(ws.slice(-60), data.settings.targetKg)}
        <details class="adv"><summary class="small muted">${T('Όλες οι ζυγίσεις', 'All weigh-ins')} (${ws.length})</summary>
          <div class="list flat">${[...ws].reverse().map(w => `<button class="item" data-w="${w.date}"><span class="txt"><b>${kg(w.kg)} kg</b><small>${dayTitle(w.date)}</small></span><span class="muted">✎</span></button>`).join('')}</div></details>`
        : `<div class="empty">${T('Γράψε το βάρος σου για να βλέπεις πώς αλλάζει. Αρκεί μία φορά την εβδομάδα.', 'Log your weight to see how it changes. Once a week is enough.')}</div>`}
    </section>`;
  $$('#pgRange button', v).forEach(b => { b.classList.toggle('on', b.dataset.r === ui.range); b.onclick = () => { ui.range = b.dataset.r; ui.pEnd = todayIso(); render(); }; });
  const step = ui.range === 'week' ? 7 : 30;
  $('#pgPrev', v).onclick = () => { ui.pEnd = addDays(ui.pEnd, -step); render(); };
  $('#pgNext', v).onclick = () => { const nx = addDays(ui.pEnd, step); ui.pEnd = nx > todayIso() ? todayIso() : nx; render(); };
  $$('.bar-g', v).forEach(g => g.onclick = () => { if (g.dataset.day > todayIso()) return; ui.tab = 'today'; ui.day = g.dataset.day; render(); scrollTo(0, 0); });
  $('#wAdd', v).onclick = () => openWeightForm();
  $$('[data-w]', v).forEach(b => b.onclick = () => openWeightForm(data.weights.find(w => w.date === b.dataset.w)));
}

function openWeightForm(w) {
  const body = openSheet(w ? T('Ζύγιση', 'Weigh-in') : T('Ζυγίστηκα', 'Log weight'));
  const last = data.weights[data.weights.length - 1];
  body.innerHTML = `
    <label class="field"><span>${T('Κιλά', 'Kilograms')}</span><input id="wKg" inputmode="decimal" class="pin-input" style="letter-spacing:0" value="${w ? String(w.kg).replace('.', EN() ? '.' : ',') : ''}" placeholder="${last ? String(last.kg).replace('.', EN() ? '.' : ',') : '65'}"></label>
    <label class="field"><span>${T('Ημερομηνία', 'Date')}</span><input id="wDate" type="date" value="${w ? w.date : todayIso()}" max="${todayIso()}"></label>
    <div class="actions">${w ? `<button class="btn danger" id="wDel">${T('Διαγραφή', 'Delete')}</button>` : ''}<button class="btn primary" id="wSave">${T('Αποθήκευση', 'Save')}</button></div>`;
  $('#wSave', body).onclick = () => {
    const kgv = parseFloat($('#wKg', body).value.replace(',', '.'));
    const date = $('#wDate', body).value || todayIso();
    if (!(kgv > 20 && kgv < 400)) return toast(T('Γράψε κιλά, π.χ. 65,4', 'Enter kilograms, e.g. 65.4'));
    // Μία ζύγιση ανά μέρα: η νέα αντικαθιστά την παλιά.
    if (w && w.date !== date) { data.weights = data.weights.filter(x => x !== w); drop('weight', [w.date]); }
    data.weights = data.weights.filter(x => x.date !== date).concat({ date, kg: Math.round(kgv * 10) / 10 }).sort((a, b) => a.date.localeCompare(b.date));
    push('weight', [{ id: date, kg: Math.round(kgv * 10) / 10 }]);
    save(); closeSheet(); render(); toast(T('Αποθηκεύτηκε ✓', 'Saved ✓'));
  };
  if (w) $('#wDel', body).onclick = () => {
    data.weights = data.weights.filter(x => x !== w); drop('weight', [w.date]);
    save(); closeSheet(); render();
    toast(T('Διαγράφηκε', 'Deleted'), () => { data.weights = data.weights.concat(w).sort((a, b) => a.date.localeCompare(b.date)); push('weight', [{ id: w.date, kg: w.kg }]); save(); render(); });
  };
  setTimeout(() => $('#wKg', body).focus(), 80);
}

/* ---------- υπολογισμός στόχου θερμίδων ----------
 * Mifflin–St Jeor: ΒΜΡ = 10·κιλά + 6,25·εκ. − 5·ηλικία + 5 (άνδρας) / −161 (γυναίκα),
 * × συντελεστής κίνησης, ± ανάλογα με τον στόχο (0,5 κιλό/εβδ. ≈ 500 kcal/μέρα).
 */
const ACTIVITY = [[1.2, 'Σχεδόν καθόλου κίνηση', 'Mostly sitting'], [1.375, 'Λίγη (1–3 φορές/εβδ.)', 'Light (1–3×/week)'],
  [1.55, 'Μέτρια (3–5 φορές/εβδ.)', 'Moderate (3–5×/week)'], [1.725, 'Πολλή (6–7 φορές/εβδ.)', 'High (6–7×/week)'], [1.9, 'Πολύ έντονη / χειρωνακτική δουλειά', 'Very high / physical job']];
const GOALS = [['lose05', 'Να χάσω ~0,5 κιλό/εβδ.', 'Lose ~0.5 kg/week', -500], ['lose025', 'Να χάσω ~0,25 κιλό/εβδ.', 'Lose ~0.25 kg/week', -250],
  ['keep', 'Να κρατήσω το βάρος μου', 'Maintain my weight', 0], ['gain', 'Να πάρω ~0,25 κιλό/εβδ.', 'Gain ~0.25 kg/week', 250]];
function calcGoal(s, kg) {
  if (!(s.height > 0 && s.age > 0 && kg > 0)) return null;
  const bmr = 10 * kg + 6.25 * s.height - 5 * s.age + (s.sex === 'm' ? 5 : -161);
  const tdee = bmr * s.activity;
  const adj = (GOALS.find(g => g[0] === s.goalType) || GOALS[0])[3];
  const floor = s.sex === 'm' ? 1500 : 1200;
  const raw = tdee + adj;
  return { bmr: Math.round(bmr), tdee: Math.round(tdee), goal: Math.max(floor, Math.round(raw / 10) * 10), floored: raw < floor, floor };
}
function openGoalCalc() {
  const s = { ...data.settings };
  const lastKg = data.weights[data.weights.length - 1]?.kg || 0;
  const body = openSheet(T('🧮 Υπολογισμός στόχου', '🧮 Goal calculator'));
  body.innerHTML = `
    <div class="row2">
      <label class="field"><span>${T('Ύψος (εκ.)', 'Height (cm)')}</span><input id="gH" inputmode="numeric" value="${s.height || ''}" placeholder="165"></label>
      <label class="field"><span>${T('Ηλικία', 'Age')}</span><input id="gA" inputmode="numeric" value="${s.age || ''}" placeholder="30"></label>
      <label class="field"><span>${T('Βάρος (κιλά)', 'Weight (kg)')}</span><input id="gW" inputmode="decimal" value="${lastKg || ''}" placeholder="65"></label>
      <label class="field"><span>${T('Φύλο (για τον τύπο)', 'Sex (for the formula)')}</span><div class="seg" id="gS"><button data-s="f">${T('Γυναίκα', 'Female')}</button><button data-s="m">${T('Άνδρας', 'Male')}</button></div></label>
    </div>
    <label class="field"><span>${T('Κίνηση / άσκηση', 'Activity / exercise')}</span><select id="gAct">${ACTIVITY.map(([k, l, le]) => `<option value="${k}" ${k === s.activity ? 'selected' : ''}>${T(l, le)}</option>`).join('')}</select></label>
    <label class="field"><span>${T('Στόχος', 'Goal')}</span><select id="gGoal">${GOALS.map(([k, l, le]) => `<option value="${k}" ${k === s.goalType ? 'selected' : ''}>${T(l, le)}</option>`).join('')}</select></label>
    <label class="field"><span>${T('Κιλά-στόχος (προαιρετικά, για το γράφημα)', 'Target weight (optional, for the chart)')}</span><input id="gT" inputmode="decimal" value="${s.targetKg || ''}"></label>
    <div class="calc-out" id="gOut"></div>
    <p class="small muted">${T('Υπολογισμός Mifflin–St Jeor: μια καλή εκτίμηση για να ξεκινήσεις, όχι ιατρική συμβουλή. Αν μετά από 2–3 εβδομάδες το βάρος δεν κινείται όπως θέλεις, άλλαξε τον στόχο κατά ±100–200 kcal.', 'Mifflin–St Jeor formula: a good starting estimate, not medical advice. If your weight is not moving as you want after 2–3 weeks, adjust the goal by ±100–200 kcal.')}</p>
    <div class="actions"><button class="btn" id="gNo">${T('Κλείσιμο', 'Close')}</button><button class="btn primary" id="gOk" disabled>${T('Βάλ\' το ως στόχο', 'Set as my goal')}</button></div>`;
  const read = () => {
    s.height = parseFloat($('#gH', body).value) || 0; s.age = parseFloat($('#gA', body).value) || 0;
    s.activity = parseFloat($('#gAct', body).value); s.goalType = $('#gGoal', body).value;
    s.targetKg = parseFloat(($('#gT', body).value || '').replace(',', '.')) || 0;
    return parseFloat(($('#gW', body).value || '').replace(',', '.')) || 0;
  };
  let res = null;
  const draw = () => {
    const kgv = read();
    $$('#gS button', body).forEach(b => b.classList.toggle('on', b.dataset.s === s.sex));
    res = calcGoal(s, kgv);
    $('#gOk', body).disabled = !res;
    $('#gOut', body).innerHTML = res
      ? `<div class="stats"><div><b>${fmt(res.bmr)}</b><span>${T('καύση σε ηρεμία', 'at rest (BMR)')}</span></div><div><b>${fmt(res.tdee)}</b><span>${T('για να κρατήσεις το βάρος', 'to maintain')}</span></div><div><b class="ok-txt">${fmt(res.goal)}</b><span>${T('προτεινόμενος στόχος', 'suggested goal')}</span></div></div>
         ${res.floored ? `<p class="small note">⚠️ ${T(`Δεν προτείνω κάτω από ${fmt(res.floor)} kcal τη μέρα, οπότε ο στόχος μπήκε εκεί.`, `I don't suggest going below ${fmt(res.floor)} kcal a day, so the goal was set there.`)}</p>` : ''}`
      : `<p class="small muted">${T('Συμπλήρωσε ύψος, ηλικία και βάρος.', 'Fill in height, age and weight.')}</p>`;
  };
  $$('input, select', body).forEach(el => el.oninput = draw);
  $$('#gS button', body).forEach(b => b.onclick = () => { s.sex = b.dataset.s; draw(); });
  $('#gNo', body).onclick = closeSheet;
  $('#gOk', body).onclick = () => {
    const kgv = read();
    Object.assign(data.settings, { height: s.height, age: s.age, sex: s.sex, activity: s.activity, goalType: s.goalType, targetKg: s.targetKg, kcalGoal: res.goal });
    // Αν έγραψες βάρος εδώ και δεν υπάρχει σημερινή ζύγιση, μπαίνει και στο Βάρος.
    if (kgv > 20 && !data.weights.some(w => w.date === todayIso()) && kgv !== data.weights[data.weights.length - 1]?.kg) {
      data.weights.push({ date: todayIso(), kg: Math.round(kgv * 10) / 10 }); push('weight', [{ id: todayIso(), kg: Math.round(kgv * 10) / 10 }]);
    }
    save(); push('settings', settingsRows()); closeSheet(); render();
    toast(T(`Νέος στόχος: ${fmt(res.goal)} kcal ✓`, `New goal: ${fmt(res.goal)} kcal ✓`));
  };
  draw();
}

/* ---------- πρόγραμμα εβδομάδας ---------- */
// Θέματα ημέρας: ποιες συνταγές/τρόφιμα ταιριάζουν σε κάθε θέμα (για τις προτάσεις μεσημεριανού/βραδινού).
const THEMES = [
  { key: 'legumes', icon: '🫘', el: 'Όσπρια', en: 'Legumes', rec: r => inCat(r, 'Κυρίως γεύμα/Όσπρια'), food: f => f.cat === 'Όσπρια' && f.use !== 'Υ' },
  { key: 'meat', icon: '🥩', el: 'Κρέας', en: 'Meat', rec: r => inCat(r, 'Κυρίως γεύμα/Κρέας') && !inCat(r, 'Κυρίως γεύμα/Κρέας/Πουλερικά'), food: f => f.cat === 'Κρέας & πουλερικά' && !/Κοτό|Γαλοπούλα|Ζαμπόν|Σαλάμι|Μορταδέλα|Προσούτο|Μπέικον|Παστουρμ/.test(f.name) && f.use !== 'Υ' },
  { key: 'chicken', icon: '🍗', el: 'Κοτόπουλο', en: 'Chicken', rec: r => inCat(r, 'Κυρίως γεύμα/Κρέας/Πουλερικά') || /κοτόσουπα/i.test(r.name), food: f => /^Κοτό|Κοτομπουκιές/.test(f.name) && f.use !== 'Υ' },
  { key: 'fish', icon: '🐟', el: 'Ψάρι', en: 'Fish', rec: r => inCat(r, 'Κυρίως γεύμα/Ψάρια') || inCat(r, 'Κυρίως γεύμα/Θαλασσινά'), food: f => f.cat === 'Ψάρια & θαλασσινά' && f.use !== 'Υ' },
  { key: 'pasta', icon: '🍝', el: 'Ζυμαρικά', en: 'Pasta', rec: r => inCat(r, 'Κυρίως γεύμα/Ζυμαρικά'), food: f => /Μακαρόνια|Ζυμαρικά βρασμ|Καρμπονάρα|Λαζάνια|Γαριδομακαρ/.test(f.name) && f.use !== 'Υ' },
  { key: 'veg', icon: '🫛', el: 'Λαδερά', en: 'Veg dishes', rec: r => inCat(r, 'Κυρίως γεύμα/Λαδερά') || inCat(r, 'Κυρίως γεύμα/Λαχανικά'), food: f => /λαδερ|Μπριάμ|Γεμιστά|Σπανακόρυζο|Ιμάμ/.test(f.name) },
  { key: 'oven', icon: '🥧', el: 'Φούρνου & πίτες', en: 'Oven & pies', rec: r => inCat(r, 'Κυρίως γεύμα/Αλμυρές πίτες & Τάρτες') || /Μουσακάς|Παστίτσιο/.test(r.name), food: f => /πιτα|Μουσακάς|Παστίτσιο/i.test(f.name) && f.cat === 'Μαγειρευτά (ελληνική κουζίνα)' },
  { key: 'soup', icon: '🍲', el: 'Σούπα', en: 'Soup', rec: r => inCat(r, 'Σούπες') || /σούπα/i.test(r.name), food: f => /σούπα|Φασολάδα|Ρεβιθάδα|Μαγειρίτσα|Γιουβαρλάκια/i.test(f.name) && f.use !== 'Υ' },
  { key: 'out', icon: '🌯', el: 'Έξω / delivery', en: 'Eating out', rec: () => false, food: f => f.cat === 'Σουβλατζίδικο & delivery' },
  { key: 'free', icon: '✨', el: 'Ελεύθερο', en: 'Free', rec: () => true, food: () => false },
];
const themeByKey = k => THEMES.find(t => t.key === k);
const themeName = t => (t ? `${t.icon} ${T(t.el, t.en)}` : '');
function themesMap() { try { return JSON.parse(data.settings.themes || '{}') || {}; } catch { return {}; } }
const weekdayIdx = iso => { const [y, m, d] = iso.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
const dayTheme = iso => themeByKey(themesMap()[weekdayIdx(iso)]);
const dayName = idx => new Date(2024, 0, 1 + idx).toLocaleDateString(LOCALE(), { weekday: 'long' }); // 1/1/2024 = Δευτέρα
const planOf = iso => data.plan.filter(p => p.date === iso);
// «Το έφαγες» = υπάρχει καταγραφή την ίδια μέρα, στο ίδιο γεύμα, με το ίδιο φαγητό/συνταγή.
const planDone = p => data.log.some(e => e.date === p.date && e.meal === p.meal && e.kind === p.kind && String(e.ref) === String(p.ref));

/** Υλικό σε μορφή καταγραφής (για πρόγραμμα/καταγραφή) από τρόφιμο ή συνταγή, με ποσότητα qty. */
function makeItem(kind, x, qty = 1) {
  if (kind === 'recipe') {
    const s = x.perServing;
    return { kind, ref: x.id, name: x.name, qty, unit: 'μερίδα', g: 0, kcal: Math.round(s.kcal * qty), p: s.p * qty, c: s.c * qty, f: s.f * qty };
  }
  const p = x.portions[0], n = nutrFor(x, p.g * qty);
  return { kind, ref: x.id, name: x.name, qty, unit: p.name, g: Math.round(p.g * qty), kcal: Math.round(n.kcal), p: Math.round(n.p * 10) / 10, c: Math.round(n.c * 10) / 10, f: Math.round(n.f * 10) / 10 };
}
// Κατηγορίες που ταιριάζουν σε κάθε γεύμα όταν δεν υπάρχει θέμα.
const MEAL_FOOD_CATS = {
  breakfast: ['Καφέδες & ροφήματα', 'Γαλακτοκομικά & τυριά', 'Καντίνα, φούρνος & πρωινό έξω', 'Αυγά', 'Φρούτα'],
  snack: ['Φρούτα', 'Γλυκά & σνακ', 'Γαλακτοκομικά & τυριά', 'Λάδια, λίπη & ξηροί καρποί', 'Καφέδες & ροφήματα'],
};
/**
 * Προτάσεις για ένα γεύμα με βάση τις θερμίδες που χωράνε (target): πρώτα ό,τι πλησιάζει τον στόχο,
 * με προτίμηση σε αγαπημένα/πρόσφατα και στο θέμα της μέρας (για μεσημεριανό/βραδινό).
 */
function suggest(meal, target, theme, limit = 30) {
  const main = meal === 'lunch' || meal === 'dinner';
  const favs = new Set(data.favs), recent = new Set(recentItems(30).map(r => r.key));
  const cands = [];
  for (const r of RECIPES) {
    const ok = main ? (theme && theme.key !== 'free' ? theme.rec(r) : !inCat(r, 'Πρωινό') && !inCat(r, 'Γλυκά'))
      : meal === 'breakfast' ? inCat(r, 'Πρωινό') : ['Γλυκά', 'Πρωινό', 'Σαλάτες & συνοδευτικά', 'Σνακ'].some(p => inCat(r, p));
    if (ok) cands.push({ kind: 'recipe', x: r, kcal: r.perServing.kcal });
  }
  for (const f of FOODS) {
    if (f.use === 'Υ') continue;
    const ok = main ? (theme && theme.key !== 'free' ? theme.food(f) : f.cat === 'Μαγειρευτά (ελληνική κουζίνα)')
      : (MEAL_FOOD_CATS[meal] || []).includes(f.cat);
    if (ok) cands.push({ kind: 'food', x: f, kcal: f.kcal * f.portions[0].g / 100 });
  }
  const t = Math.max(target, 120);
  const key = c => `${c.kind}:${c.x.id}`;
  const score = c => Math.abs(c.kcal - t) / t - (favs.has(key(c)) ? 0.25 : 0) - (recent.has(key(c)) ? 0.12 : 0) + (c.kcal > t * 1.15 ? 0.3 : 0);
  return cands.filter(c => c.kcal > 0).sort((a, b) => score(a) - score(b)).slice(0, limit);
}
// Πόσες θερμίδες «χωράνε» σε ένα γεύμα: ό,τι μένει από τον στόχο, μοιρασμένο στα γεύματα που είναι ακόμα άδεια.
function mealTarget(date, meal, used) {
  const left = data.settings.kcalGoal - used;
  const share = { breakfast: 0.25, lunch: 0.35, snack: 0.1, dinner: 0.3 };
  const filled = new Set([...planOf(date), ...dayEntries(date)].map(e => e.meal));
  const empty = Object.keys(share).filter(m => m === meal || !filled.has(m));
  const tot = empty.reduce((s, m) => s + share[m], 0) || 1;
  return Math.max(0, Math.round(left * share[meal] / tot));
}

// Κάρτα μιας μέρας του προγράμματος (χρησιμοποιείται στην εβδομάδα και στη σελίδα της μέρας).
function planDayCard(d, inWeek) {
  const goal = data.settings.kcalGoal;
  const items = planOf(d), sum = totals(items).kcal, th = dayTheme(d), past = d < todayIso();
  const pct = goal ? Math.min(100, sum / goal * 100) : 0;
  return `<section class="card plan-day ${d === todayIso() ? 'is-today' : ''} ${past && inWeek ? 'is-past' : ''}">
    <div class="card-head">
      ${inWeek ? `<button class="link-head" data-pday="${d}"><h2>${dayTitle(d)}${d === todayIso() || d === addDays(todayIso(), -1) ? ` <small class="muted">${dm(d)}</small>` : ''} <span class="muted">›</span></h2></button>`
        : `<h2>${T('Πρόγραμμα μέρας', 'Day plan')}</h2>`}
      <button class="chip theme-chip" data-theme="${d}">${th ? esc(themeName(th)) : T('+ θέμα', '+ theme')}</button>
    </div>
    <div class="meter" role="img" aria-label="${fmt(sum)} / ${fmt(goal)} kcal"><i style="width:${pct}%" class="${sum > goal ? 'over' : ''}"></i></div>
    <div class="small muted" style="margin:4px 0 8px">${fmt(sum)} / ${fmt(goal)} kcal ${T('στο πρόγραμμα', 'planned')}${sum > goal ? ` · <span class="over-txt">${T('πάνω από τον στόχο', 'over goal')}</span>` : ''}</div>
    ${MEALS.map(m => {
      const its = items.filter(p => p.meal === m.key);
      return `<div class="plan-meal"><span class="pm-name">${m.icon} ${mealName(m)}</span>
        <div class="pm-items">${its.map(p => `<button class="pm-item ${planDone(p) ? 'done' : ''}" data-plan="${p.id}">${planDone(p) ? '✓ ' : ''}${esc(entryName(p))}${p.qty !== 1 ? ` ×${fmtQty(p.qty)}` : ''} <small>${fmt(p.kcal)}</small></button>`).join('')}
          <button class="pm-add" data-padd="${d}|${m.key}" aria-label="${T('Πρόσθεσε', 'Add')}">+</button></div></div>`;
    }).join('')}
  </section>`;
}
function wirePlanCards(v) {
  $$('[data-theme]', v).forEach(b => b.onclick = () => openThemePick(b.dataset.theme));
  $$('[data-padd]', v).forEach(b => b.onclick = () => { const [d, m] = b.dataset.padd.split('|'); openPlanPick(d, m); });
  $$('[data-plan]', v).forEach(b => b.onclick = () => openPlanItem(data.plan.find(p => p.id === b.dataset.plan)));
  $$('[data-pday]', v).forEach(b => b.onclick = () => { ui.planDay = b.dataset.pday; render(); scrollTo(0, 0); });
}

/** Πρόγραμμα: ημερολόγιο μήνα (πατάς μέρα → σελίδα της μέρας) ή όλη η εβδομάδα μαζί. */
function renderPlan(v) {
  if (ui.planDay) return renderPlanDay(v, ui.planDay);
  ui.planView = ui.planView || 'cal';
  const seg = `<div class="seg" id="plView" style="margin-bottom:12px"><button data-pv="cal">📅 ${T('Ημερολόγιο', 'Calendar')}</button><button data-pv="week">🗓️ ${T('Εβδομάδα', 'Week')}</button></div>`;
  if (ui.planView === 'cal') renderPlanCalendar(v, seg); else renderPlanWeek(v, seg);
  $$('#plView button', v).forEach(b => { b.classList.toggle('on', b.dataset.pv === ui.planView); b.onclick = () => { ui.planView = b.dataset.pv; render(); }; });
}

function renderPlanCalendar(v, seg) {
  ui.planMonth = ui.planMonth || todayIso().slice(0, 7);
  const [y, m] = ui.planMonth.split('-').map(Number);
  const first = `${ui.planMonth}-01`, start = weekStart(first);
  const end = addDays(first, new Date(y, m, 0).getDate() - 1);
  const cells = [];
  for (let d = start; d <= end || cells.length % 7; d = addDays(d, 1)) cells.push(d);
  const goal = data.settings.kcalGoal;
  const title = new Date(y, m - 1, 1).toLocaleDateString(LOCALE(), { month: 'long', year: 'numeric' });
  const heads = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(LOCALE(), { weekday: 'short' }).replace('.', ''));
  v.innerHTML = `${seg}
    <div class="daynav">
      <button class="icon-btn" id="cmPrev" aria-label="${T('Προηγούμενος μήνας', 'Previous month')}"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2 class="cap">${title}</h2>
      <button class="icon-btn" id="cmNext" aria-label="${T('Επόμενος μήνας', 'Next month')}"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <section class="card cal">
      <div class="cal-grid">${heads.map(h => `<div class="cal-h">${h}</div>`).join('')}
        ${cells.map(d => {
          const inMonth = d.slice(0, 7) === ui.planMonth, items = planOf(d), sum = totals(items).kcal, th = dayTheme(d);
          const pct = goal ? Math.min(100, sum / goal * 100) : 0;
          return `<button class="cal-d ${inMonth ? '' : 'out'} ${d === todayIso() ? 'today' : ''} ${d < todayIso() ? 'past' : ''}" data-pday="${d}" aria-label="${dayTitle(d)}: ${fmt(sum)} kcal">
            <span class="cal-n">${+d.slice(8)}</span>
            <span class="cal-t">${th ? th.icon : ''}</span>
            ${items.length ? `<span class="cal-k">${fmt(sum)}</span><span class="cal-m"><i style="width:${pct}%" class="${sum > goal ? 'over' : ''}"></i></span>` : ''}
          </button>`;
        }).join('')}
      </div>
      <p class="small muted" style="margin:10px 2px 0">${T('Πάτα μια μέρα για να δεις και να φτιάξεις το πρόγραμμά της. Ο αριθμός είναι οι θερμίδες που έχεις προγραμματίσει.', 'Tap a day to see and plan it. The number is the calories you have planned.')}</p>
    </section>
    <div class="row2"><button class="btn" id="plToday">📍 ${T('Σήμερα', 'Today')}</button><button class="btn" id="plWeekShop">🛒 ${T('Ψώνια εβδομάδας', 'Week shopping')}</button></div>`;
  const shift = n => { const dd = new Date(y, m - 1 + n, 1); ui.planMonth = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}`; render(); };
  $('#cmPrev', v).onclick = () => shift(-1);
  $('#cmNext', v).onclick = () => shift(1);
  $('#plToday', v).onclick = () => { ui.planDay = todayIso(); render(); };
  $('#plWeekShop', v).onclick = () => openWeekShopping(Array.from({ length: 7 }, (_, i) => addDays(weekStart(todayIso()), i)));
  wirePlanCards(v);
}

function renderPlanWeek(v, seg) {
  ui.planWeek = ui.planWeek || weekStart(todayIso());
  const days = Array.from({ length: 7 }, (_, i) => addDays(ui.planWeek, i));
  const isThis = ui.planWeek === weekStart(todayIso());
  v.innerHTML = `${seg}
    <div class="daynav">
      <button class="icon-btn" id="plPrev" aria-label="${T('Προηγούμενη εβδομάδα', 'Previous week')}"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2>${isThis ? T('Αυτή η εβδομάδα', 'This week') : `${dm(days[0])} – ${dm(days[6])}`}</h2>
      <button class="icon-btn" id="plNext" aria-label="${T('Επόμενη εβδομάδα', 'Next week')}"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <div class="row2" style="margin-bottom:12px">
      <button class="btn" id="plShop">🛒 ${T('Ψώνια εβδομάδας', 'Week shopping')}</button>
      <button class="btn" id="plCopy">📋 ${T('Όπως την προηγούμενη', 'Copy last week')}</button>
    </div>
    ${days.map(d => planDayCard(d, true)).join('')}`;
  $('#plPrev', v).onclick = () => { ui.planWeek = addDays(ui.planWeek, -7); render(); };
  $('#plNext', v).onclick = () => { ui.planWeek = addDays(ui.planWeek, 7); render(); };
  $('#plShop', v).onclick = () => openWeekShopping(days);
  $('#plCopy', v).onclick = () => copyLastWeek(days);
  wirePlanCards(v);
}

/** Σελίδα μιας μέρας: το πρόγραμμά της, με ◀ ▶ για άλλες μέρες και επιστροφή στο ημερολόγιο. */
function renderPlanDay(v, d) {
  const logged = totals(dayEntries(d)).kcal;
  v.innerHTML = `
    <button class="btn small" id="pdBack" style="margin-bottom:10px">← ${ui.planView === 'week' ? T('Εβδομάδα', 'Week') : T('Ημερολόγιο', 'Calendar')}</button>
    <div class="daynav">
      <button class="icon-btn" id="pdPrev" aria-label="${T('Προηγούμενη μέρα', 'Previous day')}"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2>${dayTitle(d)}${d === todayIso() || d === addDays(todayIso(), -1) ? ` <small class="muted">${dm(d)}</small>` : ''}</h2>
      <button class="icon-btn" id="pdNext" aria-label="${T('Επόμενη μέρα', 'Next day')}"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    ${planDayCard(d, false)}
    ${d <= todayIso() ? `<p class="small muted" style="text-align:center">${T(`Έχεις γράψει ${fmt(logged)} kcal αυτή τη μέρα.`, `You logged ${fmt(logged)} kcal that day.`)} <a href="#" id="pdLog">${T('Δες την καταγραφή', 'See the log')}</a></p>` : ''}`;
  $('#pdBack', v).onclick = () => { ui.planDay = null; ui.planMonth = d.slice(0, 7); ui.planWeek = weekStart(d); render(); };
  $('#pdPrev', v).onclick = () => { ui.planDay = addDays(d, -1); render(); };
  $('#pdNext', v).onclick = () => { ui.planDay = addDays(d, 1); render(); };
  const lg = $('#pdLog', v);
  if (lg) lg.onclick = e => { e.preventDefault(); ui.tab = 'today'; ui.day = d; ui.planDay = null; render(); scrollTo(0, 0); };
  wirePlanCards(v);
}

function openThemePick(date) {
  const idx = weekdayIdx(date), map = themesMap();
  const body = openSheet(T(`Θέμα για κάθε ${dayName(idx)}`, `Theme for every ${dayName(idx)}`));
  body.innerHTML = `<p class="small muted" style="margin-top:0">${T('Επαναλαμβάνεται κάθε εβδομάδα. Οι προτάσεις για μεσημεριανό και βραδινό θα ακολουθούν το θέμα.', 'It repeats every week. Lunch and dinner suggestions will follow the theme.')}</p>
    <div class="chips">${THEMES.map(t => `<button class="chip ${map[idx] === t.key ? 'on' : ''}" data-t="${t.key}">${esc(themeName(t))}</button>`).join('')}
    <button class="chip ${!map[idx] ? 'on' : ''}" data-t="">${T('Κανένα', 'None')}</button></div>`;
  $$('[data-t]', body).forEach(b => b.onclick = () => {
    const m = themesMap();
    if (b.dataset.t) m[idx] = b.dataset.t; else delete m[idx];
    data.settings.themes = JSON.stringify(m); save(); push('settings', settingsRows());
    closeSheet(); render();
  });
}

/** Επιλογή φαγητού για το πρόγραμμα: προτάσεις με βάση τις θερμίδες που χωράνε, ή αναζήτηση. */
function openPlanPick(date, meal) {
  const used = totals(planOf(date)).kcal, target = mealTarget(date, meal, used), th = dayTheme(date);
  const m = MEALS.find(x => x.key === meal);
  const body = openSheet(`${m.icon} ${mealName(m)} · ${dayTitle(date)}`);
  body.innerHTML = `
    <p class="small muted" style="margin-top:0">${T(`Στο πρόγραμμα της μέρας: ${fmt(used)} / ${fmt(data.settings.kcalGoal)} kcal. Για αυτό το γεύμα ταιριάζουν γύρω στις <b>${fmt(target)} kcal</b>.`, `Planned for the day: ${fmt(used)} / ${fmt(data.settings.kcalGoal)} kcal. About <b>${fmt(target)} kcal</b> fit this meal.`)}${th && (meal === 'lunch' || meal === 'dinner') ? ` ${T('Θέμα', 'Theme')}: ${esc(themeName(th))}` : ''}</p>
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="ppQ" type="search" placeholder="${T('Ψάξε ή διάλεξε από τις προτάσεις…', 'Search or pick a suggestion…')}" autocomplete="off"></label>
    <div class="results" id="ppRes"></div>`;
  const add = (kind, x) => {
    const it = { ...makeItem(kind, x), id: newId(), date, meal };
    data.plan.push(it); push('plan', [it]); save(); closeSheet(); render();
    toast(`${T('Στο πρόγραμμα', 'Planned')}: ${kind === 'recipe' ? recipeName(x) : foodName(x)} ✓`);
  };
  const row = c => {
    const name = c.kind === 'recipe' ? recipeName(c.x) : foodName(c.x);
    const sub = c.kind === 'recipe' ? T('1 μερίδα', '1 serving') : portionName(c.x, c.x.portions[0].name);
    const fit = Math.abs(c.kcal - target) <= Math.max(80, target * 0.15);
    return `<button class="item" data-pp="${c.kind}:${c.x.id}"><span class="ico">${c.kind === 'recipe' ? c.x.icon : CAT_ICONS[c.x.cat] || '🍴'}</span>
      <span class="txt"><b>${esc(name)}</b><small>${esc(sub)} · ${fmt(c.kcal)} kcal${fit ? ` · <span class="ok-txt">${T('ταιριάζει', 'fits')}</span>` : ''}</small></span></button>`;
  };
  const draw = () => {
    const q = $('#ppQ', body).value.trim();
    let list;
    if (q) {
      const words = fold(q).split(/\s+/).filter(Boolean);
      const hit = s => !!s && words.every(w => fold(s).includes(w));
      list = [...RECIPES.filter(r => hit(r.name) || hit(r.en?.name)).map(r => ({ kind: 'recipe', x: r, kcal: r.perServing.kcal })),
        ...FOODS.filter(f => f.use !== 'Υ' && (hit(f.name) || hit(f.en))).slice(0, 40).map(f => ({ kind: 'food', x: f, kcal: f.kcal * f.portions[0].g / 100 }))];
    } else list = suggest(meal, target, th);
    $('#ppRes', body).innerHTML = list.length ? `${q ? '' : `<div class="section-label">💡 ${T('Προτάσεις', 'Suggestions')}</div>`}<div class="list">${list.map(row).join('')}</div>` : `<div class="empty">${T('Δεν βρέθηκε κάτι.', 'Nothing found.')}</div>`;
    $$('[data-pp]', body).forEach(b => b.onclick = () => { const [k, id] = b.dataset.pp.split(':'); add(k, k === 'recipe' ? recipeById(+id) : foodById(+id)); });
  };
  $('#ppQ', body).oninput = draw;
  draw();
}

function openPlanItem(p) {
  if (!p) return;
  const done = planDone(p);
  const x = p.kind === 'recipe' ? recipeById(p.ref) : foodById(p.ref);
  const body = openSheet(entryName(p));
  body.innerHTML = `
    <p class="muted small" style="margin-top:0">${dayTitle(p.date)} · ${mealName(MEALS.find(m => m.key === p.meal))}${done ? ` · <span class="ok-txt">✓ ${T('το έφαγες', 'eaten')}</span>` : ''}</p>
    <div class="stepper"><button id="piMinus" aria-label="${T('Λιγότερο', 'Less')}">−</button><input id="piQty" inputmode="decimal" value="${fmtQty(p.qty)}"><span class="unit">${p.kind === 'recipe' ? T('μερίδες', 'servings') : '× ' + esc(portionName(x, p.unit))}</span><button id="piPlus" aria-label="${T('Περισσότερο', 'More')}">+</button></div>
    <div class="portion-kcal"><b id="piK">${fmt(p.kcal)}</b> <span>kcal</span></div>
    ${!done ? `<button class="btn primary block" id="piAte">✅ ${T('Το έφαγα', 'I ate this')}</button>` : ''}
    ${p.kind === 'recipe' && x ? `<button class="btn block" id="piRec">📖 ${T('Δες τη συνταγή', 'View recipe')}</button>` : ''}
    <div class="actions"><button class="btn danger" id="piDel">${T('Αφαίρεση', 'Remove')}</button><button class="btn" id="piOk">OK</button></div>`;
  let qty = p.qty;
  const calc = () => (x ? makeItem(p.kind, x, qty) : { ...p, kcal: Math.round(p.kcal / p.qty * qty) });
  const upd = () => { $('#piQty', body).value = fmtQty(qty); $('#piK', body).textContent = fmt(calc().kcal); };
  $('#piMinus', body).onclick = () => { qty = Math.max(0.5, qty - 0.5); upd(); };
  $('#piPlus', body).onclick = () => { qty += 0.5; upd(); };
  $('#piQty', body).oninput = e => { const n = parseFloat(e.target.value.replace(',', '.')); if (n > 0) { qty = n; $('#piK', body).textContent = fmt(calc().kcal); } };
  const commit = () => { if (qty !== p.qty) { Object.assign(p, calc(), { qty }); push('plan', [p]); save(); } };
  $('#piOk', body).onclick = () => { commit(); closeSheet(); render(); };
  $('#piDel', body).onclick = () => {
    data.plan = data.plan.filter(q => q !== p); drop('plan', [p.id]); save(); closeSheet(); render();
    toast(T('Βγήκε από το πρόγραμμα', 'Removed from plan'), () => { data.plan.push(p); push('plan', [p]); save(); render(); });
  };
  const ate = $('#piAte', body);
  if (ate) ate.onclick = () => { commit(); ateFromPlan(p); };
  const rec = $('#piRec', body);
  if (rec) rec.onclick = () => openRecipe(x);
}
function ateFromPlan(p) {
  const { id, date, meal, ...rest } = p;
  const e = { ...rest, id: newId(), date, meal };
  data.log.push(e); push('log', [e]); save(); closeSheet(); render();
  toast(`+${fmt(e.kcal)} kcal ✓`, () => { data.log = data.log.filter(x => x !== e); drop('log', [e.id]); save(); render(); });
}

function copyLastWeek(days) {
  const prev = data.plan.filter(p => p.date >= addDays(days[0], -7) && p.date < days[0]);
  if (!prev.length) return toast(T('Η προηγούμενη εβδομάδα δεν έχει πρόγραμμα', 'Last week has no plan'));
  const sig = p => `${p.date}|${p.meal}|${p.kind}|${p.ref}`;
  const has = new Set(data.plan.filter(p => days.includes(p.date)).map(sig));
  const add = prev.map(p => ({ ...p, id: newId(), date: addDays(p.date, 7) })).filter(p => !has.has(sig(p)));
  data.plan.push(...add); push('plan', add); save(); render();
  toast(T(`Αντιγράφηκαν ${add.length} φαγητά ✓`, `Copied ${add.length} items ✓`), () => { const ids = new Set(add.map(a => a.id)); data.plan = data.plan.filter(p => !ids.has(p.id)); drop('plan', [...ids]); save(); render(); });
}

/** Υλικά για όλη την εβδομάδα: συνταγές (ανάλογα με τις μερίδες) + τρόφιμα, αθροισμένα ανά τρόφιμο. */
function weekShoppingList(days) {
  const sum = new Map();
  const addFood = (food, g, pieces) => {
    if (!food || /Αλάτι/.test(food.name) || food.name === 'Νερό') return;
    const s = sum.get(food.id) || { food, g: 0, pieces: 0, pieceOnly: true };
    s.g += g;
    if (pieces) s.pieces += pieces; else s.pieceOnly = false;
    sum.set(food.id, s);
  };
  const today = todayIso();
  for (const p of data.plan.filter(q => days.includes(q.date) && q.date >= today && !planDone(q))) {
    if (p.kind === 'recipe') {
      const r = recipeById(p.ref);
      if (!r) continue;
      const k = p.qty / r.servings;
      for (const it of r.items) addFood(foodById(it.food), it.g * k, it.unit === 'τεμ' ? it.qty * k : 0);
    } else if (p.kind === 'food') addFood(foodById(p.ref), p.g, 0);
  }
  return [...sum.values()].sort((a, b) => a.food.cat.localeCompare(b.food.cat) || foodName(a.food).localeCompare(foodName(b.food)));
}
function shopAmount(s) {
  if (s.pieceOnly && s.pieces) {
    const piece = s.food.portions.find(p => p.piece);
    return `${Math.ceil(s.pieces - 0.01)} × ${portionName(s.food, piece?.name || '').replace(/^1 /, '')}`;
  }
  return s.g >= 1000 ? `${(Math.ceil(s.g / 50) * 50 / 1000).toLocaleString(LOCALE())} kg` : `${niceGrams(s.g)} ${G()}`;
}
function openWeekShopping(days) {
  const list = weekShoppingList(days);
  const body = openSheet(`🛒 ${T('Ψώνια εβδομάδας', 'Week shopping')}`);
  const text = list.map(s => `${foodName(s.food)} — ${shopAmount(s)}`).join('\n');
  body.innerHTML = list.length ? `
    <p class="small muted" style="margin-top:0">${T('Από τις συνταγές και τα φαγητά του προγράμματος (από σήμερα και μετά, όσα δεν έχεις φάει ακόμα). Τα ποσά είναι αθροισμένα.', 'From the recipes and foods in your plan (from today on, not yet eaten). Amounts are added up.')}</p>
    <div class="list flat">${list.map(s => `<label class="item shop-row"><input type="checkbox"><span class="txt"><b>${esc(foodName(s.food))}</b></span><span class="muted">${esc(shopAmount(s))}</span></label>`).join('')}</div>
    <div class="actions"><button class="btn" id="wsCopy">📋 ${T('Αντιγραφή', 'Copy')}</button><button class="btn primary" id="wsHH">🏠 ${T('Στο Household Desk', 'To Household Desk')}</button></div>`
    : `<div class="empty">${T('Βάλε συνταγές στο πρόγραμμα της εβδομάδας και εδώ θα βγαίνει η λίστα με τα υλικά.', 'Add recipes to the week plan and the ingredient list will show up here.')}</div>`;
  const c = $('#wsCopy', body);
  if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(text); toast(T('Αντιγράφηκε ✓', 'Copied ✓')); } catch { toast(T('Δεν έγινε αντιγραφή', 'Could not copy')); } };
  const hh = $('#wsHH', body);
  if (hh) hh.onclick = () => sendToHousehold(list.map(s => ({ name: foodName(s.food), qty: shopAmount(s) })));
}
// Στέλνεται στα Ψώνια του Household Desk (στήνεται στο επόμενο βήμα).
function sendToHousehold() { toast(T('Έρχεται στο επόμενο βήμα 🙂', 'Coming in the next step 🙂')); }

/* ---------- ρυθμίσεις ---------- */
function renderSettings(v) {
  const s = data.settings;
  v.innerHTML = `
    <section class="card">
      <h2>🎯 ${T('Στόχοι', 'Goals')}</h2>
      <div class="row2">
        <label class="field"><span>${T('Θερμίδες / ημέρα', 'Calories / day')}</span><input id="sKcal" inputmode="numeric" value="${s.kcalGoal}"></label>
        <label class="field"><span>${T('Νερό (ποτήρια)', 'Water (glasses)')}</span><input id="sWater" inputmode="numeric" value="${s.waterGoal}"></label>
      </div>
      <button class="btn block" id="sCalc">🧮 ${T('Υπολόγισε τον στόχο μου', 'Calculate my goal')}</button>
    </section>
    <section class="card">
      <h2>🌍 ${T('Γλώσσα', 'Language')}</h2>
      <div class="seg" id="sLang"><button data-l="el" class="${LANG === 'el' ? 'on' : ''}">🇬🇷 Ελληνικά</button><button data-l="en" class="${LANG === 'en' ? 'on' : ''}">🇬🇧 English</button></div>
    </section>
    <section class="card">
      <h2>🎨 ${T('Εμφάνιση', 'Appearance')}</h2>
      <div class="seg" id="sTheme">${[['auto', 'Αυτόματο', 'Auto'], ['light', 'Φωτεινό', 'Light'], ['dark', 'Σκούρο', 'Dark']].map(([k, l, le]) => `<button data-t="${k}" class="${s.theme === k ? 'on' : ''}">${T(l, le)}</button>`).join('')}</div>
    </section>
    <section class="card">
      <h2>✏️ ${T('Τα δικά μου', 'My stuff')}</h2>
      <div class="list flat" id="sMine"></div>
      <button class="btn block" id="sNewFood">➕ ${T('Νέο τρόφιμο', 'New food')}</button>
      <p class="small muted">${T('Διόρθωση τροφίμου: πάτα το τρόφιμο όταν το προσθέτεις → «✏️ Διόρθωση». Συνδυασμό φτιάχνεις από την αρχική: «🍱 Συνδυασμός» δίπλα σε ένα γεύμα.', 'To edit a food: tap it when adding → “✏️ Edit food”. To make a combo: on the home screen tap “🍱 Combo” next to a meal.')}</p>
    </section>
    <section class="card">
      <h2>👤 ${T('Ο λογαριασμός μου', 'My account')}</h2>
      ${online()
        ? `<label class="field" style="margin-top:0"><span>${T('Το όνομά μου', 'My name')}${isAdmin() ? ' · 👑 ' + T('διαχειρίστρια', 'admin') : ''}</span><input id="sName" value="${esc(me()?.name || '')}" maxlength="30"></label>
           <p class="small muted">${T('Με αυτό το όνομα μπαίνεις και φαίνεται στις συνταγές και στα σχόλιά σου.', 'You sign in with this name and it shows on your recipes and comments.')}
             ${T('Όλα σώζονται στο Google Sheet «Food Desk»', 'Everything is saved to the “Food Desk” Google Sheet')}${queue.length ? ` · 📴 ${queue.length} ${T('αλλαγές περιμένουν internet', 'changes waiting for internet')}` : ' ✓'}</p>
           <div class="row2"><button class="btn" id="sPin">🔑 ${T('Αλλαγή κωδικού', 'Change password')}</button><button class="btn" id="sOut">${T('Αποσύνδεση', 'Log out')}</button></div>
           ${isAdmin() ? `<button class="btn block" id="sAdmin" style="margin-top:10px">👑 ${T('Διαχείριση λογαριασμών', 'Manage accounts')}${ui.pending ? ` <em class="tag">${ui.pending} ${T('νέα', 'new')}</em>` : ''}</button>` : ''}`
        : `<p class="small muted" style="margin-top:0">${T('Δοκιμαστική λειτουργία: όσα γράφεις μένουν μόνο σε αυτόν τον browser.', 'Demo mode: what you enter stays only in this browser.')}</p>
           <button class="btn" id="sOut">${T('Έξοδος από τη δοκιμή', 'Exit demo')}</button>`}
    </section>
    <section class="card">
      <h2>📚 ${T('Βάση', 'Database')}</h2>
      <p class="muted small" style="margin-top:0">${FOODS.length} ${T('τρόφιμα', 'foods')} · ${RECIPES.length} ${T('συνταγές', 'recipes')}</p>
      <button class="btn danger block" id="sReset">${T('Σβήσε όλες τις καταγραφές', 'Delete all entries')}</button>
    </section>`;
  const num = (id, key, min, max) => { $(id, v).onchange = e => { const n = parseInt(e.target.value, 10); if (n >= min && n <= max) { s[key] = n; save(); push('settings', settingsRows()); toast(T('Αποθηκεύτηκε ✓', 'Saved ✓')); } else e.target.value = s[key]; }; };
  $$('#sLang button', v).forEach(b => b.onclick = () => setLang(b.dataset.l));
  $('#sCalc', v).onclick = openGoalCalc;
  num('#sKcal', 'kcalGoal', 800, 6000);
  num('#sWater', 'waterGoal', 1, 30);
  const mine = [
    ...data.combos.map(c => `<button class="item" data-mc="${c.id}"><span class="ico">${c.icon}</span><span class="txt"><b>${esc(c.name)}</b><small>${T('Συνδυασμός', 'Combo')} · ${fmt(totals(c.items).kcal)} kcal</small></span></button>`),
    ...FOODS.filter(f => f.custom || f.edited).map(f => foodRow(f, 'data-mf')),
  ];
  $('#sMine', v).innerHTML = mine.length ? mine.join('') : `<div class="empty">${T('Δεν έχεις ακόμα δικά σου τρόφιμα ή συνδυασμούς.', "You don't have your own foods or combos yet.")}</div>`;
  $$('[data-mc]', v).forEach(b => b.onclick = () => { const c = data.combos.find(x => x.id === b.dataset.mc); saveCombo(null, null, c); });
  $$('[data-mf]', v).forEach(b => b.onclick = () => openFoodForm(foodById(+b.dataset.mf.split(':')[1])));
  $('#sNewFood', v).onclick = () => openFoodForm(null);
  const pinBtn = $('#sPin', v);
  if (pinBtn) pinBtn.onclick = () => openChangePin(false);
  const adm = $('#sAdmin', v);
  if (adm) adm.onclick = openAdmin;
  const nm = $('#sName', v);
  if (nm) nm.onchange = async () => {
    const name = nm.value.trim();
    if (name === me()?.name) return;
    try {
      const res = await api('rename', { name });
      cfg.me = res.me; store.set('food.cfg', cfg);
      const u = data.users.find(x => x.id === res.me.id); if (u) u.name = res.me.name;
      save(); toast(T('Το όνομα άλλαξε ✓', 'Name changed ✓'));
    } catch (e) { nm.value = me()?.name || ''; toast(errText(e.message)); }
  };
  $('#sOut', v).onclick = () => { if (confirm(online() ? T('Αποσύνδεση από αυτή τη συσκευή;', 'Log out on this device?') : T('Έξοδος από τη δοκιμή;', 'Exit the demo?'))) logout(); };
  $$('#sTheme button', v).forEach(b => b.onclick = () => { s.theme = b.dataset.t; save(); applyTheme(); render(); });
  $('#sReset', v).onclick = () => {
    if (!confirm(T('Να σβηστούν όλες οι καταγραφές φαγητού και νερού;', 'Delete all food and water entries?'))) return;
    drop('log', data.log.map(e => e.id)); drop('water', Object.keys(data.water));
    data.log = []; data.water = {}; save(); toast(T('Σβήστηκαν', 'Deleted')); render();
  };
}

function setLang(l) {
  LANG = l; store.set('food.lang', l);
  render();
  toast(T('Ελληνικά ✓', 'English ✓'));
}

function applyTheme() {
  const t = data.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* ---------- είσοδος / εγγραφή ---------- */
function renderLogin(v) {
  const up = ui.loginMode === 'up';
  v.innerHTML = `
    <div class="login">
      <div class="login-logo">🥗</div>
      <h1>Food Desk</h1>
      <p class="muted">${up ? T('Φτιάξε λογαριασμό · θα μπορείς να μπεις μόλις τον εγκρίνει η διαχειρίστρια', 'Create an account · you can sign in once the admin approves it') : T('Μπες με το όνομα και τον κωδικό σου', 'Sign in with your name and password')}</p>
      ${ui.signupDone ? `<div class="note">✅ ${T('Η αίτησή σου στάλθηκε! Μόλις την εγκρίνει η διαχειρίστρια, θα μπορείς να μπεις με το όνομα και τον κωδικό σου.', 'Your request was sent! Once the admin approves it, you can sign in with your name and password.')}</div>` : ''}
      <section class="card">
        <label class="field" style="margin-top:0"><span>${T('Όνομα', 'Name')}</span>
          <input id="lgName" autocomplete="username" maxlength="30" value="${esc(store.get('food.lastName', ''))}" placeholder="${T('π.χ. Μαρία', 'e.g. Maria')}"></label>
        <label class="field"><span>${T('Κωδικός', 'Password')}</span>
          <input id="lgPin" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" class="pin-input" placeholder="••••••"></label>
        ${up ? `<label class="field"><span>${T('Κωδικός ξανά', 'Password again')}</span><input id="lgPin2" type="password" autocomplete="new-password" class="pin-input" placeholder="••••••"></label>
          <p class="small muted" style="margin-top:-4px">${T('Τουλάχιστον 6 χαρακτήρες (αριθμοί ή γράμματα). Μην χρησιμοποιήσεις κωδικό που έχεις αλλού.', "At least 6 characters (numbers or letters). Don't reuse a password from elsewhere.")}</p>` : ''}
        <details class="adv" ${API_URL ? '' : 'open'}>
          <summary class="small muted">${T('Διεύθυνση σύνδεσης', 'Connection address')}</summary>
          <label class="field"><span>${T('URL του Apps Script', 'Apps Script URL')}</span>
            <input id="lgUrl" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(store.get('food.url', API_URL))}"></label>
        </details>
        <button class="btn primary block" id="lgGo">${up ? T('Αίτηση εγγραφής', 'Request an account') : T('Είσοδος', 'Sign in')}</button>
      </section>
      <button class="link-btn" id="lgMode">${up ? T('Έχω ήδη λογαριασμό · Είσοδος', 'I have an account · Sign in') : T('Δεν έχεις λογαριασμό; Εγγραφή', 'No account yet? Sign up')}</button>
      <div><button class="link-btn" id="lgDemo">${T('Δοκιμή με ψεύτικα δεδομένα', 'Try with sample data')}</button></div>
      <div><button class="link-btn" id="lgLang">${T('🇬🇧 English', '🇬🇷 Ελληνικά')}</button></div>
    </div>`;
  $('#lgLang', v).onclick = () => setLang(EN() ? 'el' : 'en');
  $('#lgMode', v).onclick = () => { ui.loginMode = up ? 'in' : 'up'; ui.signupDone = false; render(); };
  const name = $('#lgName', v), pin = $('#lgPin', v);
  setTimeout(() => (name.value ? pin : name).focus(), 60);
  let busy = false;
  const go = async () => {
    if (busy) return;
    const url = $('#lgUrl', v).value.trim(), n = name.value.trim(), p = pin.value;
    if (!url.startsWith('https://script.google.com/') && !url.startsWith('http://localhost')) return toast(T('Η διεύθυνση πρέπει να ξεκινάει με https://script.google.com/', 'The address must start with https://script.google.com/'));
    if (!n || !p) return toast(errText('Γράψε όνομα και κωδικό'));
    if (up) {
      if (p.length < 6) return toast(errText('Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες'));
      if (p !== $('#lgPin2', v).value) return toast(T('Οι δύο κωδικοί δεν ταιριάζουν', "The two passwords don't match"));
    }
    const btn = $('#lgGo', v), label = btn.textContent;
    busy = true; btn.disabled = true; btn.textContent = T('Περίμενε… ⏳', 'Please wait… ⏳');
    cfg = { url }; // προσωρινά, μόνο για την κλήση
    try {
      if (up) {
        await api('signup', { name: n, pin: p });
        cfg = null; store.set('food.lastName', n);
        ui.loginMode = 'in'; ui.signupDone = true; render();
        return;
      }
      const res = await api('login', { name: n, pin: p });
      cfg = { url, token: res.token, me: res.me };
      store.set('food.cfg', cfg); store.set('food.lastName', res.me.name); store.set('food.url', url);
    } catch (e) {
      cfg = null; busy = false; btn.disabled = false; btn.textContent = label;
      return toast(errText(e.message));
    }
    // Μέσα αμέσως· τα δεδομένα φορτώνουν στο παρασκήνιο (η Google μπορεί να αργήσει).
    queue = []; store.set('food.queue', []);
    data = freshData(); save(); rebuildCatalog();
    ui.tab = 'today'; ui.day = todayIso(); ui.signupDone = false; ui.pinAsked = false; render();
    toast(T(`Καλώς ήρθες, ${me().name}! 🥗 Φορτώνω τα δεδομένα σου…`, `Welcome, ${me().name}! 🥗 Loading your data…`));
    refresh().then(ok => { if (ok) toast(T('Όλα ενημερωμένα ✓', 'All up to date ✓')); });
  };
  $('#lgGo', v).onclick = go;
  $$('#lgName, #lgPin, #lgPin2', v).forEach(i => { i.onkeydown = e => { if (e.key === 'Enter') go(); }; });
  $('#lgDemo', v).onclick = () => {
    cfg = { url: 'demo', me: { id: 'demo', name: T('Εγώ', 'Me'), role: 'admin' } }; store.set('food.cfg', cfg);
    data = demoData(); save(); rebuildCatalog(); ui.tab = 'today'; ui.day = todayIso(); render();
  };
}

/** Αλλαγή κωδικού. forced: η πρώτη φορά της διαχειρίστριας (ο παλιός PIN είναι μικρός). */
function openChangePin(forced) {
  const min = isAdmin() ? 8 : 6;
  const body = openSheet(T('Αλλαγή κωδικού', 'Change password'));
  body.innerHTML = `
    ${forced ? `<div class="note">🔐 ${T('Είσαι η διαχειρίστρια, οπότε βάλε έναν νέο, μεγαλύτερο κωδικό (τουλάχιστον 8 χαρακτήρες). Ιδανικά μια φράση με γράμματα και αριθμούς, που δεν χρησιμοποιείς αλλού.', "You're the admin, so set a new, longer password (at least 8 characters). Ideally a phrase with letters and numbers that you don't use anywhere else.")}</div>` : ''}
    <label class="field"><span>${T('Τωρινός κωδικός', 'Current password')}</span><input id="cpOld" type="password" autocomplete="current-password"></label>
    <label class="field"><span>${T(`Νέος κωδικός (τουλάχιστον ${min} χαρακτήρες)`, `New password (at least ${min} characters)`)}</span><input id="cpNew" type="password" autocomplete="new-password"></label>
    <label class="field"><span>${T('Νέος κωδικός ξανά', 'New password again')}</span><input id="cpNew2" type="password" autocomplete="new-password"></label>
    <div class="actions">${forced ? '' : `<button class="btn" id="cpNo">${T('Άκυρο', 'Cancel')}</button>`}<button class="btn primary" id="cpOk">${T('Αλλαγή', 'Change')}</button></div>`;
  if (!forced) $('#cpNo', body).onclick = closeSheet;
  $('#cpOk', body).onclick = async () => {
    const o = $('#cpOld', body).value, a = $('#cpNew', body).value, b = $('#cpNew2', body).value;
    if (a.length < min) return toast(errText(min === 8 ? 'Ο κωδικός διαχειρίστριας θέλει τουλάχιστον 8 χαρακτήρες' : 'Ο κωδικός θέλει τουλάχιστον 6 χαρακτήρες'));
    if (a !== b) return toast(T('Οι δύο κωδικοί δεν ταιριάζουν', "The two passwords don't match"));
    try {
      const res = await api('changePin', { oldPin: o, newPin: a });
      cfg.me = res.me; store.set('food.cfg', cfg);
      closeSheet(); toast(T('Ο κωδικός άλλαξε ✓ · βγήκες από τις άλλες συσκευές', 'Password changed ✓ · signed out of your other devices'));
    } catch (e) { toast(errText(e.message)); }
  };
}

/* ---------- διαχείριση λογαριασμών (μόνο η διαχειρίστρια) ---------- */
async function openAdmin() {
  const body = openSheet(T('👑 Διαχείριση λογαριασμών', '👑 Manage accounts'));
  body.innerHTML = `<div class="empty">${T('Φόρτωση…', 'Loading…')} ⏳</div>`;
  let list;
  try { list = await api('users'); } catch (e) { body.innerHTML = `<div class="empty">${esc(errText(e.message))}</div>`; return; }
  const ACT = {
    pending: u => `<button class="mini-btn" data-act="active" data-u="${u.id}">✅ ${T('Έγκριση', 'Approve')}</button><button class="mini-btn" data-act="delete" data-u="${u.id}">❌ ${T('Απόρριψη', 'Reject')}</button>`,
    active: u => `<button class="mini-btn" data-act="disabled" data-u="${u.id}">⛔ ${T('Απενεργοποίηση', 'Disable')}</button>`,
    disabled: u => `<button class="mini-btn" data-act="active" data-u="${u.id}">↩️ ${T('Ενεργοποίηση', 'Enable')}</button><button class="mini-btn" data-act="delete" data-u="${u.id}">🗑 ${T('Διαγραφή', 'Delete')}</button>`,
  };
  const TITLES = { pending: T('⏳ Αιτήσεις', '⏳ Requests'), active: T('✅ Ενεργοί λογαριασμοί', '✅ Active accounts'), disabled: T('⛔ Απενεργοποιημένοι', '⛔ Disabled') };
  const draw = () => {
    body.innerHTML = `
      <p class="small muted" style="margin-top:0">${T('Στείλε στις φίλες σου το link του site. Πατάνε «Εγγραφή», και εδώ τις εγκρίνεις. Οι συνταγές και τα σχόλια είναι κοινά· καταγραφές, πρόγραμμα, βάρος κλπ. τα βλέπει μόνο η καθεμία για τον εαυτό της.', 'Send your friends the site link. They tap “Sign up” and you approve them here. Recipes and comments are shared; entries, plan, weight etc. are private to each person.')}</p>
      ${['pending', 'active', 'disabled'].map(s => {
        const xs = list.filter(u => u.status === s);
        if (s === 'disabled' && !xs.length) return '';
        return `<h3 class="section-label">${TITLES[s]} (${xs.length})</h3>
          ${xs.length ? `<div class="list">${xs.map(u => `<div class="item user-row"><span class="txt"><b>${esc(u.name)}${u.role === 'admin' ? ' 👑' : ''}${u.id === me()?.id ? T(' (εσύ)', ' (you)') : ''}</b><small>${T('από', 'since')} ${shortDate(u.created)}</small></span><span class="u-acts">${u.id === me()?.id ? '' : ACT[s](u)}</span></div>`).join('')}</div>`
            : `<div class="empty small">${s === 'pending' ? T('Καμία αίτηση σε αναμονή', 'No pending requests') : '—'}</div>`}`;
      }).join('')}`;
    $$('[data-act]', body).forEach(b => b.onclick = async () => {
      const u = list.find(x => x.id === b.dataset.u), act = b.dataset.act;
      if (act === 'delete' && !confirm(u.status === 'pending' ? T(`Απόρριψη της αίτησης «${u.name}»;`, `Reject “${u.name}”?`) : T(`Οριστική διαγραφή του λογαριασμού «${u.name}» και των προσωπικών της δεδομένων; (οι συνταγές και τα σχόλιά της μένουν)`, `Permanently delete “${u.name}” and her personal data? (her recipes and comments stay)`))) return;
      if (act === 'disabled' && !confirm(T(`Απενεργοποίηση της «${u.name}»; Θα βγει αμέσως από όλες τις συσκευές.`, `Disable “${u.name}”? She'll be signed out everywhere right away.`))) return;
      b.disabled = true;
      try {
        await api('setStatus', { id: u.id, status: act });
        if (act === 'delete') list = list.filter(x => x !== u); else u.status = act;
        toast(act === 'active' ? T(`✅ Η «${u.name}» μπορεί να μπει`, `✅ “${u.name}” can now sign in`) : act === 'disabled' ? T('⛔ Απενεργοποιήθηκε', '⛔ Disabled') : T('Διαγράφηκε', 'Deleted'));
        draw(); refresh();
      } catch (e) { b.disabled = false; toast(errText(e.message)); }
    });
  };
  draw();
}

/* ---------- sheet & toast ---------- */
function openSheet(title) {
  $('#sheetTitle').textContent = title;
  $('#overlay').classList.remove('hidden');
  const body = $('#sheetBody');
  body.innerHTML = '';
  $('.sheet').scrollTop = 0;
  return body;
}
function closeSheet() { $('#overlay').classList.add('hidden'); $('#sheetBody').innerHTML = ''; }
let toastT;
function toast(msg, undo) {
  const t = $('#toast');
  t.innerHTML = esc(msg) + (undo ? ` · <u style="cursor:pointer" id="tUndo">${T('Αναίρεση', 'Undo')}</u>` : '');
  t.style.pointerEvents = undo ? 'auto' : 'none';
  t.classList.add('show');
  if (undo) $('#tUndo').onclick = () => { t.classList.remove('show'); undo(); };
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), undo ? 4500 : 2200);
}

/* ---------- εκκίνηση ---------- */
/** Δοκιμαστικά δεδομένα: ένα παράδειγμα ημέρας για να φαίνεται πώς δουλεύει. */
function demoData() {
  const d = freshData();
  d.settings.theme = data?.settings?.theme || 'light';
  const demo = [['breakfast', 'Cappuccino γλυκός'], ['breakfast', 'Τοστ ζαμπόν-τυρί'], ['snack', 'Γιαούρτι στραγγιστό 2%']];
  for (const [meal, name] of demo) {
    const food = BASE_FOODS.find(x => x.name === name); if (!food) continue;
    const p = food.portions[0], n = nutrFor(food, p.g);
    d.log.push({ id: newId(), date: todayIso(), meal, kind: 'food', ref: food.id, name, qty: 1, unit: p.name, g: p.g,
      kcal: Math.round(n.kcal), p: Math.round(n.p * 10) / 10, c: Math.round(n.c * 10) / 10, f: Math.round(n.f * 10) / 10 });
  }
  d.water[todayIso()] = 3;
  return d;
}

async function init() {
  const [f, r, i18n] = await Promise.all(['data/foods.json', 'data/recipes.json', 'data/i18n.json'].map(u => fetch(u).then(x => x.json())));
  BASE_FOODS = f; BASE_RECIPES = r; FOODS = f; I18N = i18n;
  data = data ? migrate(data) : freshData();
  rebuildCatalog();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  $$('.tabbar [data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; if (ui.tab === 'today') ui.day = todayIso(); if (ui.tab === 'plan') ui.planDay = null; render(); scrollTo(0, 0); });
  $('#addBtn').onclick = () => openAdd(mealByTime(), ui.tab === 'today' ? ui.day : todayIso());
  $('#sheetClose').onclick = closeSheet;
  $('#settingsBtn').onclick = () => { ui.tab = 'settings'; render(); scrollTo(0, 0); };
  $('#overlay').onclick = e => { if (e.target.id === 'overlay') closeSheet(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#refreshBtn').onclick = async () => { if (await refresh()) toast(T('Ενημερώθηκε ✓', 'Updated ✓')); };
  $('#pending').onclick = () => { flush(); toast(T('Προσπαθώ να τα στείλω…', 'Trying to send…')); };
  // Μόλις γυρίσει το internet ή ξανανοίξεις το site, στέλνονται όσα περιμένουν.
  addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && online()) refresh(); });
  setInterval(() => { if (queue.length) flush(); }, 30000);
  render();                      // αμέσως με ό,τι υπάρχει στη συσκευή…
  if (online()) refresh();       // …και μετά φρέσκα από το Sheet
}
init();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js');
