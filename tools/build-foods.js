// Διαβάζει τα data/foods/*.txt και βγάζει data/foods.json (για το app) και «Food Desk - Τρόφιμα.xlsx» (για έλεγχο).
// node build-foods.js
//
// Μορφή γραμμής:  Όνομα | kcal | Πρωτ. | Υδατ. | Λιπ. | Χρήση | Μερίδες
//   - Οι τιμές είναι ανά 100γρ. Με «@» μπροστά από τις kcal είναι για την ΠΡΩΤΗ μερίδα και μετατρέπονται.
//   - Χρήση: Φ = καταγραφή (όπως το τρως), Υ = υλικό συνταγής (ωμό), ΦΥ = και τα δύο.
//   - Μερίδες: «όνομα:γραμμάρια» χωρισμένες με «;». Το «*» σημαίνει «1 τεμάχιο» (για στρογγύλεμα στις συνταγές).
//   - «# Κάτι» χωρίς «|» = νέα κατηγορία. Άλλες γραμμές με «#» είναι σχόλια.
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'data', 'foods');
const USE = { 'Φ': 'Φαγητό', 'Υ': 'Υλικό συνταγής', 'ΦΥ': 'Και τα δύο' };
const r1 = n => Math.round(n * 10) / 10;

const foods = [], errors = [], warnings = [];
const seen = new Map();

for (const file of fs.readdirSync(srcDir).filter(f => f.endsWith('.txt')).sort()) {
  let cat = null;
  fs.readFileSync(path.join(srcDir, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    line = line.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      if (!line.includes('|') && !line.startsWith('# @')) cat = line.slice(1).trim();
      return;
    }
    const parts = line.split('|').map(s => s.trim());
    if (parts.length !== 7) return errors.push(`${where}: ${parts.length} πεδία αντί για 7`);
    let [name, kcalS, pS, cS, fS, use, portS] = parts;
    const perPortion = kcalS.startsWith('@');
    let [kcal, p, c, f] = [kcalS.replace('@', ''), pS, cS, fS].map(Number);
    if ([kcal, p, c, f].some(isNaN)) return errors.push(`${where}: μη αριθμός`);
    if (!USE[use]) return errors.push(`${where}: άγνωστη χρήση «${use}»`);
    const portions = portS.split(';').map(s => s.trim()).filter(Boolean).map(s => {
      const piece = s.startsWith('*');
      const k = s.lastIndexOf(':');
      return { name: s.slice(piece ? 1 : 0, k).trim(), g: Number(s.slice(k + 1)), piece };
    });
    if (!portions.length || portions.some(x => !x.name || !(x.g > 0))) return errors.push(`${where}: λάθος μερίδες «${portS}»`);
    if (perPortion) {
      const k = 100 / portions[0].g;
      [kcal, p, c, f] = [kcal * k, p * k, c * k, f * k];
    }
    const key = name.toLowerCase();
    if (seen.has(key)) errors.push(`${where}: διπλό όνομα (και ${seen.get(key)})`);
    seen.set(key, where);
    // Έλεγχος: kcal ≈ 4·Π + 4·Υ + 9·Λ (το αλκοόλ δίνει 7 kcal/γρ. και δεν μετράει εδώ).
    const est = 4 * p + 4 * c + 9 * f;
    if (cat !== 'Αλκοόλ' && kcal > 20 && Math.abs(est - kcal) / kcal > 0.15)
      warnings.push(`${where}: ${name} — kcal ${r1(kcal)} αλλά από μακρο ${r1(est)}`);
    foods.push({ id: foods.length + 1, cat, name, use, kcal: r1(kcal), p: r1(p), c: r1(c), f: r1(f), portions });
  });
}

