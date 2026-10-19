import {useRef,useState} from 'react';
import {Check,Copy,Code2} from 'lucide-react';
export function newsIntegration(siteUrl:string|null){
 if(!siteUrl)return null;
 let origin:string;try{const url=new URL(siteUrl);if(url.protocol!=='https:'||url.username||url.password)return null;origin=url.origin;}catch{return null;}
 const endpoint=`${origin}/api/launcher?action=news`;
 const instruction=`Підключення новин UNITED UKRAINE · Electron та Unity

GET ${endpoint}
Відповідь: { "schemaVersion": 1, "news": [...] }
Кожна новина: id (число), title, excerpt, image, url, publishedAt (дата або null).
image — абсолютний HTTPS URL або порожній рядок. url — повна сторінка новини.
Останні 12 опублікованих новин із MySQL, без чернеток і видалених матеріалів.
Порожній news означає, що опублікованих новин немає.

Авторизація й API-ключ не потрібні. Cookie та пароль гравця не надсилайте.
Публічний API та опубліковані завантажені фото підтримують CORS для Unity WebGL.
Оновлення при запуску та кожні 60 секунд, таймаут 10 секунд.
При помилці зберігайте попередній успішний список, не показуйте вигадані новини.
Текст показуйте як текст, не як HTML. Картки UI потрібно підключити у лаунчері.
Якщо використовуєте TextMeshPro, вимкніть richText для тексту з API.
Повний API налаштувань залишається доступним: ${origin}/api/launcher

Нижче виберіть готовий приклад для Electron або Unity.`;
 const electron=`// Modern Electron. Three separate files, not one script.
// main-news.cjs — call registerSiteNews(mainWindow) after app.whenReady(),
// once per app. mainWindow is YOUR existing BrowserWindow.
const { ipcMain, net } = require('electron');
function registerSiteNews(mainWindow) {
  ipcMain.handle('site-news:list', async (event) => {
    if (event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame) {
      throw new Error('Untrusted sender');
    }
    const response = await net.fetch(${JSON.stringify(endpoint)}, {
      signal: AbortSignal.timeout(10000), credentials: 'omit', cache: 'no-store'
    });
    if (!response.ok) throw new Error('News HTTP ' + response.status);
    const data = await response.json();
    if (data.schemaVersion !== 1 || !Array.isArray(data.news)) {
      throw new Error('Invalid news response');
    }
    return data.news.slice(0, 12).map(item => ({
      id: item.id, title: String(item.title || ''),
      excerpt: String(item.excerpt || ''), image: String(item.image || ''),
      url: String(item.url || ''), publishedAt: item.publishedAt || null
    }));
  });
}
module.exports = { registerSiteNews };
// Existing BrowserWindow: contextIsolation:true, nodeIntegration:false.
// Keep it on trusted local UI; block untrusted navigation/new windows.

// preload.cjs — add to YOUR existing preload.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('siteNews', {
  load: () => ipcRenderer.invoke('site-news:list')
});

// renderer.js — #news is a container in your launcher's local HTML.
let loadingNews = false;
async function refreshNews() {
  if (loadingNews) return;
  const container = document.getElementById('news');
  if (!container) return;
  loadingNews = true;
  try {
    const items = await window.siteNews.load();
    const cards = items.map(item => {
      const card = document.createElement('article');
      const title = document.createElement('h3'); title.textContent = item.title;
      const excerpt = document.createElement('p'); excerpt.textContent = item.excerpt;
      const imageUrl = safeHttps(item.image);
      if (imageUrl) {
        const img = document.createElement('img');
        img.src = imageUrl; img.alt = ''; img.loading = 'lazy';
        img.onerror = () => img.remove(); card.append(img);
      }
      card.append(title, excerpt); return card;
    });
    if (!cards.length) {
      const empty = document.createElement('p');
      empty.textContent = 'Новин поки немає'; cards.push(empty);
    }
    container.replaceChildren(...cards);
  } catch (error) { console.warn('News unavailable; previous list retained.'); }
  finally { loadingNews = false; }
}
function safeHttps(value) {
  try { const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
refreshNews();
const newsTimer = setInterval(refreshNews, 60000);
window.addEventListener('beforeunload', () => clearInterval(newsTimer), { once:true });
// Optional Read button: send a validated, allowed-domain HTTPS URL via a
// separate narrow IPC handler. Never expose unrestricted shell or ipcRenderer.`;
 const unity=`// SiteNewsFeed.cs — attach to an active GameObject.
// Uses UnityEngine APIs, NOT .NET Framework/Newtonsoft.Json.
using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Networking;

[Serializable] public class SiteNewsItem {
    public int id;
    public string title, excerpt, image, url, publishedAt;
}
[Serializable] public class SiteNewsResponse {
    public int schemaVersion;
    public SiteNewsItem[] news;
}
public class SiteNewsFeed : MonoBehaviour {
    private const string Endpoint = ${JSON.stringify(endpoint)};
    public SiteNewsItem[] Items { get; private set; } = new SiteNewsItem[0];
    public event Action<SiteNewsItem[]> Changed;
    private Coroutine loop;
    private UnityWebRequest active;

    void OnEnable() { loop = StartCoroutine(Poll()); }
    void OnDisable() {
        if (loop != null) StopCoroutine(loop);
        loop = null;
        if (active != null) { active.Abort(); active.Dispose(); active = null; }
    }

    private IEnumerator Poll() {
        while (true) {
            using (var request = UnityWebRequest.Get(Endpoint)) {
                active = request;
                request.timeout = 10;
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.Success) {
                    SiteNewsResponse data = null;
                    try { data = JsonUtility.FromJson<SiteNewsResponse>(request.downloadHandler.text); }
                    catch (Exception) { Debug.LogWarning("Invalid news JSON; previous list retained."); }
                    if (data != null && data.schemaVersion == 1 && data.news != null) {
                        Items = data.news;
                        Changed?.Invoke(Items);
                    }
                } else { Debug.LogWarning("News unavailable; previous list retained."); }
                active = null;
            }
            yield return new WaitForSecondsRealtime(60f);
        }
    }
}
// Your UI: subscribe to Changed in OnEnable and unsubscribe in OnDisable.
// Render title, excerpt and an empty-state for Items.Length == 0.
// For TextMeshPro: titleLabel.richText = false; descriptionLabel.richText = false.
// image is an absolute URL: fetch via UnityWebRequestTexture.GetTexture(image)
// in your card component. Skip empty image; dispose requests/textures on teardown.
// Handle image/network failure with a placeholder; never discard old news on error.
// url can be opened by Application.OpenURL only after validating HTTPS and domain.
// Native Unity and WebGL: no player login, cookies or API secret required.`;
 return {endpoint,instruction,electron,unity};
}
type Format='instruction'|'electron'|'unity';
export default function NewsIntegration({siteUrl}:{siteUrl:string|null}){
 const [format,setFormat]=useState<Format>('instruction'),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);
 const textarea=useRef<HTMLTextAreaElement>(null),integration=newsIntegration(siteUrl),code=integration?.[format]||'';
 async function copy(urlOnly=false){
  if(!integration)return;setCopied(false);setMessage('');
  try{await navigator.clipboard.writeText(urlOnly?integration.endpoint:code);setCopied(true);setMessage(urlOnly?'Посилання скопійовано.':'Код скопійовано — можна передати розробнику лаунчера.');}
  catch{if(!urlOnly){textarea.current?.focus();textarea.current?.select();}setMessage(urlOnly?'Скопіюйте адресу вище вручну.':'Код виділено — скопіюйте вручну (Ctrl+C).');}
 }
 return <section className="sa-form sa-news-integration" aria-labelledby="news-integration-title"><div className="sa-title"><h3 id="news-integration-title"><Code2 size={20}/>Підключення новин до лаунчера</h3></div><p className="sa-note">Окремий публічний API новин із фото. Виберіть Electron або Unity та скопіюйте код. Основний домен береться зі збережених SEO-налаштувань.</p>{integration?<><div className="sa-integration-url"><code>{integration.endpoint}</code><button type="button" onClick={()=>void copy(true)}><Copy size={14}/>Скопіювати посилання</button></div><label className="sa-code-format">Формат<select value={format} onChange={event=>{setFormat(event.target.value as Format);setMessage('');setCopied(false);}}><option value="instruction">Інструкція та формат API</option><option value="electron">Electron · JavaScript</option><option value="unity">Unity · C# / UnityWebRequest</option></select></label><textarea ref={textarea} className="sa-integration-code" readOnly rows={18} value={code} aria-label="Код підключення новин до лаунчера" spellCheck={false}/><button className="cp-primary" type="button" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>}Скопіювати код</button><small className="sa-note">Це приклади інтеграції: виклик та картки треба підключити у коді вашого лаунчера. Самі проєкти Electron / Unity не змінюються.</small>{message&&<p className={copied?'sa-success':'cp-error'} role="status">{message}</p>}</>:<p className="sa-note" role="status">Код з’явиться після завантаження збережених налаштувань домену.</p>}</section>;
}
