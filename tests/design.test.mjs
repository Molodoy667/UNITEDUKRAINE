import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

// Render the actual TSX without a browser. This checks structure, not layout or interaction.
const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const cache = new Map();
function loadComponent(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const { outputText } = ts.transpileModule(readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const localRequire = id => {
    if (id.endsWith('.css')) return {};
    if (!id.startsWith('@/') && !id.startsWith('.')) return require(id);
    const target = id.startsWith('@/')
      ? path.join(root, id.slice(2))
      : path.resolve(path.dirname(filename), id);
    return loadComponent(existsSync(`${target}.tsx`) ? `${target}.tsx` : `${target}.ts`);
  };
  const execute = vm.runInNewContext(`(function(require, module, exports) {${outputText}\n})`, {
    window: { location: { pathname: '/', search: '' } }, URLSearchParams,
  }, { filename });
  execute(localRequire, module, module.exports);
  return module.exports;
}

const Home = loadComponent('src/Home.tsx').default;
const Section = loadComponent('src/Section.tsx').default;
const Wiki = loadComponent('src/Wiki.tsx').default;
const home = renderToStaticMarkup(createElement(Home));

test('home keeps the existing identity and original hero asset', () => {
  assert.match(home, /UNITED/);
  assert.match(home, /UKRAINE/);
  assert.match(home, /class="hero-image" src="\/assets\/world-promo\.png"/);
  assert.match(home, /src="\/assets\/logo\.png"/);
  assert.equal((home.match(/<h1\b/g) ?? []).length, 1);
});

test('all internal home anchors resolve and IDs are unique', () => {
  const ids = [...home.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, target] of home.matchAll(/href="#([^"]+)"/g)) {
    assert.ok(ids.includes(target), `Missing anchor #${target}`);
  }
});

test('all referenced local image assets exist', () => {
  for (const [, asset] of home.matchAll(/<img[^>]*src="(\/assets\/[^\"]+)"/g)) {
    assert.ok(existsSync(path.join(root, 'public', asset)), `Missing asset ${asset}`);
  }
});

test('initial server state does not invent live player data', () => {
  assert.match(home, /Оновлення…/);
  assert.doesNotMatch(home, /Сервер онлайн/);
  assert.match(home, /51\.75\.44\.14:2219/);
});

test('home exposes accessible controls and all initial article cards', () => {
  assert.match(home, /aria-controls="primary-navigation" aria-expanded="false"/);
  assert.equal((home.match(/class="news-card"/g) ?? []).length, 3);
  assert.equal((home.match(/class="gallery-card /g) ?? []).length, 3);
  assert.match(home, /aria-label="Оновити статус сервера"/);
  assert.match(home, /role="status"/);
});

test('each existing page and 404 render with a valid skip-link destination', () => {
  for (const section of ['forum', 'wiki', 'donate', 'account', 'contacts', 'terms', 'privacy', 'missing']) {
    const markup = renderToStaticMarkup(createElement(Section, { section }));
    assert.match(markup, /<main id="main-content"/);
    assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
    assert.match(markup, /aria-label="United Ukraine — головна"/);
  }
});

test('wiki renders three accessible category links, size choices and a loading status',()=>{
  const markup=renderToStaticMarkup(createElement(Wiki));
  assert.match(markup,/<main id="main-content"/);
  assert.equal((markup.match(/<h1\b/g)||[]).length,1);
  for(const tab of ['skins','cars','accessories'])assert.ok(markup.includes(`/wiki?tab=${tab}&amp;size=10&amp;page=1`));
  for(const size of [10,50,100])assert.match(markup,new RegExp(`<option value="${size}"`));
  assert.match(markup,/Пошук за ID або назвою/);
  assert.match(markup,/Завантаження каталогу…/);
});
