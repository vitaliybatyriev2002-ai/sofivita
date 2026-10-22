// Check the files actually served by GitHub Pages, with no package installation.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const failures = [];
let localReferences = 0;

function checkReference(raw, parentFile) {
  const ref = raw.trim().replaceAll('&amp;', '&');
  if (!ref || /^(?:https?:|data:|mailto:|tel:|javascript:|#|\/\/)/i.test(ref)) return;
  if (ref.startsWith('/')) {
    failures.push(`${parentFile}: absolute path will not work in a project subdirectory: ${ref}`);
    return;
  }
  const clean = decodeURIComponent(ref.split(/[?#]/)[0]);
  // SVG filters embedded in data URLs can contain an encoded fragment url(%23id).
  if (!clean || clean.startsWith('#')) return;
  const absolute = path.resolve(path.dirname(parentFile), clean);
  if (!absolute.startsWith(root + path.sep) || !fs.existsSync(absolute)) {
    failures.push(`${path.relative(root, parentFile)}: missing local file ${ref}`);
  }
  localReferences++;
}

for (const [, ref] of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
  checkReference(ref, path.join(root, 'index.html'));
}
function checkCss(css, parentFile) {
  for (const [, ref] of css.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) checkReference(ref, parentFile);
}
for (const [, css] of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) checkCss(css, path.join(root, 'index.html'));
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.name.endsWith('.css')) checkCss(fs.readFileSync(target, 'utf8'), target);
  }
}
walk(path.join(root, 'assets'));

for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  try { new vm.Script(script); }
  catch (error) { failures.push(`JavaScript syntax: ${error.message}`); }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Site verified: ${localReferences} local references resolve; inline JavaScript parses.`);
