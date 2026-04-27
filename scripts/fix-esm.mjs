import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'apps/api/dist');

function fixFile(f) {
  let c = readFileSync(f, 'utf8');
  const r = c.match(/(?:from|export)\s+['"](?:\.\.?\.[^'"]+)['"](?!\.js)/g) || [];
  r.forEach(m => {
    const p = m.match(/(?:from|export)\s+['"]([^'"]+)['"]/)[1];
    c = c.replace(m, m.replace(p, p + '.js'));
  });
  if (c !== readFileSync(f, 'utf8')) {
    writeFileSync(f, c);
    console.log('Fixed:', f);
  }
}

function walk(d) {
  readdirSync(d).forEach(n => {
    const p = d + '/' + n;
    statSync(p).isDirectory() ? walk(p) : n.endsWith('.js') && fixFile(p);
  });
}

walk(dist);
console.log('ESM fix complete');
