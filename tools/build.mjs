/* Production build: copies the site into dist/ and, for each page (index.html, member.html, public.html), joins its local
   scripts into one minified file and its local stylesheets into one minified file, in the same order as the page lists
   them. Bundle names carry a content hash (build/<page>.<hash>.js|css) so they can be cached for good.
   The source files stay as they are: local development and the tests use them directly (python3 serve.py).
   Run: npm run build   (Vercel runs it on deploy and serves dist/, see vercel.json)

   The scripts are classic scripts sharing globals (window.Club), not modules. Each file is one self-wrapping IIFE with no
   top-level declarations (the build checks this), so they are joined as they are, each inside try/catch: an error in one
   file is rethrown asynchronously (still reported as an uncaught error) and the files after it still run, exactly as
   separate <script> tags behave. The bundle sits where the first script tag was (end of <body>), not deferred, so
   document.readyState and DOMContentLoaded timing are what the source pages see. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PAGES = ['index.html', 'member.html', 'public.html'];
const BUILD_DIR = 'build';                       /* bundles go to dist/build/ */
/* Never copied: build tooling and local-only files. .vercelignore patterns are added below. js/ and css/ are not copied
   either: every page loads only its bundles from build/, which are made from those sources (the check at the end makes
   sure each file a built page or bundle refers to is in dist/). */
const SKIP = new Set(['dist', 'node_modules', 'tools', '.git', '.vercel', '.claude', 'package.json', 'package-lock.json',
  'vercel.json', '.vercelignore', '.gitignore', 'js', 'css', 'shots']);

function ignorePatterns() {
  const f = path.join(ROOT, '.vercelignore');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split(/\r?\n/).map(function (l) { return l.trim(); }).filter(function (l) { return l && !l.startsWith('#'); })
    .map(function (p) {
      const anchored = p.includes('/');                   /* "js/modules/staff.js": from the root; "*.md": any depth */
      const re = p.replace(/^\//, '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
      return new RegExp(anchored ? '^' + re + '(/.*)?$' : '(^|/)' + re + '(/.*)?$');
    });
}
const IGNORE = ignorePatterns();
function ignored(rel) { return SKIP.has(rel.split('/')[0]) || IGNORE.some(function (re) { return re.test(rel); }); }

function copyTree(dir) {
  for (const ent of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir ? dir + '/' + ent.name : ent.name;
    if (ignored(rel)) continue;
    if (ent.isDirectory()) copyTree(rel);
    else if (ent.isFile()) { fs.mkdirSync(path.join(DIST, dir), { recursive: true }); fs.copyFileSync(path.join(ROOT, rel), path.join(DIST, rel)); }
  }
}

function hashOf(text) { return crypto.createHash('sha256').update(text).digest('hex').slice(0, 10); }
function isLocal(u) { return !/^([a-z]+:)?\/\//i.test(u) && !u.startsWith('data:'); }
function readSrc(rel) {
  const f = path.join(ROOT, rel);
  if (!fs.existsSync(f)) throw new Error('Missing file referenced by a page: ' + rel);
  return fs.readFileSync(f, 'utf8');
}

/* ---------- JavaScript ---------- */
/* Each file must be nothing but self-contained statements wrapped in their own function: no top-level const/let/
   function/var (those would change meaning inside try { }). A quick check on the minified output: it has to start with
   "(function" / "(()=>" / "!function" etc. and contain a single top-level statement. */
async function jsBundle(files) {
  const parts = [];
  for (const rel of files) {
    const src = readSrc(rel);
    const out = await esbuild.transform(src, { loader: 'js', minify: true, sourcefile: rel, legalComments: 'none' });
    const code = out.code.trim();
    if (!/^(\(|!|void |"use strict"|'use strict')/.test(code) || /^(const|let|var|function|class)\b/.test(code)) {
      throw new Error(rel + ': expected a self-wrapping IIFE at the top level, found ' + code.slice(0, 40));
    }
    parts.push('try{' + code.replace(/;?$/, ';') + '}catch(e){setTimeout(function(){throw e})}');
  }
  return parts.join('\n') + '\n';
}

/* ---------- CSS ---------- */
/* @import url(...) is inlined where it stands (a mid-file @import would be dropped by the browser once files are
   joined), and relative url()s are rewritten from the source file's folder to the bundle's folder. */
function cssInline(rel, seen) {
  if (seen.has(rel)) return '';
  seen.add(rel);
  const dir = path.posix.dirname(rel);
  let css = readSrc(rel);
  css = css.replace(/@import\s+(?:url\(\s*)?["']?([^"')\s]+)["']?\s*\)?\s*;/g, function (m, u) {
    if (!isLocal(u)) throw new Error(rel + ': external @import is not supported: ' + u);
    return cssInline(path.posix.normalize(path.posix.join(dir, u)), seen);
  });
  /* Quoted strings are matched first so a url() inside one (an SVG data URI's url(%23id)) is left alone. */
  return css.replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|url\(\s*(["']?)([^"')]+)\1\s*\)/g, function (m, q, u) {
    if (u === undefined || !isLocal(u) || u.startsWith('#') || u.startsWith('/')) return m;
    const abs = path.posix.normalize(path.posix.join(dir, u));
    return 'url(' + q + path.posix.relative(BUILD_DIR, abs) + q + ')';
  });
}
async function cssBundle(files) {
  const seen = new Set();
  const joined = files.map(function (rel) { return '/* ' + rel + ' */\n' + cssInline(rel, seen); }).join('\n');
  const out = await esbuild.transform(joined, { loader: 'css', minify: true, legalComments: 'none' });
  return out.code;
}

/* ---------- Pages ---------- */
const SCRIPT_RE = /^[ \t]*<script src="([^"]+)"><\/script>[ \t]*\r?\n/gm;
const STYLE_RE = /^[ \t]*<link rel="stylesheet" href="([^"]+)">[ \t]*\r?\n/gm;