// ---------- Συνταγές (data/recipes/*.txt) ----------
// «# Κατηγορία», «= Όνομα | μερίδες | εικονίδιο», «Υλικό | ποσότητα», «- βήμα», «! σημείωση».
// Ποσότητα: «500» = γραμμάρια, «2 τεμ» = τεμάχια (η μερίδα με «*»), «3 κουταλιά» = μερίδα με αυτό το όνομα.
const byName = new Map(foods.map(x => [x.name, x]));
const recipes = [];
// Ετικέτες συνταγών (ίδια λίστα με το TAGS του app.js).
const TAG_KEYS = ['airfryer', 'quick', 'five', 'budget', 'kids', 'light', 'protein', 'fasting', 'vegan', 'onepan'];
const recDir = path.join(root, 'data', 'recipes');
for (const file of fs.readdirSync(recDir).filter(f => f.endsWith('.txt')).sort()) {
  let cat = null, rec = null;
  fs.readFileSync(path.join(recDir, file), 'utf8').split(/\r?\n/).forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    line = line.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      if (!line.includes('«') && !line.includes(':')) cat = line.slice(1).trim();
      return;
    }
    if (line.startsWith('=')) {
      const [name, serv, icon] = line.slice(1).split('|').map(s => s.trim());
      rec = { id: recipes.length + 1, cat, name, servings: Number(serv), icon: icon || '', items: [], steps: [], notes: [] };
      if (!(rec.servings > 0)) errors.push(`${where}: λάθος μερίδες`);
      return recipes.push(rec);
    }
    if (!rec) return errors.push(`${where}: γραμμή έξω από συνταγή`);
    // «@ κλειδί: τιμή» — στοιχεία από την πηγή (πηγή, φωτογραφία, χρόνος, δυσκολία, μερίδες όπως τις γράφει).
    if (line.startsWith('@ ')) {
      const k = line.indexOf(':'), key = line.slice(2, k).trim(), val = line.slice(k + 1).trim();
      if (key === 'κατηγορία') { rec.cat = val; return; }
      if (key === 'ετικέτες') {
        rec.tags = val.split(',').map(t => t.trim()).filter(Boolean);
        const bad = rec.tags.filter(t => !TAG_KEYS.includes(t));
        if (bad.length) errors.push(`${where}: άγνωστες ετικέτες ${bad.join(', ')}`);
        return;
      }
      const map = { 'πηγή': 'source', 'φωτογραφία': 'photo', 'χρόνος': 'time', 'δυσκολία': 'difficulty', 'μερίδες': 'servingsText' };
      if (!map[key]) return errors.push(`${where}: άγνωστο πεδίο «${key}»`);
      rec.meta = rec.meta || {};
      rec.meta[map[key]] = val;
      return;
    }
    if (line.startsWith('- ')) return rec.steps.push(line.slice(2));
    if (line.startsWith('! ')) return rec.notes.push(line.slice(2));
    const [fname, qtyS] = line.split('|').map(s => s.trim());
    const food = byName.get(fname);
    if (!food) return errors.push(`${where}: δεν υπάρχει στη λίστα «${fname}»`);
    if (food.use === 'Φ') warnings.push(`${where}: «${fname}» είναι μόνο «Φαγητό», όχι υλικό`);
    const m = /^(\d+(?:[.,]\d+)?)\s*(.*)$/.exec(qtyS || '');
    if (!m) return errors.push(`${where}: λάθος ποσότητα «${qtyS}»`);
    const n = Number(m[1].replace(',', '.')), unit = m[2].trim();
    let g, portion = null;
    if (!unit || unit === 'γρ') g = n;
    else {
      portion = unit === 'τεμ' ? food.portions.find(p => p.piece) : food.portions.find(p => p.name === unit);
      if (!portion) return errors.push(`${where}: το «${fname}» δεν έχει μερίδα «${unit}» (έχει: ${food.portions.map(p => (p.piece ? '*' : '') + p.name).join(', ')})`);
      g = n * portion.g;
    }
    rec.items.push({ food: food.id, name: fname, qty: n, unit: portion ? (unit === 'τεμ' ? 'τεμ' : portion.name) : 'γρ', g });
  });
}
for (const r of recipes) {
  const tot = { kcal: 0, p: 0, c: 0, f: 0, g: 0 };
  for (const it of r.items) {
    const x = foods[it.food - 1];
    for (const k of ['kcal', 'p', 'c', 'f']) tot[k] += x[k] * it.g / 100;
    tot.g += it.g;
  }
  r.total = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, Math.round(v)]));
  r.perServing = Object.fromEntries(Object.entries(tot).map(([k, v]) => [k, Math.round(v / r.servings)]));
}

