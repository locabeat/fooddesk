// Εφαρμόζει αντικαταστάσεις κειμένου σε ένα αρχείο, χωρίς «μαγικούς» χαρακτήρες ($, \ κλπ.).
// node apply-replacements.js <αρχείο> <λίστα>
// Μορφή λίστας: μπλοκ «<<<<» [παλιό κείμενο] «====» [νέο κείμενο] «>>>>». Κάθε παλιό πρέπει να υπάρχει ακριβώς μία φορά.
const fs = require('fs');
const [file, list] = process.argv.slice(2);
let src = fs.readFileSync(file, 'utf8');
const text = fs.readFileSync(list, 'utf8').replace(/\r\n/g, '\n');
const blocks = text.split('<<<<\n').slice(1);
let n = 0;
for (const b of blocks) {
  const [oldPart, rest] = b.split('\n====\n');
  const newPart = rest.split('\n>>>>')[0];
  const count = src.split(oldPart).length - 1;
  if (count !== 1) { console.error(`ΣΦΑΛΜΑ (${count} φορές):\n${oldPart.slice(0, 160)}`); process.exit(1); }
  src = src.split(oldPart).join(newPart);
  n++;
}
fs.writeFileSync(file, src);
console.log(`${n} αντικαταστάσεις OK`);