function emit(name, ext, text) {
  const file = BUILD_DIR + '/' + name + '.' + hashOf(text) + '.' + ext;
  fs.mkdirSync(path.join(DIST, BUILD_DIR), { recursive: true });
  fs.writeFileSync(path.join(DIST, file), text);
  return file;
}

/* Replace the first matching tag with `tag` and drop the rest of the local ones; external tags are left alone. */
function replaceTags(html, re, tag) {
  const files = []; let first = true;
  const out = html.replace(re, function (m, u) {
    if (!isLocal(u)) return m;
    files.push(u);
    const indent = m.match(/^[ \t]*/)[0];
    if (first) { first = false; return indent + tag + '\n'; }
    return '';
  });
  return { html: out, files: files };
}

async function buildPage(page) {
  const name = page.replace(/\.html$/, '');
  let html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const report = { page: page };

  const s = replaceTags(html, STYLE_RE, '<link rel="stylesheet" href="__CSS__">');
  const css = await cssBundle(s.files);
  const cssFile = emit(name, 'css', css);
  html = s.html.replace('__CSS__', cssFile);
  report.css = { files: s.files.length, bytes: css.length, file: cssFile };

  const j = replaceTags(html, SCRIPT_RE, '<script src="__JS__"></script>');
  const js = await jsBundle(j.files);
  const jsFile = emit(name, 'js', js);
  html = j.html.replace('__JS__', jsFile);
  report.js = { files: j.files.length, bytes: Buffer.byteLength(js), file: jsFile };

  if (/<script[^>]+src="(?!https?:|\/\/|build\/)/.test(html)) throw new Error(page + ': a local script was left unbundled');
  fs.writeFileSync(path.join(DIST, page), html);
  return report;
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
copyTree('');
for (const page of PAGES) {
  const r = await buildPage(page);
  console.log(r.page + ': ' + r.js.files + ' scripts -> ' + r.js.file + ' (' + Math.round(r.js.bytes / 1024) + ' KB), ' +
    r.css.files + ' stylesheets -> ' + r.css.file + ' (' + Math.round(r.css.bytes / 1024) + ' KB)');
}
if (!fs.existsSync(path.join(DIST, 'robots.txt'))) throw new Error('robots.txt missing from dist/');
/* Every local file a built page (src, href) or bundle (url()) refers to must be in dist/. */
function checkRefs(rel, text, re) {
  const dir = path.posix.dirname(rel);
  let m; while ((m = re.exec(text))) {
    const u = m[1].split(/[?#]/)[0];
    if (!u || !isLocal(u) || u.startsWith('#') || u.startsWith('mailto:') || u.startsWith('tel:') || u.startsWith('javascript:')) continue;
    const target = u.startsWith('/') ? u.slice(1) : path.posix.normalize(path.posix.join(dir, u));
    if (!fs.existsSync(path.join(DIST, target))) throw new Error(rel + ' refers to ' + u + ', which is not in dist/');
  }
}
for (const page of PAGES) checkRefs(page, fs.readFileSync(path.join(DIST, page), 'utf8'), /(?:src|href)="([^"]+)"/g);
for (const f of fs.readdirSync(path.join(DIST, BUILD_DIR)).filter(function (f) { return f.endsWith('.css'); })) {
  /* data: URIs (inline SVG, with url(%23id) inside them) are not files: take them out first. */
  const css = fs.readFileSync(path.join(DIST, BUILD_DIR, f), 'utf8').replace(/url\(\s*(["'])data:[\s\S]*?\1\s*\)/g, '').replace(/url\(\s*data:[^)]*\)/g, '');
  checkRefs(BUILD_DIR + '/' + f, css, /url\(\s*["']?([^"')]+)["']?\s*\)/g);
}
console.log('Built into dist/');