// ---------- Αγγλικά (data/en/*.txt) ----------
const enDir = path.join(root, 'data', 'en');
const lines = f => fs.readFileSync(path.join(enDir, f), 'utf8').split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith('#'));
const pairs = f => Object.fromEntries(lines(f).map(s => { const k = s.indexOf(' = '); return [s.slice(0, k).trim(), s.slice(k + 3).trim()]; }));
const enFood = Object.fromEntries(lines('foods.txt').map(s => { const [id, ...n] = s.split('|'); return [Number(id), n.join('|').trim()]; }));
const enPortion = pairs('portions.txt'), enCat = pairs('categories.txt');
for (const f of foods) {
  if (!enFood[f.id]) errors.push(`EN: λείπει το τρόφιμο ${f.id} ${f.name}`);
  f.en = enFood[f.id];
  for (const p of f.portions) { if (!enPortion[p.name]) errors.push(`EN: λείπει η μερίδα «${p.name}»`); p.en = enPortion[p.name]; }
  if (!enCat[f.cat]) errors.push(`EN: λείπει η κατηγορία «${f.cat}»`);
}
let enRec = null;
for (const s of lines('recipes.txt')) {
  if (s.startsWith('=')) { const [id, ...n] = s.slice(1).split('|'); enRec = recipes.find(r => r.id === Number(id)); if (!enRec) { errors.push(`EN: άγνωστη συνταγή ${id}`); continue; } enRec.en = { name: n.join('|').trim(), steps: [], notes: [] }; }
  else if (enRec && s.startsWith('- ')) enRec.en.steps.push(s.slice(2));
  else if (enRec && s.startsWith('! ')) enRec.en.notes.push(s.slice(2));
}
for (const r of recipes) {
  if (!r.en) { errors.push(`EN: λείπει η συνταγή ${r.id} ${r.name}`); continue; }
  if (r.en.steps.length !== r.steps.length || r.en.notes.length !== r.notes.length) errors.push(`EN: η συνταγή ${r.id} έχει διαφορετικό πλήθος βημάτων/σημειώσεων`);
  for (const seg of r.cat.split('/')) if (!enCat[seg]) errors.push(`EN: λείπει η κατηγορία συνταγής «${seg}» (${r.cat})`);
}
fs.writeFileSync(path.join(root, 'data', 'i18n.json'), JSON.stringify({ cats: enCat }));

if (errors.length) { console.error('ΛΑΘΗ:\n' + errors.join('\n')); process.exit(1); }
if (warnings.length) console.log(`Προειδοποιήσεις (${warnings.length}):\n` + warnings.join('\n'));

fs.writeFileSync(path.join(root, 'data', 'foods.json'), JSON.stringify(foods));
fs.writeFileSync(path.join(root, 'data', 'recipes.json'), JSON.stringify(recipes));

