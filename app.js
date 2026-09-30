'use strict';

/* ============ Food Desk ============
 * Προς το παρόν όλα τα δεδομένα μένουν στον browser (localStorage).
 * Όταν στήσουμε το Google Sheet, το store θα μιλάει με το Apps Script όπως στο Household Desk.
 */

const MEALS = [
  { key: 'breakfast', name: 'Πρωινό', icon: '☀️' },
  { key: 'lunch', name: 'Μεσημεριανό', icon: '🍽️' },
  { key: 'dinner', name: 'Βραδινό', icon: '🌙' },
  { key: 'snack', name: 'Σνακ', icon: '🍎' },
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
const fmt = n => Math.round(n).toLocaleString('el-GR');
const fmtQty = n => String(Math.round(n * 100) / 100).replace('.', ',');
// 0,5 → ½ · 1,5 → 1½ (για τις συνταγές).
const frac = n => { const w = Math.floor(n), h = Math.round((n - w) * 2) === 1; return h ? (w ? `${w}½` : '½') : String(Math.round(n)); };
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
// Αναζήτηση χωρίς τόνους/κεφαλαία: «φετα» βρίσκει «Φέτα».
const fold = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ');

function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayIso() { return isoDate(new Date()); }
function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); return isoDate(new Date(y, m - 1, d + n)); }
function dayTitle(iso) {
  if (iso === todayIso()) return 'Σήμερα';
  if (iso === addDays(todayIso(), -1)) return 'Χθες';
  const [y, m, d] = iso.split('-').map(Number);
  const wd = new Date(y, m - 1, d).toLocaleDateString('el-GR', { weekday: 'long' });
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
    settings: { kcalGoal: 1800, waterGoal: 8, theme: 'light' },
    log: [],          // { id, date, meal, kind: food|recipe|quick, ref, name, qty, unit, g, kcal, p, c, f }
    water: {},        // { 'YYYY-MM-DD': ποτήρια }
    favs: [],         // 'food:12' / 'recipe:3'
    combos: [],       // { id, name, icon, items: [ίδια μορφή με log, χωρίς id/date/meal] }
    customFoods: [], foodEdits: {}, hiddenFoods: [],
    customRecipes: [], recipeEdits: {}, hiddenRecipes: [],
  };
}
// Παλιά αποθηκευμένα δεδομένα: συμπληρώνουμε ό,τι λείπει.
function migrate(d) {
  const f = freshData();
  for (const k in f) if (d[k] === undefined) d[k] = f[k];
  return d;
}
function nextCustomId(list) { return Math.max(CUSTOM_ID - 1, ...list.map(x => x.id)) + 1; }

function rebuildCatalog() {
  const hiddenF = new Set(data.hiddenFoods);
  FOODS = BASE_FOODS.filter(f => !hiddenF.has(f.id))
    .map(f => data.foodEdits[f.id] ? { ...f, ...data.foodEdits[f.id], edited: true } : f)
    .concat(data.customFoods.map(f => ({ ...f, custom: true })));
  const hiddenR = new Set(data.hiddenRecipes);
  RECIPES = BASE_RECIPES.filter(r => !hiddenR.has(r.id))
    .map(r => data.recipeEdits[r.id] ? { ...data.recipeEdits[r.id], id: r.id, edited: true } : r)
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
let cfg = store.get('food.cfg', null);           // { url, pin } · url === 'demo' = δοκιμή χωρίς Sheet
let queue = store.get('food.queue', []);         // [{ action: put|del, sheet, rows|ids }]
const online = () => cfg && cfg.url && cfg.url !== 'demo';

async function api(action, payload = {}, tries = action === 'all' ? 3 : 1) {
  for (let i = 1; ; i++) {
    try { return await apiOnce(action, payload); } catch (e) {
      if (i >= tries || e.message === 'Λάθος PIN') throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
async function apiOnce(action, payload) {
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), 90000);
  let res;
  try {
    // text/plain: το Apps Script δεν δέχεται «preflight» αιτήματα.
    res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ pin: cfg.pin, action, ...payload }), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, signal: ctrl.signal });
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
        if (e.message === 'Λάθος PIN') { logout(); break; }
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
  el.title = 'Δεν στάλθηκαν ακόμα στο Sheet · θα σταλούν μόλις υπάρξει internet';
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
  return { id, name: f.name, cat: f.cat, kcal: f.kcal, p: f.p, c: f.c, f: f.f, use: f.use, portions: portionsText(f.portions),
    origin: custom ? 'δικό μου' : data.foodEdits[id] ? 'διορθωμένο' : 'βάση', hidden: data.hiddenFoods.includes(id) };
}
function recipeRowOut(id) {
  const base = BASE_RECIPES.find(r => r.id === id), custom = data.customRecipes.find(r => r.id === id);
  const r = custom || data.recipeEdits[id] || base;
  if (!r) return null;
  return { id, name: r.name, icon: r.icon, cat: r.cat, servings: r.servings, itemsText: itemsText(r.items), steps: r.steps.join('\n'), notes: r.notes.join('\n'),
    origin: custom ? 'δική μου' : data.recipeEdits[id] ? 'αλλαγμένη' : 'βάση', hidden: data.hiddenRecipes.includes(id),
    items: JSON.stringify(r.items.map(({ food, name, qty, unit, g }) => ({ food, name, qty, unit, g }))) };
}
const comboRowOut = c => ({ id: c.id, name: c.name, icon: c.icon, itemsText: c.items.map(e => `${e.name} (${fmt(e.kcal)} kcal)`).join('\n'), items: JSON.stringify(c.items) });
const settingsRows = () => ['kcalGoal', 'waterGoal'].map(k => ({ id: k, value: String(data.settings[k]) }));
const boolOf = v => v === true || String(v).toUpperCase() === 'TRUE';
const numOf = v => typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.')) || 0;

