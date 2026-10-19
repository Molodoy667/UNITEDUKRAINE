import {useRef,useState} from 'react';
import {Check,Copy,Code2} from 'lucide-react';
export function newsIntegration(siteUrl:string|null){
 if(!siteUrl)return null;
 let origin:string;try{const url=new URL(siteUrl);if(url.protocol!=='https:'||url.username||url.password)return null;origin=url.origin;}catch{return null;}
 const endpoint=`${origin}/api/launcher`;
 const instruction=`Підключи новини сайту UNITED UKRAINE до лаунчера.

Endpoint: GET ${endpoint}
Формат: application/json. Авторизація та API-ключ не потрібні.
Список новин: кореневе поле news (масив), не launcher.news.

Поля кожної новини:
- title — заголовок;
- excerpt — короткий опис;
- image — абсолютний HTTPS URL зображення або порожній рядок;
- url — абсолютне HTTPS посилання на повну новину;
- publishedAt — дата публікації або null.

Показуй title, excerpt і image у картці; кнопка «Читати» відкриває url.
Повертаються останні 12 опублікованих новин із бази сайту.
Чернетки та видалені новини не повертаються. Порядок масиву зберігай.
Оновлюй при запуску та раз на 60 секунд, таймаут — 10 секунд.
Якщо news порожній — покажи «Новин поки немає».
При HTTP/мережевій/JSON-помилці не вигадуй новини: збережи попередній успішний список і запропонуй повторити запит.
Порожні image та null publishedAt обробляй без помилки.
Не використовуй для цього приватний /api/admin і не передавай пароль чи cookie гравця.
Не відображай отриманий текст як виконуваний HTML.`;
 const csharp=`// .NET Framework 4.8: references System.Net.Http and NuGet Newtonsoft.Json.
using System;
using System.Net.Http;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;

public static class SiteNewsApi
{
    private static readonly HttpClient Client = new HttpClient
    {
        Timeout = TimeSpan.FromSeconds(10)
    };

    public static async Task<JArray> LoadAsync(CancellationToken cancellationToken)
    {
        using (var response = await Client.GetAsync(
            ${JSON.stringify(endpoint)}, cancellationToken).ConfigureAwait(false))
        {
            response.EnsureSuccessStatusCode();
            var json = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            var news = JObject.Parse(json)["news"] as JArray;
            if (news == null)
                throw new FormatException("The API response has no news array.");
            return news;
        }
    }
}

// Call LoadAsync from the launcher, then update UI on its UI thread.
// Card fields: title, excerpt, image, url, publishedAt (nullable).
// Catch errors at the call site; retain the last successful list.
// Empty array means no published news, not a connection error.`;
 return {endpoint,instruction,csharp};
}
export default function NewsIntegration({siteUrl}:{siteUrl:string|null}){
 const [format,setFormat]=useState<'instruction'|'csharp'>('instruction'),[message,setMessage]=useState(''),[copied,setCopied]=useState(false);
 const textarea=useRef<HTMLTextAreaElement>(null),integration=newsIntegration(siteUrl);
 const code=integration?(format==='instruction'?integration.instruction:integration.csharp):'';
 async function copy(urlOnly=false){
  if(!integration)return;setCopied(false);setMessage('');
  try{await navigator.clipboard.writeText(urlOnly?integration.endpoint:code);setCopied(true);setMessage(urlOnly?'Посилання скопійовано.':'Код скопійовано — можна передати розробнику лаунчера.');}
  catch{if(!urlOnly){textarea.current?.focus();textarea.current?.select();}setMessage(urlOnly?'Автоматичне копіювання недоступне. Виділіть адресу вище та скопіюйте вручну.':'Автоматичне копіювання недоступне. Код виділено — скопіюйте вручну (Ctrl+C).');}
 }
 return <section className="sa-form sa-news-integration" aria-labelledby="news-integration-title"><div className="sa-title"><h3 id="news-integration-title"><Code2 size={20}/>Підключення новин до лаунчера</h3></div><p className="sa-note">Готовий код для передачі розробнику лаунчера. Адреса береться зі збереженого основного домену сайту. Це приклад підключення, а не зміна самого лаунчера.</p>{integration?<><div className="sa-integration-url"><code>{integration.endpoint}</code><button type="button" onClick={()=>void copy(true)}><Copy size={14}/>Скопіювати посилання</button></div><label className="sa-code-format">Формат<select value={format} onChange={event=>{setFormat(event.target.value as 'instruction'|'csharp');setMessage('');setCopied(false);}}><option value="instruction">Інструкція для розробника / AI</option><option value="csharp">C# · .NET Framework 4.8</option></select></label><textarea ref={textarea} className="sa-integration-code" readOnly rows={18} value={code} aria-label="Код підключення новин до лаунчера" spellCheck={false}/><button className="cp-primary" type="button" onClick={()=>void copy()}>{copied?<Check size={16}/>:<Copy size={16}/>}Скопіювати код</button><small className="sa-note">C# потребує Newtonsoft.Json. Отримання JSON не додає картки автоматично: виклик та відображення потрібно підключити в коді лаунчера.</small>{message&&<p className={copied?'sa-success':'cp-error'} role="status">{message}</p>}</>:<p className="sa-note" role="status">Код з’явиться після завантаження збережених налаштувань домену.</p>}</section>;
}
