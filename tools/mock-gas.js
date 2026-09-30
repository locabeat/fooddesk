// Ψεύτικο Google Sheet για δοκιμές: τρέχει το apps-script/Code.gs μέσα στο Node,
// με ένα μικρό αντίγραφο των SpreadsheetApp / PropertiesService / LockService / ContentService.
// Τα «φύλλα» κρατιούνται στη μνήμη (και σε tools/mock-sheet.json για να μένουν μετά από restart).
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STATE = path.join(__dirname, 'mock-sheet.json');
let book = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { sheets: {}, order: [] };
const persist = () => fs.writeFileSync(STATE, JSON.stringify(book));

function makeSheet(name) {
  const grid = () => book.sheets[name];
  const lastRow = () => { const g = grid(); for (let i = g.length - 1; i >= 0; i--) if (g[i].some(v => v !== '')) return i + 1; return 0; };
  const lastCol = () => Math.max(0, ...grid().map(r => { for (let j = r.length - 1; j >= 0; j--) if (r[j] !== '') return j + 1; return 0; }));
  const ensure = (r, c) => { const g = grid(); while (g.length < r) g.push([]); g.forEach(row => { while (row.length < c) row.push(''); }); };
  const range = (r, c, nr = 1, nc = 1) => ({
    getValues: () => { ensure(r + nr - 1, c + nc - 1); return grid().slice(r - 1, r - 1 + nr).map(row => row.slice(c - 1, c - 1 + nc)); },
    setValues: vals => { ensure(r + nr - 1, c + nc - 1); vals.forEach((row, i) => row.forEach((v, j) => { grid()[r - 1 + i][c - 1 + j] = v; })); persist(); return range(r, c, nr, nc); },
    setValue: v => { ensure(r, c); grid()[r - 1][c - 1] = v; persist(); return range(r, c); },
    setNumberFormat: () => range(r, c, nr, nc), setFontWeight: () => range(r, c, nr, nc), setBackground: () => range(r, c, nr, nc),
  });
  return {
    getRange: range, getLastRow: lastRow, getLastColumn: lastCol, getMaxRows: () => 1000, setFrozenRows: () => {},
    deleteRow: i => { grid().splice(i - 1, 1); persist(); },
  };
}
const ss = {
  getSheetByName: n => (book.sheets[n] ? makeSheet(n) : null),
  insertSheet: n => { book.sheets[n] = []; book.order.push(n); persist(); return makeSheet(n); },
  getSpreadsheetTimeZone: () => 'Europe/Athens',
};
const props = { PIN: process.env.MOCK_PIN || '1234' };
const ctx = {
  SpreadsheetApp: { getActive: () => ss },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => s }) },
  Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Code.gs'), 'utf8'), ctx);

module.exports = body => ctx.doPost({ postData: { contents: body } });
module.exports.book = () => book;