/** Φτιάχνει τα δεδομένα του site από αυτά που γύρισε το Sheet. */
function fromSheet(all) {
  const d = freshData();
  d.settings.theme = data?.settings?.theme || 'light';
  for (const r of all.settings) if (r.id in d.settings && r.id !== 'theme') d.settings[r.id] = numOf(r.value) || d.settings[r.id];
  d.log = all.log.map(r => ({ id: String(r.id), date: String(r.date), meal: r.meal, kind: r.kind, ref: r.kind === 'quick' ? null : numOf(r.ref),
    name: String(r.name), qty: numOf(r.qty), unit: String(r.unit), g: numOf(r.g), kcal: numOf(r.kcal), p: numOf(r.p), c: numOf(r.c), f: numOf(r.f) }));
  for (const r of all.water) d.water[String(r.id)] = numOf(r.glasses);
  d.favs = all.favs.map(r => String(r.id));
  d.combos = all.combos.map(r => { try { return { id: String(r.id), name: String(r.name), icon: String(r.icon), items: JSON.parse(r.items) }; } catch { return null; } }).filter(Boolean);
  // Τρόφιμα: ό,τι διαφέρει από τη βάση μετράει ως διόρθωση (ακόμα κι αν άλλαξες κάτι απευθείας στο Sheet).
  for (const r of all.foods) {
    const id = numOf(r.id);
    const f = { name: String(r.name), cat: String(r.cat), kcal: numOf(r.kcal), p: numOf(r.p), c: numOf(r.c), f: numOf(r.f), use: String(r.use || 'Φ'), portions: parsePortions(r.portions) };
    if (!f.portions.length) f.portions = [{ name: 'μερίδα', g: 100, piece: true }];
    if (boolOf(r.hidden)) d.hiddenFoods.push(id);
    const base = BASE_FOODS.find(x => x.id === id);
    if (id >= CUSTOM_ID || !base) d.customFoods.push({ id, ...f });
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
    const rec = { name: String(r.name), icon: String(r.icon), cat: String(r.cat), servings: numOf(r.servings) || 1, items, steps: lines(r.steps), notes: lines(r.notes) };
    if (id >= CUSTOM_ID || !base) d.customRecipes.push({ id, ...rec });
    else if (String(r.origin) === 'αλλαγμένη' || ['name', 'icon', 'cat', 'servings'].some(k => String(rec[k]) !== String(base[k])) || rec.steps.join('\n') !== base.steps.join('\n') || rec.notes.join('\n') !== base.notes.join('\n')) d.recipeEdits[id] = rec;
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
    toast(`Πρώτη φορά: στήνω το Sheet σου… ${label} ${Math.min(i + 150, rows.length)}/${rows.length} ⏳`);
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
    if (counts.foods < BASE_FOODS.length || counts.recipes < BASE_RECIPES.length || !all.settings.length) {
      // Σε κομμάτια (put = upsert), ώστε ένα διακοπτόμενο γέμισμα να συνεχίζει από εκεί που έμεινε.
      // put = upsert: ό,τι υπάρχει ήδη απλά ξαναγράφεται ίδιο, οπότε ένα διακοπτόμενο γέμισμα συνεχίζει με ασφάλεια.
      if (counts.foods < BASE_FOODS.length) await seedInChunks('foods', BASE_FOODS.slice(Math.max(0, counts.foods - 5)).map(f => foodRowOut(f.id)), 'τρόφιμα');
      if (counts.recipes < BASE_RECIPES.length) await seedInChunks('recipes', BASE_RECIPES.map(r => recipeRowOut(r.id)), 'συνταγές');
      if (!all.settings.length) await api('put', { sheet: 'settings', rows: settingsRows() });
      all = await api('all');
    }
    data = fromSheet(all);
    save(); rebuildCatalog(); render();
    return true;
  } catch (e) {
    if (e.message === 'Λάθος PIN') { logout(); toast('Λάθος PIN'); }
    else toast(e.message === 'Δεν υπάρχει σύνδεση' ? '📴 Χωρίς internet · βλέπεις τα τελευταία δεδομένα' : e.message);
    return false;
  } finally { document.body.classList.remove('busy'); }
}
function logout() {
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
  const v = $('#view');
  ({ today: renderToday, recipes: renderRecipes, plan: renderPlan, settings: renderSettings })[ui.tab](v);
}

function ring(eaten, goal) {
  const r = 64, C = 2 * Math.PI * r;
  const frac = goal > 0 ? Math.min(eaten / goal, 1) : 0;
  const cls = statusOf(eaten, goal);
  const color = { ok: 'var(--ok)', near: 'var(--near)', over: 'var(--over)' }[cls];
  return `<div class="ring" role="img" aria-label="${fmt(eaten)} από ${fmt(goal)} θερμίδες">
    <svg viewBox="0 0 150 150"><circle class="track" cx="75" cy="75" r="${r}" stroke-width="13"/>
      <circle class="val" cx="75" cy="75" r="${r}" stroke-width="13" stroke="${color}" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - frac)}"/></svg>
    <div class="ring-center"><b>${fmt(eaten)}</b><span>από ${fmt(goal)} kcal</span></div>
  </div>`;
}
function statusOf(eaten, goal) { return eaten > goal ? 'over' : eaten >= goal * 0.9 ? 'near' : 'ok'; }

function renderToday(v) {
  const day = ui.day, entries = dayEntries(day), t = totals(entries);
  const goal = data.settings.kcalGoal, left = goal - t.kcal, st = statusOf(t.kcal, goal);
  const statusText = st === 'over' ? `Πέρασες τον στόχο κατά ${fmt(-left)} kcal` : `Σου μένουν ${fmt(left)} kcal`;
  const glasses = data.water[day] || 0, wGoal = data.settings.waterGoal;
  const isToday = day === todayIso();

  v.innerHTML = `
    <div class="daynav">
      <button class="icon-btn" id="dPrev" aria-label="Προηγούμενη μέρα"><svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h2>${dayTitle(day)}</h2>
      <button class="icon-btn" id="dNext" aria-label="Επόμενη μέρα" ${isToday ? 'disabled' : ''}><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
    </div>
    <section class="card">
      <div class="hero">
        ${ring(t.kcal, goal)}
        <div class="hero-info">
          <p class="hero-status ${st}">${statusText}</p>
          <div class="muted small">${fmt(t.kcal)} / ${fmt(goal)} θερμίδες ${isToday ? 'για σήμερα' : ''}</div>
          <div class="macros">
            <div class="macro"><b>${fmt(t.p)}γρ.</b><span>Πρωτεΐνη</span></div>
            <div class="macro"><b>${fmt(t.c)}γρ.</b><span>Υδατάνθ.</span></div>
            <div class="macro"><b>${fmt(t.f)}γρ.</b><span>Λιπαρά</span></div>
          </div>
        </div>
      </div>
    </section>
    <section class="card">
      <div class="water">
        <div><b>💧 Νερό</b><div class="muted small">${glasses} / ${wGoal} ποτήρια · ${(glasses * GLASS_ML / 1000).toLocaleString('el-GR')} λίτρα</div></div>
        <button class="btn small" id="wMinus" aria-label="Ένα ποτήρι λιγότερο" ${glasses ? '' : 'disabled'}>−</button>
        <button class="btn small primary" id="wPlus">+ ποτήρι</button>
      </div>
      <div class="water-glasses" style="margin-top:10px">${Array.from({ length: Math.max(wGoal, glasses) }, (_, i) => `<button class="glass ${i < glasses ? 'full' : ''}" data-g="${i + 1}" aria-label="${i + 1} ποτήρια"></button>`).join('')}</div>
    </section>
    ${MEALS.map(m => {
      const es = entries.filter(e => e.meal === m.key), mt = totals(es);
      const prev = es.length ? [] : dayEntries(addDays(day, -1)).filter(e => e.meal === m.key);
      return `<section class="meal">
        <div class="meal-head"><h3>${m.icon} ${m.name}</h3><span>${es.length ? fmt(mt.kcal) + ' kcal' : ''}
          ${es.length ? `<button class="mini-btn" data-combo="${m.key}" title="Αποθήκευσε ως συνδυασμό">🍱 Συνδυασμός</button>` : ''}</span></div>
        ${es.length ? `<div class="list">${es.map(entryRow).join('')}</div>` : ''}
        <div class="meal-actions" style="margin-top:${es.length ? 8 : 0}px">
          <button class="add-meal" data-meal="${m.key}">+ Πρόσθεσε στο ${m.name.toLowerCase()}</button>
          ${prev.length ? `<button class="add-meal again" data-again="${m.key}">🔁 Όπως χθες · ${fmt(totals(prev).kcal)} kcal</button>` : ''}
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
    addItems(prev, b.dataset.again, day, `Όπως χθες: +${fmt(totals(prev).kcal)} kcal ✓`);
  });
  $$('[data-combo]', v).forEach(b => b.onclick = () => saveCombo(entries.filter(e => e.meal === b.dataset.combo), b.dataset.combo));
  $$('[data-entry]', v).forEach(b => b.onclick = () => openEntry(data.log.find(e => e.id === b.dataset.entry)));
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
  const body = openSheet(combo ? 'Συνδυασμός' : 'Νέος συνδυασμός');
  const st = { icon: combo?.icon || MEALS.find(m => m.key === meal)?.icon || '⭐' };
  const items = combo ? combo.items : entries.map(({ id, date, meal: _m, ...rest }) => rest);
  body.innerHTML = `
    <p class="muted small" style="margin-top:4px">Με ένα πάτημα θα προσθέτεις όλα αυτά μαζί.</p>
    <div class="list">${items.map(e => `<div class="item"><span class="ico">${entryIcon(e)}</span><span class="txt"><b>${esc(e.name)}</b><small>${esc(e.kind === 'quick' ? 'στο περίπου' : qtyLabel(e))}</small></span><span class="kcal">${fmt(e.kcal)} <small>kcal</small></span></div>`).join('')}</div>
    <label class="field"><span>Όνομα</span><input id="cName" value="${esc(combo?.name || '')}" placeholder="π.χ. Το πρωινό μου"></label>
    <div class="chips" id="cIcons">${COMBO_ICONS.map(i => `<button class="chip emoji-chip" data-i="${i}">${i}</button>`).join('')}</div>
    <div class="actions">${combo ? '<button class="btn danger" id="cDel">Διαγραφή</button>' : ''}<button class="btn primary" id="cSave">Αποθήκευση · ${fmt(totals(items).kcal)} kcal</button></div>`;
  const drawIcons = () => $$('#cIcons .chip', body).forEach(b => b.classList.toggle('on', b.dataset.i === st.icon));
  $$('#cIcons .chip', body).forEach(b => b.onclick = () => { st.icon = b.dataset.i; drawIcons(); });
  drawIcons();
  $('#cSave', body).onclick = () => {
    const name = $('#cName', body).value.trim();
    if (!name) return toast('Δώσε ένα όνομα');
    const c = combo ? Object.assign(combo, { name, icon: st.icon }) : { id: newId(), name, icon: st.icon, items };
    if (!combo) data.combos.push(c);
    push('combos', [comboRowOut(c)]);
    save(); closeSheet(); render(); toast('Ο συνδυασμός αποθηκεύτηκε ✓');
  };
  if (combo) $('#cDel', body).onclick = () => {
    data.combos = data.combos.filter(c => c !== combo); save(); drop('combos', [combo.id]); closeSheet(); render();
    toast('Διαγράφηκε', () => { data.combos.push(combo); save(); push('combos', [comboRowOut(combo)]); render(); });
  };
  setTimeout(() => $('#cName', body).focus(), 80);
}