(async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Τρόφιμα', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = [
    { header: 'Κατηγορία', key: 'cat', width: 26 },
    { header: 'Τρόφιμο', key: 'name', width: 44 },
    { header: 'Χρήση', key: 'use', width: 16 },
    { header: 'kcal / 100γρ.', key: 'kcal', width: 12 },
    { header: 'Πρωτεΐνη', key: 'p', width: 10 },
    { header: 'Υδατάνθρ.', key: 'c', width: 10 },
    { header: 'Λιπαρά', key: 'f', width: 9 },
    { header: 'Μερίδες (γραμμάρια → θερμίδες)', key: 'portions', width: 90 },
  ];
  for (const x of foods) {
    ws.addRow({
      ...x, use: USE[x.use],
      portions: x.portions.map(q => `${q.name} ${q.g}γρ. → ${Math.round(x.kcal * q.g / 100)} kcal`).join('  ·  '),
    });
  }
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E9E6B' } };
  head.alignment = { vertical: 'middle' };
  head.height = 22;
  ws.autoFilter = { from: 'A1', to: 'H1' };
  let prev = null, band = false;
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const cat = row.getCell(1).value;
    if (cat !== prev) { band = !band; prev = cat; }
    if (band) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F9F4' } };
    ['D', 'E', 'F', 'G'].forEach(col => { row.getCell(col).numFmt = '0.#'; });
  });
  // Φύλλο «Συνταγές»: μία γραμμή-τίτλος ανά συνταγή, από κάτω τα υλικά, τα βήματα και οι σημειώσεις.
  const rs = wb.addWorksheet('Συνταγές', { views: [{ state: 'frozen', ySplit: 1 }] });
  rs.columns = [
    { header: 'Κατηγορία', key: 'a', width: 22 },
    { header: 'Συνταγή / Υλικό', key: 'b', width: 46 },
    { header: 'Ποσότητα', key: 'c', width: 26 },
    { header: 'Γραμμάρια', key: 'd', width: 11 },
    { header: 'kcal', key: 'e', width: 9 },
    { header: 'Πρωτεΐνη', key: 'f', width: 10 },
    { header: 'Οδηγίες / Σημειώσεις', key: 'g', width: 100 },
  ];
  const rh = rs.getRow(1);
  rh.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  rh.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E9E6B' } };
  rh.height = 22;
  const qtyText = it => it.unit === 'γρ' ? `${it.qty} γρ.` : it.unit === 'τεμ' ? `${it.qty} τεμ.` : `${it.qty} × ${it.unit}`;
  for (const r of recipes) {
    const t = rs.addRow({
      a: r.cat, b: `${r.icon} ${r.name}`, c: `${r.servings} μερίδες`, d: r.total.g,
      e: r.perServing.kcal, f: r.perServing.p, g: `≈ ${r.perServing.kcal} kcal / μερίδα  ·  σύνολο ${r.total.kcal} kcal`,
    });
    t.font = { bold: true, size: 12 };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F4EA' } };
    r.items.forEach((it, i) => {
      const x = foods[it.food - 1];
      rs.addRow({ b: '   ' + it.name, c: qtyText(it), d: Math.round(it.g), e: Math.round(x.kcal * it.g / 100), f: Math.round(x.p * it.g / 100), g: r.steps[i] ? `${i + 1}. ${r.steps[i]}` : '' });
    });
    for (let i = r.items.length; i < r.steps.length; i++) rs.addRow({ g: `${i + 1}. ${r.steps[i]}` });
    for (const n of r.notes) rs.addRow({ g: 'ℹ️ ' + n }).font = { italic: true, color: { argb: 'FF5B6B63' } };
    rs.addRow({});
  }
  rs.getColumn('g').alignment = { wrapText: true, vertical: 'top' };

  const out = path.join(root, 'data', 'Food Desk - Τρόφιμα.xlsx');
  await wb.xlsx.writeFile(out);
  const byCat = {};
  foods.forEach(x => { byCat[x.cat] = (byCat[x.cat] || 0) + 1; });
  console.log(`\n${foods.length} τρόφιμα →`, out);
  console.log(Object.entries(byCat).map(([k, v]) => `  ${k}: ${v}`).join('\n'));
  console.log(`\n${recipes.length} συνταγές:`);
  for (const r of recipes) console.log(`  [${r.cat}] ${r.name} — ${r.servings} μερ. · ${r.perServing.kcal} kcal/μερ. · ${r.perServing.p}γρ. πρωτ. · μερίδα ≈ ${Math.round(r.total.g / r.servings)}γρ. ωμά`);
})();
