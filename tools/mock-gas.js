// Ψεύτικο Google Sheet για δοκιμές: τρέχει το apps-script/Code.gs μέσα στο Node,
// με ένα μικρό αντίγραφο των SpreadsheetApp / PropertiesService / LockService / ContentService / Utilities / DriveApp.
// Τα «φύλλα» κρατιούνται στη μνήμη (και σε tools/mock-sheet.json για να μένουν μετά από restart).
// Οι φωτογραφίες σώζονται στο mock-photos/ και σερβίρονται από τον τοπικό server.
// Αν αλλάξει το Code.gs, ξαναφορτώνεται μόνο του (δεν χρειάζεται restart).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const STATE = path.join(__dirname, 'mock-sheet.json');
const PHOTOS = path.join(__dirname, '..', 'mock-photos');
let book = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : { sheets: {}, order: [], props: {} };
if (!book.props) book.props = {};
if (!book.props.PIN) book.props.PIN = process.env.MOCK_PIN || '1234';
book.props.NO_LOCKOUT = '1'; // στις τοπικές δοκιμές δεν κλειδώνει ο λογαριασμός
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
const props = {
  getProperty: k => book.props[k] ?? null,
  setProperty: (k, v) => { book.props[k] = String(v); persist(); },
  deleteProperty: k => { delete book.props[k]; persist(); },
  getProperties: () => ({ ...book.props }),
};
const file = id => ({ getId: () => id, setSharing() {}, setTrashed() { try { fs.unlinkSync(path.join(PHOTOS, id)); } catch {} } });
const folder = { getId: () => 'mock-folder', createFile: blob => { fs.mkdirSync(PHOTOS, { recursive: true }); fs.writeFileSync(path.join(PHOTOS, blob.name), blob.bytes); return file(blob.name); } };
const ctxBase = {
  SpreadsheetApp: { getActive: () => ss },
  PropertiesService: { getScriptProperties: () => props },
  LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
  ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ setMimeType: () => s }) },
  Utilities: {
    formatDate: d => d.toISOString().slice(0, 10),
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (alg, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    base64Decode: s => Buffer.from(s, 'base64'),
    newBlob: (bytes, type, name) => ({ bytes, type, name }),
  },
  DriveApp: {
    Access: { ANYONE_WITH_LINK: 'link' }, Permission: { VIEW: 'view' },
    getFolderById: () => folder,
    createFolder: () => folder,
    getFileById: id => file(id),
  },
  PHOTO_URL_: id => '/mock-photos/' + id,
};
const CODE = path.join(__dirname, '..', 'apps-script', 'Code.gs');
let ctx = null, loaded = 0;
function load() {
  const m = fs.statSync(CODE).mtimeMs;
  if (ctx && m === loaded) return;
  ctx = { ...ctxBase };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(CODE, 'utf8'), ctx);
  loaded = m;
}

module.exports = body => { load(); return ctx.doPost({ postData: { contents: body } }); };
module.exports.book = () => book;