function entryIcon(e) {
  if (e.kind === 'recipe') return recipeById(e.ref)?.icon || '🍲';
  if (e.kind === 'quick') return '✍️';
  return CAT_ICONS[foodById(e.ref)?.cat] || '🍴';
}
function qtyLabel(e) {
  if (e.unit === 'γρ') return `${fmt(e.g)} γρ.`;
  if (e.kind === 'recipe') return `${fmtQty(e.qty)} ${e.qty === 1 ? 'μερίδα' : 'μερίδες'}`;
  return e.qty === 1 ? e.unit : `${fmtQty(e.qty)} × ${e.unit}`;
}
function entryRow(e) {
  return `<button class="item" data-entry="${e.id}">
    <span class="ico">${entryIcon(e)}</span>
    <span class="txt"><b>${esc(e.name)}</b><small>${e.kind === 'quick' ? 'στο περίπου' : esc(qtyLabel(e))}</small></span>
    <span class="kcal">${fmt(e.kcal)} <small>kcal</small></span>
  </button>`;
}

/* ---------- προσθήκη φαγητού ---------- */
function openAdd(meal = mealByTime(), day = ui.day) {
  const body = openSheet('Τι έφαγες;');
  const st = { meal, q: '', cat: null };
  body.innerHTML = `
    <div class="seg" id="aMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${m.name}</button>`).join('')}</div>
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      <input id="aQ" type="search" placeholder="Ψάξε, π.χ. φέτα, τοστ, καπουτσίνο…" autocomplete="off"></label>
    <div class="chips scroll" id="aCats"></div>
    <div class="results" id="aRes"></div>
    <div class="row2" style="margin-top:14px">
      <button class="btn" id="aQuick">✍️ Στο περίπου</button>
      <button class="btn" id="aNew">➕ Νέο τρόφιμο</button>
    </div>`;

  const cats = ['⭐ Για σένα', '📖 Συνταγές', ...Object.keys(CAT_ICONS)];
  $('#aCats', body).innerHTML = cats.map((c, i) => `<button class="chip" data-c="${i}">${i > 1 ? CAT_ICONS[c] + ' ' : ''}${esc(c)}</button>`).join('');
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
      const match = name => { const n = fold(name); return words.every(w => n.includes(w)); };
      const recs = RECIPES.filter(r => match(r.name)).slice(0, 8);
      // Πρώτα όσα ξεκινάνε με τη λέξη, μετά τα υπόλοιπα.
      const foods = FOODS.filter(f => f.use !== 'Υ' && match(f.name))
        .sort((a, b) => (fold(b.name).startsWith(words[0]) - fold(a.name).startsWith(words[0])) || a.name.length - b.name.length).slice(0, 40);
      if (recs.length) html += `<div class="section-label">Οι συνταγές σου</div><div class="list">${recs.map(recRow).join('')}</div>`;
      if (foods.length) html += `<div class="section-label">Τρόφιμα</div><div class="list">${foods.map(foodRow).join('')}</div>`;
      if (!html) html = `<div class="empty">Δεν βρέθηκε «${esc(st.q)}».<br>Γράψ' το στο περίπου από κάτω 👇</div>`;
    } else if (st.cat === 0) {
      const rowOf = key => { const [k, id] = key.split(':'); const x = k === 'recipe' ? recipeById(+id) : foodById(+id); return x ? (k === 'recipe' ? recRow(x) : foodRow(x)) : ''; };
      const favs = data.favs.map(rowOf).filter(Boolean);
      const rec = recentItems().filter(r => !isFav(r.key)).map(r => rowOf(r.key)).filter(Boolean);
      if (data.combos.length) html += `<div class="section-label">🍱 Συνδυασμοί · ένα πάτημα</div><div class="combo-grid">${data.combos.map(c =>
        `<button class="combo" data-cb="${c.id}"><span>${c.icon}</span><b>${esc(c.name)}</b><small>${fmt(totals(c.items).kcal)} kcal</small></button>`).join('')}</div>`;
      if (favs.length) html += `<div class="section-label">⭐ Αγαπημένα</div><div class="list">${favs.join('')}</div>`;
      if (rec.length) html += `<div class="section-label">🕒 Πρόσφατα</div><div class="list">${rec.join('')}</div>`;
      if (!html) html = `<div class="empty">Εδώ θα βλέπεις τα αγαπημένα σου ⭐, ό,τι γράφεις συχνά και τους συνδυασμούς σου 🍱.<br>Ψάξε κάτι από πάνω ή διάλεξε κατηγορία.</div>`;
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
    <span class="txt"><b>${esc(f.name)}${isFav('food:' + f.id) ? ' ⭐' : ''}${f.custom ? ' <em class="tag">δικό μου</em>' : f.edited ? ' <em class="tag">διορθωμένο</em>' : ''}</b><small>${esc(p.name)} · ${fmt(f.kcal * p.g / 100)} kcal</small></span></button>`;
}
function recRow(r) {
  return `<button class="item" data-pick="recipe:${r.id}"><span class="ico">${r.icon}</span>
    <span class="txt"><b>${esc(r.name)}${isFav('recipe:' + r.id) ? ' ⭐' : ''}</b><small>1 μερίδα · ${fmt(r.perServing.kcal)} kcal</small></span></button>`;
}

/** Επιλογή ποσότητας: μερίδα (μικρό/μεσαίο/…) ή γραμμάρια, με ζωντανό υπολογισμό θερμίδων. */
function openPortion({ food, recipe, meal, day, entry }) {
  const isRec = !!recipe;
  const units = isRec ? [{ name: 'μερίδα', g: null }] : [...food.portions.map(p => ({ name: p.name, g: p.g })), { name: 'γρ', g: 1 }];
  const st = entry
    ? { unit: Math.max(0, units.findIndex(u => u.name === entry.unit)), qty: entry.qty, meal: entry.meal }
    : { unit: 0, qty: 1, meal };
  const body = openSheet(isRec ? `${recipe.icon} ${recipe.name}` : food.name);
  const favKey = isRec ? `recipe:${recipe.id}` : `food:${food.id}`;
  body.innerHTML = `
    <div class="sheet-tools">
      <button class="mini-btn" id="pFav">${isFav(favKey) ? '⭐ Στα αγαπημένα' : '☆ Αγαπημένο'}</button>
      ${isRec ? '' : `<button class="mini-btn" id="pEdit">✏️ Διόρθωση τροφίμου</button>`}
    </div>
    ${units.length > 1 ? `<div class="chips" id="pUnits">${units.map((u, i) => `<button class="chip" data-u="${i}">${u.name === 'γρ' ? 'γραμμάρια' : esc(u.name)}${u.g && u.name !== 'γρ' ? `<small>${u.g}γρ.</small>` : ''}</button>`).join('')}</div>` : ''}
    <div class="stepper"><button id="pMinus" aria-label="Λιγότερο">−</button><input id="pQty" inputmode="decimal"><span class="unit" id="pUnit"></span><button id="pPlus" aria-label="Περισσότερο">+</button></div>
    <div class="portion-kcal"><b id="pKcal">0</b> <span>kcal</span></div>
    <div class="macros" id="pMac"></div>
    <label class="field"><span>Γεύμα</span><div class="seg" id="pMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${m.name}</button>`).join('')}</div></label>
    ${isRec ? `<button class="btn block" id="pRec">📖 Δες τη συνταγή</button>` : ''}
    <div class="actions">
      ${entry ? '<button class="btn danger" id="pDel">Διαγραφή</button>' : ''}
      <button class="btn primary" id="pSave">${entry ? 'Αποθήκευση' : 'Πρόσθεσε'}</button>
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
    $('#pUnit', body).textContent = u.name === 'γρ' ? 'γρ.' : st.qty === 1 ? '' : '×';
    const n = calc();
    $('#pKcal', body).textContent = fmt(n.kcal);
    $('#pMac', body).innerHTML = `<div class="macro"><b>${fmt(n.p)}γρ.</b><span>Πρωτεΐνη</span></div><div class="macro"><b>${fmt(n.c)}γρ.</b><span>Υδατάνθ.</span></div><div class="macro"><b>${fmt(n.f)}γρ.</b><span>Λιπαρά</span></div>`;
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
  $('#pFav', body).onclick = e => { toggleFav(favKey); e.target.textContent = isFav(favKey) ? '⭐ Στα αγαπημένα' : '☆ Αγαπημένο'; };
  if (!isRec) $('#pEdit', body).onclick = () => openFoodForm(food, { after: f => openPortion({ food: f, meal: st.meal, day, entry }) });
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
    toast(entry ? 'Αποθηκεύτηκε ✓' : `+${fmt(e.kcal)} kcal ✓`);
  };
  if (entry) $('#pDel', body).onclick = () => deleteEntry(entry);
  draw();
}

