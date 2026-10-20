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
    window: { location: { pathname: '/', search: '' } }, URLSearchParams,URL,
  }, { filename });
  execute(localRequire, module, module.exports);
  return module.exports;
}

const Home = loadComponent('src/Home.tsx').default;
const Section = loadComponent('src/Section.tsx').default;
const Wiki = loadComponent('src/Wiki.tsx').default;
const {ForbesBoard} = loadComponent('src/Forbes.tsx');
const ControlPanel=loadComponent('src/admin/ControlPanel.tsx').default;
const AdminHub=loadComponent('src/admin/AdminHub.tsx').default;
const {SettingsForm,DocumentEditor}=loadComponent('src/admin/ContentAdmin.tsx');
const {default:NewsIntegration,newsIntegration}=loadComponent('src/admin/NewsIntegration.tsx');
const {DifferenceView,ChangeEditor,ChangeJournal}=loadComponent('src/admin/ChangeTools.tsx');
const {default:PagePreloader,BootPreloaderReady}=loadComponent('src/ui/PagePreloader.tsx');
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

test('home exposes accessible controls without inventing database news', () => {
  assert.match(home, /aria-controls="primary-navigation" aria-expanded="false"/);
  assert.equal((home.match(/class="news-card"/g) ?? []).length, 0);
  assert.match(home,/Завантажуємо новини/);
  assert.match(home,/Посилання ще не задане/);
  assert.equal((home.match(/class="gallery-card /g) ?? []).length, 3);
  assert.match(home, /aria-label="Оновити статус сервера"/);
  assert.match(home, /role="status"/);
});

test('administration has four functional modules including knowledge base',()=>{
 const markup=renderToStaticMarkup(createElement(AdminHub,{catalog:null,csrf:'test'}));
 for(const label of ['Управління сервером','SEO та статичні сторінки','API та новини','База знань'])assert.ok(markup.includes(label));
 assert.equal((markup.match(/aria-pressed="false"/g)||[]).length,4);
 assert.doesNotMatch(markup,/<button disabled="" aria-pressed="false"/);
});

test('CMS retains SEO and news/photo editors without launcher settings controls',()=>{
 const settings={value:{siteName:'United',title:'United',description:'Description',keywords:'RP',siteUrl:'https://example.test',image:''},version:1};
 const form=renderToStaticMarkup(createElement(SettingsForm,{group:'seo',title:'SEO',setting:settings,csrf:'test',onRefresh:()=>{}}));
 assert.match(form,/SEO-заголовок головної/);assert.match(form,/Зберегти налаштування/);
 const source=readFileSync(path.join(root,'src/admin/ContentAdmin.tsx'),'utf8');
 assert.doesNotMatch(source,/sa-launcher-settings|group="launcher"|key: 'resourcesEnabled'|Налаштування Launcher API/);
 const hub=renderToStaticMarkup(createElement(AdminHub,{catalog:null,csrf:'test'}));
 assert.match(hub,/Новини з фото та API для Electron і Unity/);assert.doesNotMatch(hub,/Налаштування лаунчера/);
 const editor=renderToStaticMarkup(createElement(DocumentEditor,{initial:null,kind:'news',csrf:'test',onSaved:()=>{},onClose:()=>{}}));
 for(const label of ['SEO-заголовок','SEO-опис','Категорія','Короткий опис','Опублікувати на сайті','Зберегти чернетку'])assert.ok(editor.includes(label));
 assert.match(editor,/maxlength="30000"/i);
 assert.match(editor,/type="file" accept="image\/png,image\/jpeg,image\/webp"/);
 assert.match(editor,/Завантажити фото з комп’ютера/);
});

test('news integration handoff uses the saved domain, actual public DTO and copy controls',()=>{
 const snippets=newsIntegration('https://united.example.test');assert.equal(snippets.endpoint,'https://united.example.test/api/launcher?action=news');
 for(const field of ['title','excerpt','image','url','publishedAt'])assert.ok(snippets.instruction.includes(field));
 assert.match(snippets.unity,/JsonUtility.FromJson<SiteNewsResponse>/);assert.match(snippets.unity,/UnityWebRequest.Get/);assert.match(snippets.unity,/request.timeout = 10/);assert.match(snippets.unity,/WaitForSecondsRealtime\(60f\)/);
 assert.match(snippets.electron,/net.fetch/);assert.match(snippets.electron,/contextBridge.exposeInMainWorld/);assert.match(snippets.electron,/AbortSignal.timeout\(10000\)/);assert.doesNotMatch(snippets.electron,/innerHTML\s*=/);
 new vm.Script(snippets.electron); // Syntax only; no Electron runtime is invoked.
 assert.equal(newsIntegration(null),null);assert.equal(newsIntegration('javascript:alert(1)'),null);
 const markup=renderToStaticMarkup(createElement(NewsIntegration,{siteUrl:'https://united.example.test'}));
 for(const label of ['Підключення новин до лаунчера','Скопіювати посилання','Скопіювати код','Electron · JavaScript','Unity · C# / UnityWebRequest'])assert.ok(markup.includes(label));
 assert.match(markup,/<textarea[^>]*readOnly=""/);assert.match(markup,/https:\/\/united.example.test\/api\/launcher/);
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
  assert.match(markup,/Завантажуємо твій світ…/);
});

test('shared preloader preserves the account logo/orbit, status and reduced-motion support',()=>{
 const inline=renderToStaticMarkup(createElement(PagePreloader)),screen=renderToStaticMarkup(createElement(PagePreloader,{fullscreen:true}));
 assert.match(inline,/class="site-preloader" role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(inline,/src="\/assets\/logo.png" alt="" width="36" height="45"/);assert.match(inline,/Завантажуємо твій світ…/);
 assert.match(screen,/site-preloader-screen/);assert.equal(renderToStaticMarkup(createElement(BootPreloaderReady)),'');
 const css=readFileSync(path.join(root,'public/preloader.css'),'utf8');assert.match(css,/width:95px;height:95px/);assert.match(css,/2s linear infinite/);assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('all pages share boot/lazy/data preloaders without introducing artificial delays or removing SSR content',()=>{
 const html=readFileSync(path.join(root,'index.html'),'utf8'),entry=readFileSync(path.join(root,'src/main.tsx'),'utf8');
 assert.match(html,/href="\/preloader.css"/);assert.match(html,/id="site-boot-preloader"/);assert.match(html,/<div id="root"><\/div>/);assert.match(html,/<noscript><style>#site-boot-preloader\{display:none\}/);
 assert.match(entry,/<BootPreloaderReady\/>/);assert.match(entry,/<Suspense fallback=\{<PagePreloader fullscreen\/>\}>/);assert.doesNotMatch(entry,/fallback=\{<p/);
 for(const page of ['src/Account.tsx','src/Roulette.tsx','src/Wiki.tsx','src/Forbes.tsx','src/Home.tsx','src/site/ContentPage.tsx','src/forum/ui.tsx'])assert.match(readFileSync(path.join(root,page),'utf8'),/<PagePreloader(?: fullscreen)?\/>/,page);
 const component=readFileSync(path.join(root,'src/ui/PagePreloader.tsx'),'utf8');assert.doesNotMatch(component,/setTimeout|setInterval/);assert.match(component,/getElementById\('site-boot-preloader'\)\?\.remove\(\)/);
});

test('Forbes navigation, real podium markup and ten table positions have accessible semantics',()=>{
  assert.match(home,/href="\/forbes"/);
  const players=Array.from({length:13},(_,i)=>({id:i+1,rank:i+1,nickname:`Test_Player_${i+1}`,skinId:223,wealth:String(6280000000-i*1000000)}));
  const markup=renderToStaticMarkup(createElement(ForbesBoard,{data:{basis:'cash_plus_bank',limit:13,updatedAt:new Date(0).toISOString(),players},skins:new Map([[223,'/wiki/skins/223.png']])}));
  for(const label of ['Перше місце — Test_Player_1','Друге місце — Test_Player_2','Третє місце — Test_Player_3'])assert.ok(markup.includes(label));
  assert.equal((markup.match(/class="fb-player-skin"/g)||[]).length,3);assert.equal((markup.match(/<tr>/g)||[]).length,11);assert.match(markup,/<table class="fb-ranking-table"/);assert.match(markup,/Test_Player_13/);assert.match(markup,/6[^\d]*280[^\d]*000[^\d]*000/);
  const css=readFileSync(path.join(root,'src/forbes/forbes.css'),'utf8');assert.match(css,/\.fb-place-1\{grid-column:2/);assert.match(css,/\.fb-place-2\{grid-column:1/);assert.match(css,/\.fb-place-3\{grid-column:3/);
});
test('Forbes empty and incomplete rankings do not invent users or skin previews',()=>{
  const render=players=>renderToStaticMarkup(createElement(ForbesBoard,{data:{basis:'cash_plus_bank',limit:13,updatedAt:new Date(0).toISOString(),players},skins:new Map()}));
  const empty=render([]);assert.match(empty,/Перша історія ще попереду/);assert.doesNotMatch(empty,/<tbody>|fb-player-skin/);
  const single=render([{id:1,rank:1,nickname:'Only_Player',skinId:99999,wealth:'1000'}]);assert.equal((single.match(/fb-vacant/g)||[]).length,2);assert.match(single,/СКІН #99999/);assert.doesNotMatch(single,/<img/);
});

test('game control panel exposes six real-data sections, request journal and honest execution/AI labels',()=>{
  const markup=renderToStaticMarkup(createElement(ControlPanel,{catalog:null}));
  assert.match(markup,/Панель керування/);assert.equal((markup.match(/class="cp-module"/g)||[]).length,6);
  for(const label of ['Гравці','Гравці онлайн','Будинки','Бізнеси','Автомобілі','Квартири','Найбагатші гравці','Вільні будинки','AI-помічник'])assert.ok(markup.includes(label));
  assert.match(markup,/ЕТАП 3 · СИНХРОНІЗАЦІЯ/);assert.match(markup,/ЗАПЛАНОВАНО/);assert.match(markup,/Прямий SQL-доступ закритий/);
  assert.doesNotMatch(markup,/Private-Test-Password|players_password|Видалити гравця/);
});

test('change editor and journal distinguish stored requests from game execution; diff escapes injected names',()=>{
  const editor=renderToStaticMarkup(createElement(ChangeEditor,{detail:{entity:'houses',item:{id:1,name:'House'},version:'test',editable:false,proposalFields:{name:{label:'Назва',kind:'text',maxLength:20}}},csrf:'test-csrf',onSaved:()=>{},onAuthError:()=>{}}));
  assert.match(editor,/Підготувати зміни/);assert.match(editor,/без прямого запису в гру/);assert.doesNotMatch(editor,/test-csrf|Зміни застосовано/);
  const diff=renderToStaticMarkup(createElement(DifferenceView,{changes:{name:{before:'<script>alert(1)</script>',after:'New House'}}}));
  assert.match(diff,/Було/);assert.match(diff,/Стане після застосування/);assert.match(diff,/&lt;script&gt;/);assert.doesNotMatch(diff,/<script>/);
  const journal=renderToStaticMarkup(createElement(ChangeJournal,{csrf:'test',revision:0,onAuthError:()=>{}}));assert.match(journal,/aria-expanded="false"/);assert.match(journal,/Заявки та журнал дій/);
});

test('knowledge post editor previews escaped plain text and exposes category/order/client/publication controls',()=>{
 const {KnowledgePostEditor}=loadComponent('src/admin/KnowledgeAdmin.tsx');
 const markup=renderToStaticMarkup(createElement(KnowledgePostEditor,{item:{id:261,category_id:1,client:'pc',title:'<img src=x>',content:'Рядок 1\r\n<script>alert(1)</script>',position:7,published:false,version:1,deleted_at:null},categories:[{id:1,parent:0,title:'Основи гри',published:true}],csrf:'never-render-this-secret',onClose(){},onSaved(){},onWorking(){}}));
 for(const label of ['Попередній перегляд','Категорія','Порядок','Клієнт','Опублікувати статтю','Зберегти чернетку'])assert.ok(markup.includes(label),label);
 assert.match(markup,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);assert.doesNotMatch(markup,/<script>|<img src=x>|never-render-this-secret/);
 assert.match(markup,/Рядок 1\r\n/);assert.match(readFileSync(path.join(root,'src/admin/knowledge-admin.css'),'utf8'),/white-space:pre-wrap/);
});
