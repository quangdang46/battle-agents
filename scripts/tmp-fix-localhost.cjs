// Throwaway: replace the malformed localhost guard with a correct one.
const fs = require('node:fs');

const path = 'apps/web/src/auth/server.ts';
const lines = fs.readFileSync(path, 'utf8').split('\n');
const start = lines.findIndex((line) => line.indexOf('if (/^https?:') >= 0);
const end = lines.findIndex((line, index) => index > start && line.trim() === '  }');

if (start < 0 || end < 0) {
  console.error('anchor not found');
  process.exit(1);
}

const q = String.fromCharCode(39); // '
const dq = String.fromCharCode(34); // "
const nl = String.fromCharCode(10); // newline
const backslash = String.fromCharCode(92);

const block = [
  '  if (/^https?:' + backslash + backslash + '/localhost([:/]|$)/i.test(baseUrl)) {',
  '    throw new Error(',
  '      [',
  '        `BETTER_AUTH_URL is "${baseUrl}". Use 127.0.0.1 instead.`,',
  '        ' + q + 'GitHub treats localhost and 127.0.0.1 as different origins, so a' + q + ',',
  '        ' + q + 'localhost callback fails with redirect_uri_mismatch after the app is' + q + ',',
  '        ' + q + 'already running and the OAuth app is already registered.' + q + ',',
  '      ].join(' + q + '\\n' + q + '),',
  '    );',
  '  }',
];

lines.splice(start, end - start + 1, ...block);
fs.writeFileSync(path, lines.join(nl));
console.log('rewritten lines ' + (start + 1) + '-' + (end + 1));
void dq;