function openQuick({ meal, day, entry, name = '' }) {
  const body = openSheet(entry ? 'Στο περίπου' : 'Γράψε το στο περίπου');
  const st = { meal: entry?.meal || meal };
  body.innerHTML = `
    <label class="field"><span>Τι έφαγες</span><input id="qName" value="${esc(entry?.name || name)}" placeholder="π.χ. Φαγητό έξω, κομμάτι τούρτα…"></label>
    <label class="field"><span>Θερμίδες (περίπου)</span><input id="qKcal" inputmode="numeric" value="${entry ? entry.kcal : ''}" placeholder="π.χ. 600"></label>
    <div class="chips">${[100, 200, 300, 500, 800, 1000].map(k => `<button class="chip" data-k="${k}">~${k}</button>`).join('')}</div>
    <label class="field"><span>Γεύμα</span><div class="seg" id="qMeal">${MEALS.map(m => `<button data-m="${m.key}">${m.icon} ${m.name}</button>`).join('')}</div></label>
    <div class="actions">${entry ? '<button class="btn danger" id="qDel">Διαγραφή</button>' : ''}<button class="btn primary" id="qSave">${entry ? 'Αποθήκευση' : 'Πρόσθεσε'}</button></div>`;
  const drawMeal = () => $$('#qMeal button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.meal));
  $$('#qMeal button', body).forEach(b => b.onclick = () => { st.meal = b.dataset.m; drawMeal(); });
  drawMeal();
  $$('[data-k]', body).forEach(b => b.onclick = () => { $('#qKcal', body).value = b.dataset.k; });
  $('#qSave', body).onclick = () => {
    const kcal = parseInt($('#qKcal', body).value, 10);
    if (!(kcal >= 0)) return toast('Γράψε θερμίδες');
    const e = { id: entry?.id || newId(), date: entry?.date || day, meal: st.meal, kind: 'quick', ref: null,
      name: $('#qName', body).value.trim() || 'Φαγητό', qty: 1, unit: '', g: 0, kcal, p: 0, c: 0, f: 0 };
    if (entry) Object.assign(entry, e); else data.log.push(e);
    push('log', [e]);
    save(); closeSheet(); ui.tab = 'today'; ui.day = e.date; render(); toast('Αποθηκεύτηκε ✓');
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
  toast('Διαγράφηκε', () => { data.log.push(e); save(); push('log', [e]); render(); });
}

/* ---------- δικά μου τρόφιμα / διόρθωση ---------- */
const USE_LABELS = [['Φ', 'Το τρώω έτσι'], ['ΦΥ', 'Και τα δύο'], ['Υ', 'Μόνο υλικό συνταγής']];
/**
 * Νέο τρόφιμο ή διόρθωση. Οι θερμίδες γράφονται είτε ανά 100γρ. είτε «ανά μερίδα»
 * (π.χ. από τη συσκευασία: «1 μπάρα 45γρ. = 190 kcal») και μετατρέπονται.
 */
function openFoodForm(food, { name = '', after } = {}) {
  const base = food ? BASE_FOODS.find(f => f.id === food.id) : null;
  const st = {
    mode: '100',
    use: food?.use || 'Φ',
    portions: food ? food.portions.map(p => ({ ...p })) : [{ name: 'μερίδα', g: 100, piece: true }],
  };
  const body = openSheet(food ? 'Διόρθωση τροφίμου' : 'Νέο τρόφιμο');
  const cats = [...new Set([...Object.keys(CAT_ICONS), ...FOODS.map(f => f.cat)])];
  body.innerHTML = `
    <label class="field"><span>Όνομα</span><input id="fName" value="${esc(food?.name || name)}" placeholder="π.χ. Μπάρα πρωτεΐνης Χ"></label>
    <label class="field"><span>Κατηγορία</span><select id="fCat">${cats.map(c => `<option ${c === (food?.cat || 'Γλυκά & σνακ') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label class="field"><span>Μερίδες</span></label>
    <div id="fPortions"></div>
    <button class="mini-btn" id="fAddP" style="margin-top:6px">+ άλλη μερίδα</button>
    <label class="field"><span>Θερμίδες & θρεπτικά γράφω</span><div class="seg" id="fMode"><button data-m="100">ανά 100 γρ.</button><button data-m="p">ανά 1η μερίδα</button></div></label>
    <div class="row2">
      <label class="field"><span id="fKcalL">Θερμίδες</span><input id="fKcal" inputmode="decimal"></label>
      <label class="field"><span>Πρωτεΐνη (γρ.)</span><input id="fP" inputmode="decimal"></label>
      <label class="field"><span>Υδατάνθρακες (γρ.)</span><input id="fC" inputmode="decimal"></label>
      <label class="field"><span>Λιπαρά (γρ.)</span><input id="fF" inputmode="decimal"></label>
    </div>
    <p class="small muted" style="margin-top:-6px">Αν δεν τα ξέρεις, γράψε μόνο θερμίδες.</p>
    <label class="field"><span>Πού το χρησιμοποιώ</span><div class="seg" id="fUse">${USE_LABELS.map(([k, l]) => `<button data-u="${k}">${l}</button>`).join('')}</div></label>
    <div class="actions">
      ${food ? (food.custom ? '<button class="btn danger" id="fDel">Διαγραφή</button>' : food.edited ? '<button class="btn" id="fReset">↺ Αρχικές τιμές</button>' : '<button class="btn danger" id="fDel">Απόκρυψη</button>') : ''}
      <button class="btn primary" id="fSave">Αποθήκευση</button>
    </div>`;
  const nums = ['fKcal', 'fP', 'fC', 'fF'].map(id => $('#' + id, body));
  const setNums = vals => nums.forEach((inp, i) => { inp.value = vals[i] ? String(Math.round(vals[i] * 10) / 10).replace('.', ',') : ''; });
  const readNums = () => nums.map(inp => parseFloat(inp.value.replace(',', '.')) || 0);
  if (food) setNums([food.kcal, food.p, food.c, food.f]);

  const drawPortions = () => {
    $('#fPortions', body).innerHTML = st.portions.map((p, i) => `
      <div class="portion-row">
        <input data-pn="${i}" value="${esc(p.name)}" placeholder="π.χ. 1 μπάρα">
        <input data-pg="${i}" value="${p.g}" inputmode="decimal" aria-label="γραμμάρια"><span class="muted small">γρ.</span>
        ${st.portions.length > 1 ? `<button class="icon-btn" data-px="${i}" aria-label="Αφαίρεση">✕</button>` : ''}
      </div>`).join('');
    $$('[data-pn]', body).forEach(inp => inp.oninput = () => { st.portions[+inp.dataset.pn].name = inp.value; });
    $$('[data-pg]', body).forEach(inp => inp.oninput = () => { st.portions[+inp.dataset.pg].g = parseFloat(inp.value.replace(',', '.')) || 0; });
    $$('[data-px]', body).forEach(b => b.onclick = () => { st.portions.splice(+b.dataset.px, 1); drawPortions(); });
  };
  const drawSeg = () => {
    $$('#fMode button', body).forEach(b => b.classList.toggle('on', b.dataset.m === st.mode));
    $$('#fUse button', body).forEach(b => b.classList.toggle('on', b.dataset.u === st.use));
    $('#fKcalL', body).textContent = st.mode === '100' ? 'Θερμίδες / 100 γρ.' : `Θερμίδες / ${st.portions[0]?.name || 'μερίδα'}`;
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
    const nm = $('#fName', body).value.trim();
    const portions = st.portions.filter(p => p.name.trim() && p.g > 0).map((p, i) => ({ name: p.name.trim(), g: p.g, piece: i === 0 }));
    let [kcal, p, c, f] = readNums();
    if (!nm) return toast('Γράψε όνομα');
    if (!portions.length) return toast('Βάλε τουλάχιστον μία μερίδα με γραμμάρια');
    if (!(kcal > 0) && !confirm('Θερμίδες 0; Σίγουρα;')) return;
    if (st.mode === 'p') { const k = 100 / portions[0].g; [kcal, p, c, f] = [kcal * k, p * k, c * k, f * k]; }
    const r1 = x => Math.round(x * 10) / 10;
    const vals = { name: nm, cat: $('#fCat', body).value, kcal: r1(kcal), p: r1(p), c: r1(c), f: r1(f), use: st.use, portions };
    let id;
    if (food?.custom) { Object.assign(data.customFoods.find(x => x.id === food.id), vals); id = food.id; }
    else if (food) { data.foodEdits[food.id] = vals; id = food.id; }
    else { id = nextCustomId(data.customFoods); data.customFoods.push({ id, ...vals }); }
    save(); rebuildCatalog(); push('foods', [foodRowOut(id)]);
    toast('Αποθηκεύτηκε ✓');
    if (after) after(foodById(id)); else { closeSheet(); render(); }
  };
  const del = $('#fDel', body);
  if (del) del.onclick = () => {
    const msg = food.custom ? `Να διαγραφεί το «${food.name}»;` : `Να κρυφτεί το «${food.name}» από τη λίστα; (οι παλιές καταγραφές μένουν)`;
    if (!confirm(msg)) return;
    if (food.custom) { data.customFoods = data.customFoods.filter(x => x.id !== food.id); drop('foods', [food.id]); }
    else { data.hiddenFoods.push(food.id); push('foods', [foodRowOut(food.id)]); }
    save(); rebuildCatalog(); closeSheet(); render(); toast(food.custom ? 'Διαγράφηκε' : 'Κρύφτηκε');
  };
  const reset = $('#fReset', body);
  if (reset) reset.onclick = () => {
    delete data.foodEdits[food.id]; save(); rebuildCatalog(); push('foods', [foodRowOut(food.id)]);
    toast(`Επανήλθε: ${base.name}`);
    if (after) after(foodById(food.id)); else { closeSheet(); render(); }
  };
  if (!food) setTimeout(() => $('#fName', body).focus(), 80);
}

/* ---------- συνταγές ---------- */
function renderRecipes(v) {
  const cats = ['Όλες', ...(data.favs.some(k => k.startsWith('recipe:')) ? ['⭐ Αγαπημένες'] : []), ...new Set(RECIPES.map(r => r.cat))];
  if (!cats.includes(ui.recCat)) ui.recCat = 'Όλες';
  const list = RECIPES.filter(r => ui.recCat === 'Όλες' || (ui.recCat === '⭐ Αγαπημένες' ? isFav('recipe:' + r.id) : r.cat === ui.recCat));
  v.innerHTML = `
    <button class="btn primary block" id="rNew" style="margin:0 0 12px">+ Νέα συνταγή</button>
    <div class="chips scroll" style="margin-bottom:12px">${cats.map(c => `<button class="chip ${c === ui.recCat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="rec-grid">${list.map(r => `<button class="rec-card" data-r="${r.id}"><span class="emoji">${r.icon}</span><b>${esc(r.name)}${isFav('recipe:' + r.id) ? ' ⭐' : ''}</b><small>${fmt(r.perServing.kcal)} kcal / μερίδα${r.custom ? ' · δική μου' : ''}</small></button>`).join('')}</div>`;
  $('#rNew', v).onclick = () => openRecipeForm(recipeFormState(null));
  $$('[data-c]', v).forEach(b => b.onclick = () => { ui.recCat = b.dataset.c; render(); });
  $$('[data-r]', v).forEach(b => b.onclick = () => openRecipe(recipeById(+b.dataset.r)));
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
  if (!food) return { text: it.unit === 'γρ' ? `${fmt(it.g * k)} γρ.` : `${fmtQty(it.qty * k)} × ${it.unit}`, g: it.g * k };
  if (food.kcal === 0 && /Αλάτι/.test(food.name)) return { text: 'κατά βούληση', g: 0 };
  if (it.unit === 'γρ') { const g = niceGrams(it.g * k); return { text: `${fmt(g)} γρ.`, g }; }
  const n = it.unit === 'τεμ' ? niceCount(it.qty * k, food) : Math.max(0.5, Math.round(it.qty * k * 2) / 2);
  const g = it.g / it.qty * n;
  const label = (it.unit === 'τεμ' ? (food.portions.find(p => p.piece)?.name || 'τεμ.') : it.unit).replace(/^1 /, '');
  return { text: n <= 1 ? `${frac(n)} ${label}` : `${frac(n)} × ${label}`, g };
}

function openRecipe(r) {
  const st = { serv: r.servings };
  const body = openSheet(`${r.icon} ${r.name}`);
  const draw = () => {
    const k = st.serv / r.servings, favKey = `recipe:${r.id}`;
    body.innerHTML = `
      <div class="sheet-tools">
        <button class="mini-btn" id="rFav">${isFav(favKey) ? '⭐ Στα αγαπημένα' : '☆ Αγαπημένη'}</button>
        <button class="mini-btn" id="rEdit">✏️ Επεξεργασία</button>
        ${r.custom ? '<em class="tag">δική μου</em>' : r.edited ? '<em class="tag">αλλαγμένη</em>' : ''}
      </div>
      <div class="rec-kpi">
        <div><b>${fmt(r.perServing.kcal)}</b><span>kcal / μερίδα</span></div>
        <div><b>${fmt(r.perServing.p)}γρ.</b><span>πρωτεΐνη / μερίδα</span></div>
        <div><b>${fmt(r.total.kcal * k)}</b><span>kcal όλο το φαγητό</span></div>
      </div>
      <div class="stepper"><button id="sMinus" aria-label="Λιγότερες μερίδες">−</button><input id="sQty" inputmode="numeric" value="${st.serv}"><span class="unit">μερίδες</span><button id="sPlus" aria-label="Περισσότερες μερίδες">+</button></div>
      ${st.serv !== r.servings ? `<p class="small muted" style="text-align:center;margin:-4px 0 8px">Η αρχική συνταγή είναι για ${r.servings} μερίδες · <a href="#" id="sReset">επαναφορά</a></p>` : ''}
      <h3 class="section-label">Υλικά</h3>
      <div>${r.items.map(it => { const s = scaledItem(it, k); return `<div class="ing"><span>${esc(it.name)}</span><span>${esc(s.text)}</span></div>`; }).join('')}</div>
      ${r.notes.map(n => `<div class="note">💡 ${esc(n)}</div>`).join('')}
      <h3 class="section-label">Εκτέλεση</h3>
      <ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      <div class="actions">
        <button class="btn" id="rShop" title="Έρχεται: θα στέλνει τα υλικά στα Ψώνια του Household Desk" disabled>🛒 Στα ψώνια</button>
        <button class="btn primary" id="rAte">🍽️ Το έφαγα</button>
      </div>`;
    const setServ = n => { st.serv = Math.min(50, Math.max(1, n)); draw(); };
    $('#sMinus', body).onclick = () => setServ(st.serv - 1);
    $('#sPlus', body).onclick = () => setServ(st.serv + 1);
    $('#sQty', body).onchange = e => setServ(parseInt(e.target.value, 10) || r.servings);
    const reset = $('#sReset', body);
    if (reset) reset.onclick = e => { e.preventDefault(); setServ(r.servings); };
    $('#rAte', body).onclick = () => openPortion({ recipe: r, meal: mealByTime(), day: todayIso() });
    $('#rFav', body).onclick = () => { toggleFav(favKey); draw(); if (ui.tab === 'recipes') render(); };
    $('#rEdit', body).onclick = () => openRecipeForm(recipeFormState(r));
  };
  draw();
}

/* ---------- δικές μου συνταγές / επεξεργασία ---------- */
const REC_ICONS = ['🍝', '🍲', '🥘', '🍗', '🥩', '🐟', '🥗', '🫘', '🍚', '🥔', '🥧', '🍕', '🥪', '🌯', '🍜', '🍛', '🍳', '🥞', '🥣', '🍰', '🍮', '🍏', '🍔', '🫑'];
function recipeFormState(r) {
  return r
    ? { id: r.id, custom: !!r.custom, edited: !!r.edited, name: r.name, icon: r.icon, cat: r.cat, servings: r.servings,
      items: r.items.map(it => ({ ...it })), steps: r.steps.join('\n'), notes: r.notes.join('\n') }
    : { id: null, name: '', icon: '🍲', cat: 'Δικές μου', servings: 4, items: [], steps: '', notes: '' };
}
// Το state μένει ίδιο όσο πας στην επιλογή υλικού και πίσω, για να μη χάνεται τίποτα.
function openRecipeForm(st) {
  const body = openSheet(st.id ? 'Επεξεργασία συνταγής' : 'Νέα συνταγή');
  const cats = [...new Set([...RECIPES.map(r => r.cat), 'Δικές μου'])];
  const preview = computeRecipe({ items: st.items, servings: st.servings });
  body.innerHTML = `
    <label class="field"><span>Όνομα</span><input id="rfName" value="${esc(st.name)}" placeholder="π.χ. Ριζότο με λαχανικά"></label>
    <div class="chips scroll" id="rfIcons">${REC_ICONS.map(i => `<button class="chip emoji-chip ${i === st.icon ? 'on' : ''}" data-i="${i}">${i}</button>`).join('')}</div>
    <div class="row2">
      <label class="field"><span>Κατηγορία</span><select id="rfCat">${cats.map(c => `<option ${c === st.cat ? 'selected' : ''}>${esc(c)}</option>`).join('')}<option value="__new">+ Νέα κατηγορία…</option></select></label>
      <label class="field"><span>Μερίδες που βγάζει</span><input id="rfServ" inputmode="numeric" value="${st.servings}"></label>
    </div>
    <div class="rec-kpi"><div><b>${fmt(preview.perServing.kcal)}</b><span>kcal / μερίδα</span></div><div><b>${fmt(preview.perServing.p)}γρ.</b><span>πρωτεΐνη / μερίδα</span></div><div><b>${fmt(preview.total.kcal)}</b><span>kcal σύνολο</span></div></div>
    <h3 class="section-label">Υλικά</h3>
    <div class="list">${st.items.length ? st.items.map((it, i) => `<button class="item" data-it="${i}"><span class="txt"><b>${esc(it.name)}</b><small>${esc(it.unit === 'γρ' ? `${fmt(it.g)} γρ.` : `${fmtQty(it.qty)} × ${it.unit === 'τεμ' ? 'τεμ.' : it.unit}`)} · ${fmt((foodById(it.food)?.kcal || 0) * it.g / 100)} kcal</small></span><span class="muted">✎</span></button>`).join('') : '<div class="empty">Δεν έχεις βάλει υλικά ακόμα</div>'}</div>
    <button class="btn block" id="rfAdd">+ Πρόσθεσε υλικό</button>
    <label class="field"><span>Βήματα (ένα σε κάθε γραμμή)</span><textarea id="rfSteps" rows="5" placeholder="Σοτάρεις το κρεμμύδι…">${esc(st.steps)}</textarea></label>
    <label class="field"><span>Σημειώσεις (προαιρετικά)</span><textarea id="rfNotes" rows="2">${esc(st.notes)}</textarea></label>
    <div class="actions">
      ${st.id ? (st.custom ? '<button class="btn danger" id="rfDel">Διαγραφή</button>' : st.edited ? '<button class="btn" id="rfReset">↺ Αρχική</button>' : '<button class="btn danger" id="rfDel">Απόκρυψη</button>') : ''}
      <button class="btn primary" id="rfSave">Αποθήκευση</button>
    </div>`;
  // Κρατάμε ό,τι γράφεται στο state πριν από κάθε μετάβαση.
  const sync = () => {
    st.name = $('#rfName', body).value; st.steps = $('#rfSteps', body).value; st.notes = $('#rfNotes', body).value;
    st.servings = Math.max(1, parseInt($('#rfServ', body).value, 10) || st.servings);
  };
  $$('#rfIcons .chip', body).forEach(b => b.onclick = () => { st.icon = b.dataset.i; $$('#rfIcons .chip', body).forEach(x => x.classList.toggle('on', x === b)); });
  $('#rfCat', body).onchange = async e => {
    if (e.target.value !== '__new') { st.cat = e.target.value; return; }
    const n = prompt('Όνομα νέας κατηγορίας');
    if (n && n.trim()) { st.cat = n.trim(); sync(); openRecipeForm(st); } else e.target.value = st.cat;
  };
  $('#rfServ', body).onchange = () => { sync(); openRecipeForm(st); };
  $('#rfAdd', body).onclick = () => { sync(); pickIngredient(st); };
  $$('[data-it]', body).forEach(b => b.onclick = () => { sync(); editIngredient(st, +b.dataset.it); });
  $('#rfSave', body).onclick = () => {
    sync();
    const name = st.name.trim();
    if (!name) return toast('Γράψε όνομα συνταγής');
    if (!st.items.length) return toast('Βάλε τουλάχιστον ένα υλικό');
    const lines = s => s.split('\n').map(x => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
    const rec = { name, icon: st.icon, cat: st.cat, servings: st.servings, items: st.items, steps: lines(st.steps), notes: lines(st.notes) };
    let id = st.id;
    if (st.custom) Object.assign(data.customRecipes.find(r => r.id === id), rec);
    else if (id) data.recipeEdits[id] = rec;
    else { id = nextCustomId(data.customRecipes); data.customRecipes.push({ id, ...rec }); }
    push('recipes', [recipeRowOut(id)]);
    save(); rebuildCatalog(); ui.tab = 'recipes'; render();
    toast('Η συνταγή αποθηκεύτηκε ✓');
    openRecipe(recipeById(id));
  };
  const del = $('#rfDel', body);
  if (del) del.onclick = () => {
    if (!confirm(st.custom ? `Να διαγραφεί η «${st.name}»;` : `Να κρυφτεί η «${st.name}»;`)) return;
    if (st.custom) { data.customRecipes = data.customRecipes.filter(r => r.id !== st.id); drop('recipes', [st.id]); }
    else { data.hiddenRecipes.push(st.id); push('recipes', [recipeRowOut(st.id)]); }
    save(); rebuildCatalog(); closeSheet(); render(); toast(st.custom ? 'Διαγράφηκε' : 'Κρύφτηκε');
  };
  const reset = $('#rfReset', body);
  if (reset) reset.onclick = () => {
    if (!confirm('Να επιστρέψει η συνταγή όπως ήταν αρχικά;')) return;
    delete data.recipeEdits[st.id]; save(); rebuildCatalog(); push('recipes', [recipeRowOut(st.id)]); render(); openRecipe(recipeById(st.id)); toast('Επανήλθε ✓');
  };
}
function pickIngredient(st) {
  const body = openSheet('Πρόσθεσε υλικό');
  body.innerHTML = `
    <label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><input id="iQ" type="search" placeholder="π.χ. ρύζι, κρεμμύδι, ελαιόλαδο…" autocomplete="off"></label>
    <div class="results" id="iRes"></div>
    <div class="actions"><button class="btn" id="iBack">← Πίσω στη συνταγή</button><button class="btn" id="iNew">➕ Νέο τρόφιμο</button></div>`;
  const q = $('#iQ', body);
  const draw = () => {
    const words = fold(q.value.trim()).split(/\s+/).filter(Boolean);
    // Στις συνταγές πρώτα τα υλικά (ωμά), μετά τα υπόλοιπα.
    const list = words.length ? FOODS.filter(f => { const n = fold(f.name); return words.every(w => n.includes(w)); })
      .sort((a, b) => ((b.use !== 'Φ') - (a.use !== 'Φ')) || (fold(b.name).startsWith(words[0]) - fold(a.name).startsWith(words[0])) || a.name.length - b.name.length).slice(0, 40) : [];
    $('#iRes', body).innerHTML = words.length
      ? (list.length ? `<div class="list">${list.map(f => foodRow(f, 'data-ing')).join('')}</div>` : '<div class="empty">Δεν βρέθηκε. Φτιάξ\' το ως νέο τρόφιμο 👇</div>')
      : '<div class="empty">Γράψε το υλικό που θες.</div>';
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
  const units = food ? [{ key: 'γρ', label: 'γραμμάρια' }, ...food.portions.map(p => ({ key: p.piece ? 'τεμ' : p.name, label: p.name, g: p.g }))] : [{ key: 'γρ', label: 'γραμμάρια' }];
  const body = openSheet(it.name);
  body.innerHTML = `
    <div class="chips" id="eiU">${units.map(u => `<button class="chip ${u.key === it.unit ? 'on' : ''}" data-u="${esc(u.key)}">${esc(u.label)}${u.g ? `<small>${u.g}γρ.</small>` : ''}</button>`).join('')}</div>
    <div class="stepper"><input id="eiQ" inputmode="decimal" value="${fmtQty(it.qty)}"><span class="unit" id="eiUnit"></span></div>
    <p class="portion-kcal"><b id="eiK">0</b> <span>kcal</span></p>
    <div class="actions"><button class="btn danger" id="eiDel">Αφαίρεση</button><button class="btn primary" id="eiOk">OK</button></div>`;
  const q = $('#eiQ', body);
  const draw = () => {
    it.qty = parseFloat(q.value.replace(',', '.')) || 0;
    it.g = food ? itemGrams(food, it.qty, it.unit) : it.g;
    $('#eiUnit', body).textContent = it.unit === 'γρ' ? 'γρ.' : `× ${units.find(u => u.key === it.unit)?.label || ''}`;
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
  $('#eiOk', body).onclick = () => { if (!(it.qty > 0)) return toast('Γράψε ποσότητα'); openRecipeForm(st); };
  $('#eiDel', body).onclick = () => { st.items.splice(i, 1); openRecipeForm(st); };
  setTimeout(() => { q.focus(); q.select(); }, 80);
}

/* ---------- πρόγραμμα (έρχεται) ---------- */
function renderPlan(v) {
  v.innerHTML = `<section class="card soon"><div class="big">📅</div><h2>Πρόγραμμα εβδομάδας</h2>
    <p class="muted">Έρχεται στο επόμενο βήμα: θέμα ανά μέρα, συνταγές ανά γεύμα, προτάσεις με βάση τις θερμίδες που σου μένουν και ψώνια για όλη την εβδομάδα.</p></section>`;
}

/* ---------- ρυθμίσεις ---------- */
function renderSettings(v) {
  const s = data.settings;
  v.innerHTML = `
    <section class="card">
      <h2>🎯 Στόχοι</h2>
      <div class="row2">
        <label class="field"><span>Θερμίδες / ημέρα</span><input id="sKcal" inputmode="numeric" value="${s.kcalGoal}"></label>
        <label class="field"><span>Νερό (ποτήρια)</span><input id="sWater" inputmode="numeric" value="${s.waterGoal}"></label>
      </div>
      <p class="small muted">Σε επόμενο βήμα: υπολογισμός του στόχου από ύψος, βάρος, ηλικία και κίνηση.</p>
    </section>
    <section class="card">
      <h2>🎨 Εμφάνιση</h2>
      <div class="seg" id="sTheme">${[['auto', 'Αυτόματο'], ['light', 'Φωτεινό'], ['dark', 'Σκούρο']].map(([k, l]) => `<button data-t="${k}" class="${s.theme === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    </section>
    <section class="card">
      <h2>✏️ Τα δικά μου</h2>
      <div class="list flat" id="sMine"></div>
      <button class="btn block" id="sNewFood">➕ Νέο τρόφιμο</button>
      <p class="small muted">Διόρθωση τροφίμου: πάτα το τρόφιμο όταν το προσθέτεις → «✏️ Διόρθωση». Συνδυασμό φτιάχνεις από την αρχική: «🍱 Συνδυασμός» δίπλα σε ένα γεύμα.</p>
    </section>
    <section class="card">
      <h2>🔐 Σύνδεση</h2>
      ${online()
        ? `<p class="small muted" style="margin-top:0">Όλα σώζονται στο Google Sheet «Food Desk»${queue.length ? ` · 📴 ${queue.length} αλλαγές περιμένουν internet` : ' ✓'}</p>
           <div class="row2"><button class="btn" id="sPin">🔑 Αλλαγή PIN</button><button class="btn" id="sOut">Αποσύνδεση</button></div>`
        : `<p class="small muted" style="margin-top:0">Δοκιμαστική λειτουργία: όσα γράφεις μένουν μόνο σε αυτόν τον browser.</p>
           <button class="btn" id="sOut">Έξοδος από τη δοκιμή</button>`}
    </section>
    <section class="card">
      <h2>📚 Βάση</h2>
      <p class="muted small" style="margin-top:0">${FOODS.length} τρόφιμα · ${RECIPES.length} συνταγές</p>
      <button class="btn danger block" id="sReset">Σβήσε όλες τις καταγραφές</button>
    </section>`;
  const num = (id, key, min, max) => { $(id, v).onchange = e => { const n = parseInt(e.target.value, 10); if (n >= min && n <= max) { s[key] = n; save(); push('settings', settingsRows()); toast('Αποθηκεύτηκε ✓'); } else e.target.value = s[key]; }; };
  num('#sKcal', 'kcalGoal', 800, 6000);
  num('#sWater', 'waterGoal', 1, 30);
  const mine = [
    ...data.combos.map(c => `<button class="item" data-mc="${c.id}"><span class="ico">${c.icon}</span><span class="txt"><b>${esc(c.name)}</b><small>Συνδυασμός · ${fmt(totals(c.items).kcal)} kcal</small></span></button>`),
    ...FOODS.filter(f => f.custom || f.edited).map(f => foodRow(f, 'data-mf')),
  ];
  $('#sMine', v).innerHTML = mine.length ? mine.join('') : '<div class="empty">Δεν έχεις ακόμα δικά σου τρόφιμα ή συνδυασμούς.</div>';
  $$('[data-mc]', v).forEach(b => b.onclick = () => { const c = data.combos.find(x => x.id === b.dataset.mc); saveCombo(null, null, c); });
  $$('[data-mf]', v).forEach(b => b.onclick = () => openFoodForm(foodById(+b.dataset.mf.split(':')[1])));
  $('#sNewFood', v).onclick = () => openFoodForm(null);
  const pinBtn = $('#sPin', v);
  if (pinBtn) pinBtn.onclick = openChangePin;
  $('#sOut', v).onclick = () => { if (confirm(online() ? 'Αποσύνδεση από αυτή τη συσκευή;' : 'Έξοδος από τη δοκιμή;')) logout(); };
  $$('#sTheme button', v).forEach(b => b.onclick = () => { s.theme = b.dataset.t; save(); applyTheme(); render(); });
  $('#sReset', v).onclick = () => {
    if (!confirm('Να σβηστούν όλες οι καταγραφές φαγητού και νερού;')) return;
    drop('log', data.log.map(e => e.id)); drop('water', Object.keys(data.water));
    data.log = []; data.water = {}; save(); toast('Σβήστηκαν'); render();
  };
}

function applyTheme() {
  const t = data.settings.theme;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* ---------- είσοδος ---------- */
function renderLogin(v) {
  v.innerHTML = `
    <div class="login">
      <div class="login-logo">🥗</div>
      <h1>Food Desk</h1>
      <p class="muted">Βάλε το PIN σου για να μπεις</p>
      <section class="card">
        <label class="field" style="margin-top:0"><span>PIN</span>
          <input id="lgPin" type="password" inputmode="numeric" autocomplete="current-password" class="pin-input" placeholder="••••"></label>
        <details class="adv" ${API_URL ? '' : 'open'}>
          <summary class="small muted">Διεύθυνση σύνδεσης</summary>
          <label class="field"><span>URL του Apps Script</span>
            <input id="lgUrl" type="text" autocomplete="off" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(API_URL)}"></label>
        </details>
        <button class="btn primary block" id="lgGo">Είσοδος</button>
      </section>
      <button class="link-btn" id="lgDemo">Δοκιμή με ψεύτικα δεδομένα</button>
    </div>`;
  const pin = $('#lgPin', v);
  setTimeout(() => pin.focus(), 60);
  let busy = false;
  const go = async () => {
    if (busy) return;
    const url = $('#lgUrl', v).value.trim(), p = pin.value.trim();
    if (!url.startsWith('https://script.google.com/') && !url.startsWith('http://localhost')) return toast('Η διεύθυνση πρέπει να ξεκινάει με https://script.google.com/');
    if (!p) return toast('Βάλε το PIN');
    cfg = { url, pin: p };
    store.set('food.cfg', cfg);
    queue = []; store.set('food.queue', []);
    busy = true;
    $('#lgGo', v).disabled = true;
    $('#lgGo', v).textContent = 'Σύνδεση… ⏳';
    try {
      await api('ping');
    } catch (e) {
      cfg = null; store.set('food.cfg', null);
      busy = false;
      $('#lgGo', v).disabled = false; $('#lgGo', v).textContent = 'Είσοδος';
      return toast(e.message === 'Λάθος PIN' ? 'Λάθος PIN' : e.message);
    }
    // Σωστό PIN: μέσα αμέσως. Τα δεδομένα φορτώνουν στο παρασκήνιο (η Google μπορεί να αργήσει).
    data = freshData(); save(); rebuildCatalog();
    ui.tab = 'today'; ui.day = todayIso(); render();
    toast('Καλώς ήρθες! 🥗 Φορτώνω τα δεδομένα σου…');
    refresh().then(ok => { if (ok) toast('Όλα ενημερωμένα ✓'); });
  };
  $('#lgGo', v).onclick = go;
  pin.onkeydown = e => { if (e.key === 'Enter') go(); };
  $('#lgDemo', v).onclick = () => {
    cfg = { url: 'demo', pin: '' }; store.set('food.cfg', cfg);
    data = demoData(); save(); rebuildCatalog(); ui.tab = 'today'; ui.day = todayIso(); render();
  };
}

function openChangePin() {
  const body = openSheet('Αλλαγή PIN');
  body.innerHTML = `
    <label class="field"><span>Νέο PIN (4–12 ψηφία)</span><input id="cpNew" type="password" inputmode="numeric" autocomplete="new-password"></label>
    <label class="field"><span>Νέο PIN ξανά</span><input id="cpNew2" type="password" inputmode="numeric" autocomplete="new-password"></label>
    <div class="actions"><button class="btn" id="cpNo">Άκυρο</button><button class="btn primary" id="cpOk">Αλλαγή</button></div>`;
  $('#cpNo', body).onclick = closeSheet;
  $('#cpOk', body).onclick = async () => {
    const a = $('#cpNew', body).value.trim(), b = $('#cpNew2', body).value.trim();
    if (!/^[0-9]{4,12}$/.test(a)) return toast('Το PIN πρέπει να έχει 4 έως 12 ψηφία');
    if (a !== b) return toast('Τα δύο PIN δεν ταιριάζουν');
    try {
      await api('changePin', { newPin: a });
      cfg.pin = a; store.set('food.cfg', cfg);
      closeSheet(); toast('Το PIN άλλαξε ✓');
    } catch (e) { toast(e.message); }
  };
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
  t.innerHTML = esc(msg) + (undo ? ' · <u style="cursor:pointer" id="tUndo">Αναίρεση</u>' : '');
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
  const [f, r] = await Promise.all([fetch('data/foods.json').then(x => x.json()), fetch('data/recipes.json').then(x => x.json())]);
  BASE_FOODS = f; BASE_RECIPES = r; FOODS = f;
  data = data ? migrate(data) : freshData();
  rebuildCatalog();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  $$('.tabbar [data-tab]').forEach(b => b.onclick = () => { ui.tab = b.dataset.tab; if (ui.tab === 'today') ui.day = todayIso(); render(); scrollTo(0, 0); });
  $('#addBtn').onclick = () => openAdd(mealByTime(), ui.tab === 'today' ? ui.day : todayIso());
  $('#sheetClose').onclick = closeSheet;
  $('#overlay').onclick = e => { if (e.target.id === 'overlay') closeSheet(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('#refreshBtn').onclick = async () => { if (await refresh()) toast('Ενημερώθηκε ✓'); };
  $('#pending').onclick = () => { flush(); toast('Προσπαθώ να τα στείλω…'); };
  // Μόλις γυρίσει το internet ή ξανανοίξεις το site, στέλνονται όσα περιμένουν.
  addEventListener('online', () => flush());
  document.addEventListener('visibilitychange', () => { if (!document.hidden && online()) refresh(); });
  setInterval(() => { if (queue.length) flush(); }, 30000);
  render();                      // αμέσως με ό,τι υπάρχει στη συσκευή…
  if (online()) refresh();       // …και μετά φρέσκα από το Sheet
}
init();
if ('serviceWorker' in navigator && location.hostname !== 'localhost') navigator.serviceWorker.register('sw.js');
