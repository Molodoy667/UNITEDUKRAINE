# Android resource release API — Manager United

Дата: 21 жовтня 2026, Europe/Bucharest. Репозиторій сайту: `Molodoy667/UNITEDUKRAINE`.

## 1. Фактична готовність

| Частина | Статус |
| --- | --- |
| Код API, MySQL persistence, динамічний Project/info.json | Підготовлено й перевірено локально; публічний результат перевіряється окремо після деплою |
| Автентифікація, CAS, replay/recovery, перевірка двох CDN JSON | Перевірено локальними тестами |
| Міграція 012 | Пройшла в окремій тимчасовій MariaDB 11.4, не в робочій БД |
| Перевірка реальних CDN-манифестів новим SHA-256 verifier | Пройшла read-only, без активації та без робочої БД |
| Серверний секрет у Vercel / Manager | Ключ згенеровано на запит власника; внесення у Vercel і Manager ще не перевірене. Значення не збережене в коді чи цьому документі |
| Commit/push нового API | Власник погодив; фактичний результат перевіряється за Git |
| Production deployment / міграція | Потребують окремого підтвердження після push; успішний Git push сам по собі їх не доводить |
| Інтеграція C# Manager / APK | Не змінювалися; підключаються в клієнтському чаті за цим контрактом |
| Робоча активація 288→289 | **Не виконувалася**; реальну версію заради тестів не підвищували |

Власник окремо погодив commit/push цього API. Цей документ — контракт перевіреного коду, а не твердження про готовий production endpoint без публічної перевірки.

## 2. Підтверджений baseline і вибір каналу

Read-only перевірка основного домену 21.10.2026 (UTC timestamp відповіді 20.10 23:06:18) підтвердила `/Project/info.json`:

- `1.7.6.released = true`, `0.0.0.released = true`.
- Обидві мають `Android.resourcesVersion = 288`, `Android.version = "1.7.5"`.
- Спільний CDN: `https://pub-713bd1fbe95b48e2bf632fed4e16a48a.r2.dev/game/1.8.9.4`.
- Server 1: `51.75.44.14:2219`; ігровий endpoint, CDN і версії APK/iOS/Windows у цій задачі не змінено.

Явно узгоджена серверна політика `android-main` змінює **тільки** `Android.resourcesVersion` у цих двох гілках. BRANCHES сортовано: `["0.0.0","1.7.6"]`. Manager не передає власний список гілок або URL для скачування сервером.

Поточний `policyId` (публічний відбиток політики, **не секрет**):
`1af4fe3b15530b2b542d10ad47f2e046217e49800715949119d13b0d34f88312`.
Клієнт завжди бере його зі state, не хардкодить.

Нова активна гілка з тим самим CDN, відсутність/вимкнення однієї погодженої гілки, зміна її CDN або різні resourcesVersion блокують активацію до явної зміни політики оператором. Гілки з іншим CDN не підвищуються. Незнайомі поля конфігурації зберігаються.

Вихідні SHA-256 **байтів** CDN, прочитаних разом із baseline 288:

| Маніфест | Розмір | SHA-256 |
| --- | --- | --- |
| `Android/files.json` | 4130829 | `b3f2c180cbcd1853857d18a714ef0e9bbc1e80bb6baf810c632100de367430ed` |
| `Android/archives.json` | 5550 | `bef7a9749ddf59f2688a26c23283a0b2d2f9b000a9a57b9c59f47a9faaca1828` |

Це спостереження на момент перевірки, не гарантія незмінності R2 надалі. До першого production-деплою повторно порівняти живий конфіг з `data/launcher/project-info.seed.json` та baseline маніфестів; якщо їх окремо змінили, не ініціалізувати БД старою версією 288 без узгодженого нового baseline.

## 3. Адреси та автентифікація

Основний origin: `https://united-rp.com.ua`.

| Метод | Точний шлях | Призначення |
| --- | --- | --- |
| GET | `/api/android-resources/state` | Поточний канал, версія, політика та активні хеші |
| POST | `/api/android-resources/activate` | Атомарна активація наступного номера після передачі |
| GET | `/api/android-resources/publications/{publicationId}` | Відновлення результату після timeout/перезапуску |
| GET / HEAD | `/Project/info.json` | Публічний конфіг для поточного Android-клієнта |

Усі три приватні маршрути вимагають:

```http
Authorization: Bearer <окремий секрет видавця>
Accept: application/json
```

Для POST додатково `Content-Type: application/json; charset=utf-8`. Authorization — тільки HTTP header, не query/body, не cookie, не ключ R2. HTTPS обов'язковий. Під Vercel перевіряється ingress `x-forwarded-proto: https`; Manager не встановлює цей заголовок сам. Browser Origin заборонений, CORS приватним методам не надається. Права видавця обмежені цим каналом, немає довільного SQL, керування користувачами або встановлення довільної версії.

Приватні відповіді завжди JSON UTF-8, `Cache-Control: no-store`, `CDN-Cache-Control: no-store`, `Vercel-CDN-Cache-Control: no-store`, `nosniff`. Не логувати Authorization чи повні request headers у Manager/проксі. Публікаційний журнал зберігає лише UUID, відбитки, версії та результат, не токен.

## 4. GET state

HTTP 200, приклад baseline (значення в реальному state можуть бути новішими):

```json
{
  "schemaVersion":1,
  "channel":"android-main",
  "policyId":"1af4fe3b15530b2b542d10ad47f2e046217e49800715949119d13b0d34f88312",
  "branches":["0.0.0","1.7.6"],
  "cdn":"https://pub-713bd1fbe95b48e2bf632fed4e16a48a.r2.dev/game/1.8.9.4",
  "resourcesVersion":288,
  "configRevision":1,
  "manifests":{
    "files":"https://pub-713bd1fbe95b48e2bf632fed4e16a48a.r2.dev/game/1.8.9.4/Android/files.json",
    "archives":"https://pub-713bd1fbe95b48e2bf632fed4e16a48a.r2.dev/game/1.8.9.4/Android/archives.json",
    "filesSha256":"b3f2c180cbcd1853857d18a714ef0e9bbc1e80bb6baf810c632100de367430ed",
    "archivesSha256":"bef7a9749ddf59f2688a26c23283a0b2d2f9b000a9a57b9c59f47a9faaca1828"
  },
  "verification":{"manifests":"cdn-sha256-on-activation","assets":"publisher-attested"}
}
```

Читання state нічого не активує. Хеші у state — відбитки **останньої активованої пари** (на першому запуску baseline), а не нове сканування всіх R2-об'єктів. Manager повинен перевірити, що вибрані bucket/prefix відповідають саме цьому CDN; ключі бакета самі по собі цього не доводять.

## 5. POST activate

JSON містить **рівно** такі поля:

```text
{
  publicationId: lowercase UUID v4,
  channel: "android-main",
  expectedVersion: integer зі state,
  policyId: 64 lowercase hex зі state,
  filesSha256: SHA-256 точних завантажених bytes Android/files.json, 64 lowercase hex,
  archivesSha256: SHA-256 точних завантажених bytes Android/archives.json, 64 lowercase hex,
  uploadCompleted: true
}
```

`expectedVersion` від 0 до 2147483646; нове значення завжди `expectedVersion + 1`. Окремого поля довільної newVersion немає. Загальний JSON-body до 4096 байтів. SHA-256 — не MD5 ресурсів із манифестів, не ETag R2, не хеш повторно серіалізованого JSON: хешувати **саме byte[]**, які передані в R2, з тими самими BOM/пробілами/переносами.

HTTP 200:

```text
{
  publication: {
    publicationId, channel, branches, policyId,
    fingerprint: 64 lowercase hex серверного canonical request,
    previousVersion: 288,
    resourcesVersion: 289,
    configRevision: 2,
    filesSha256, archivesSha256,
    verification: { manifests: "cdn-sha256", assets: "publisher-attested" },
    activatedAt: ISO-8601 UTC timestamp
  },
  replayed: false
}
```

288→289 тут лише приклад контракту, **не проведена робоча активація**. Повтор з тим самим publicationId і тими самими полями повертає той самий `publication`, але `replayed:true`. Результат не змінюється навіть після наступних релізів або зміни доступності CDN. Для перевірки актуального номера після replay окремо читати state/публічний конфіг.

Порядок полів та whitespace request JSON не впливають на idempotency. Зміна UUID, expectedVersion, policyId чи будь-якого хешу — інший запит. Той самий UUID з іншим payload відхиляється, не перепризначається. Журнал успіхів не має автоматичного TTL.

## 6. GET publication та відновлення

Для збереженого UUID HTTP 200:

```text
{ found: true, publication: { ...точно той самий результат активації... } }
```

Якщо committed-запису немає — HTTP 404:

```json
{"error":"publication_not_found","message":"No committed activation exists for this publicationId. Retry the original request, not a new ID."}
```

404 може означати відсутність успіху **на момент читання**, а не гарантоване завершення паралельного POST. Алгоритм після timeout/скасування мережевого очікування/HTTP 503:

1. Залишити збережені publicationId і **точний початковий payload**. Не генерувати новий ID і не підставляти свіжий expectedVersion.
2. GET publications/{id}. Якщо found — використати результат, звірити hashes/channel/UUID, потім state і `/Project/info.json`.
3. Якщо 404 — повторити **той самий** POST з тим самим UUID/payload. Сервер дочекається lock і поверне replay, якщо перший POST встиг commit.
4. При недоступному API залишити pending activation на диску, показати «активація не підтверджена», не «реліз завершено». Повторити відновлення після перезапуску.
5. `version_conflict` не лікувати автоматично новим ID/версією: могла пройти чужа публікація. Повторно прочитати стан, перевірити хмарні манифести й рішення оператора; не активувати старий/змішаний набір поверх чужого.

## 7. Правильна послідовність у Manager

```text
ручний MD5 → semantic Changed(plan)?
  ні: завершити без activate
  так: GET state → звірити канал/CDN → durable publicationId + plan
       → Android/files/* → Android/archives.json → Android/files.json
       → зберегти ready-to-activate payload з SHA-256 обох byte[]
       → POST activate → GET/відновлення результату → перевірка публічного info.json
```

До активації всі передачі мають бути успішними. Відкриття вікна, MD5, порівняння, відсутність змін, відмова користувача, скасування до завершення передач і помилка завантаження **не викликають activate**. `uploadCompleted:true` — явне свідчення видавця; API не може перевірити, яку кнопку натиснули в Manager. Сервер додатково відхиляє пару хешів, уже активну для цього каналу (`no_resource_changes`), але не замінює semantic Changed(plan) на стороні Manager: зміна форматування JSON сама по собі змінює байтовий hash.

Перед POST зберегти pending-файл атомарно. Після початку POST cancellation/timeout вже не означають rollback сервера. Не підвищувати `Android.version` або `build-info.json`: Android v17 використовує лише числове resourcesVersion із Project/info.json. Публічна версія, рівна або більша за отриману activatedVersion у **всіх** погоджених гілках, підтверджує видимість сигналу; більша може означати пізніший реліз.

## 8. Мінімальні фрагменти для C# / System.Text.Json

Секрет надходить із окремого захищеного налаштування Manager (Windows Credential Manager/DPAPI або еквівалент), не з literal у коді. У прикладі немає його значення.

```csharp
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

static string Sha256(byte[] bytes) =>
    Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();

using var http = new HttpClient {
    BaseAddress = new Uri("https://united-rp.com.ua"),
    Timeout = TimeSpan.FromSeconds(60)
};
http.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", publisherToken);
http.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

// GET and validate HTTP status/Content-Type before reading required fields.
using var stateResponse = await http.GetAsync("/api/android-resources/state", cancellationToken);
stateResponse.EnsureSuccessStatusCode();
using var state = JsonDocument.Parse(await stateResponse.Content.ReadAsStringAsync(cancellationToken));
var publicationId = Guid.NewGuid().ToString("D").ToLowerInvariant();
var payload = new {
    publicationId,
    channel = state.RootElement.GetProperty("channel").GetString(),
    expectedVersion = state.RootElement.GetProperty("resourcesVersion").GetInt32(),
    policyId = state.RootElement.GetProperty("policyId").GetString(),
    filesSha256 = Sha256(uploadedFilesBytes),
    archivesSha256 = Sha256(uploadedArchivesBytes),
    uploadCompleted = true
};
var payloadJson = JsonSerializer.Serialize(payload);
// Persist this exact payloadJson atomically; execute POST ONLY after all uploads succeed.
using var content = new StringContent(payloadJson, Encoding.UTF8, "application/json");
using var activationResponse = await http.PostAsync(
    "/api/android-resources/activate", content, CancellationToken.None);
var responseJson = await activationResponse.Content.ReadAsStringAsync();
// Parse JSON error codes even for non-2xx. On uncertain result keep original payload/id.

// Recovery after restart: load the saved id/payload, never create a new id here.
using var lookup = await http.GetAsync(
    "/api/android-resources/publications/" + Uri.EscapeDataString(savedPublicationId));
// 200 => immutable committed result. 404 => retry saved POST unchanged, not a new version.
```

Це фрагменти контракту, не готова заміна GameReleasePublisher.cs; змінні й атомарне зберігання плану інтегрує клієнтський чат. Не використовувати `EnsureSuccessStatusCode` для activate до зчитування JSON помилки, інакше загубиться код конфлікту.

## 9. Помилки

Усі помилки — JSON `{error,message}`, не HTML і не exception stack. Логіку будувати за `error`, не текстом message.

| HTTP | error | Дія Manager |
| --- | --- | --- |
| 400 | `https_required`, `invalid_json`, `invalid_fields`, `invalid_publication`, `invalid_publication_id` | Виправити протокол/поля; не активовано |
| 401 | `unauthorized` | Перевірити окремий publisher token |
| 403 | `browser_origin_forbidden` | Не викликати з браузерного frontend |
| 404 | `publication_not_found` | Відновити за тим самим payload/id; див. вище |
| 404 | `not_found` | Невідомий маршрут |
| 405 / 415 / 413 | `method_not_allowed` / `json_required` / `body_too_large` | Правильний метод, JSON, до 4096 байтів |
| 409 | `version_conflict` | Інший publisher змінив версію; зупинити автоматичне підвищення |
| 409 | `publication_id_conflict` | Той самий UUID з іншим payload; не перепризначати його |
| 409 | `policy_conflict` | Перечитати state/перевірити зміну каналу |
| 409 | `no_resource_changes` | Пара hashes уже активна; не робити штучний bump |
| 409 | `manifest_hash_mismatch` | CDN не повернув передані bytes; версія не змінена |
| 502 | `manifest_unavailable`, `manifest_too_large`, `invalid_manifest` | Не вдалося підтвердити JSON із CDN; виправити маніфести/доступність |
| 503 | `publisher_unconfigured` | Оператор має налаштувати секрет |
| 503 | `release_unconfigured`, `channel_unconfigured`, `channel_policy_changed`, `channel_versions_diverged` | Виправити міграцію/серверну конфігурацію, не обхід CAS |
| 503 | `verification_failed`, `release_unavailable` | Стан запиту може бути невизначеним: lookup/retry original id |

Серверний timeout мережі/SQL також може дати generic 503. Без журналу невдалих спроб lookup доводить лише committed-успіх; 404 не доводить відсутність ще активного POST.

## 10. MySQL і атомарність

`migrations/012_android_resource_releases.sql` створює лише 3 окремі InnoDB-таблиці:

- `site_launcher_config`: повний Project config, revision, updated_at; один row `id=1`.
- `site_android_release_channels`: відбиток останньої активної пари manifests.
- `site_android_publications`: immutable ledger publicationId, channel, fingerprint, previous/new version, hashes, result, timestamp; UNIQUE(channel,resourcesVersion).

`lib/resource-release/seed.js` ініціалізує baseline один раз під migration lock. Повторний deploy не перезаписує конфіг/версії/хеші; відсутність channel row біля вже існуючого config — помилка, не прихований reset. Застосовується наявним `forum:migrate` / `deploy:build`; секрет видавця для міграції не потрібен. Ігрові баланси/таблиці не змінюються.

POST: transaction → config `FOR UPDATE` → idempotency lookup → policy/CAS/last hashes → перевірка CDN → update обох branches і channel hashes → insert ledger → commit. Збій ledger відкочує попередні update. Два конкурентні ID з одним expectedVersion не можуть обидва пройти. Повтор успішного UUID перевіряється **до** поточної версії й нового звернення до CDN.

`data/launcher/project-info.seed.json` — точна копія колишнього статичного JSON лише для початкової ініціалізації. `public/Project/info.json` прибрано з build-статики, щоб він не перекрив rewrite. Публічний URL лишається **той самий**, але тепер читає MySQL. Не створювати static файл знову. Для зміни інших полів потрібен окремий контрольований процес/міграція: правка seed після ініціалізації не є редактором production-конфіга.

Якщо БД недоступна, public config повертає JSON 503 — **не** старий 288. Інакше клієнти могли б отримати неправдивий відкат. Усюди `no-store`, включно з CDN-заголовками, без application cache. Збережений до цього статичний Cloudflare cache rule «cache everything» може ігнорувати заголовки: після деплою перевірити Age/Content-Type/живий номер і, якщо потрібно, очистити саме URL у Cloudflare. Це не зроблено в цій задачі.

Не відкочувати сайт до попередньої збірки зі static info.json після першого bump: вона могла б знову роздати 288. Відкат коду має зберігати dynamic config path. Резервувати й відновлювати config, channel і ledger разом; не обрізати ledger і не знижувати номер самостійно.

## 11. Межі довіри R2

Сайт робить GET **тільки** двох pinned HTTPS URL зі state, додає `?release={publicationId}` для обходу старого edge cache, `Cache-Control:no-cache`, забороняє redirects, таймаут 8 секунд на запит, обмеження 16 MiB на кожний JSON. Пара читається паралельно. Перевіряються byte SHA-256, valid UTF-8 JSON, `files.list` як array та archives як object. URL користувача ніколи не fetch-иться. Локально й read-only на реальному CDN verifier пройшов.

Це **не** перевірка MD5 кожного ZIP/ресурсу, змісту архівів або повної семантичної узгодженості manifests. `assets:"publisher-attested"` прямо позначає межу: Manager відповідає за всі assets і успішне завершення передач. Пара manifest GET не є multi-object snapshot R2; зовнішній writer може змінити CDN після перевірки. CAS захищає **версію в БД**, а не взаємні перезаписи in-place ресурсів двома Manager. До versioned/immutable release-prefix або окремого upload lease треба запускати одного видавця й не переписувати активний набір паралельно. Навіть «version last» не запобігає клієнту, який читає змінювані assets під старою версією під час передачі.

## 12. Налаштування секрету і публікація

1. Згенерувати окремі 32 криптографічно випадкові байти, закодувати **64 lowercase hex**. Не використовувати пароль БД, R2 secret чи FORUM_IP_SECRET. Значення не надсилати в чат і не додавати в Git.
2. Vercel → UNITEDUKRAINE → Settings → Environment Variables: ім'я **`ANDROID_RESOURCE_PUBLISH_TOKEN`**, значення новий токен, sensitive, Production. **Без `VITE_`/`NEXT_PUBLIC_` префікса.** Preview — лише з окремими тестовою БД і токеном; не давати preview право активувати production.
3. Той самий токен внести у захищене налаштування **настільного Manager**, не APK/лаунчера/сайтового frontend і не незашифрований settings.json. Не додавати його у command-line аргументи або журнал HTTP.
4. Перевірити актуальний production baseline, зробити резервну копію БД й погодити commit/push/deploy. Штатний `deploy:build` застосує 012 і initialize config, **не bump**. Нових JS Vercel functions немає — усі маршрути використовують існуючий `api/launcher.js`, загалом 12.
5. Дочекатись успішного deployment, перевірити `/Project/info.json` (усі інші поля збережені, version ще 288 якщо не було іншого погодженого релізу). Без token state має бути JSON 401, а якщо token не налаштований — 503 `publisher_unconfigured`, не HTML.
6. Авторизований GET state і GET publications/{новий випадковий UUID} — без підвищення версії. За потреби повну активацію перевірити у staging із відокремленою БД/манифестами, не на production заради тесту.
7. Реальний production POST — тільки для справжнього завершеного Android-релізу після інтеграції Manager. Звірити success, state, публічний config і після цього поведінку телефона.

Ротація — новий окремий token у Vercel і Manager, redeploy; старий після повного перемикання deployment більше не працює. Токен не прив'язаний до хешу result і не записаний у журнал, тому старі publicationId доступні з новим авторизованим token. Під час rolling deployment можливі старі інстанси зі старим token — не починати активацію до завершення перемикання.

## 13. Перевірки

- `npm run test:resource-release`: 6 unit/HTTP-contract/manifest/security тестів.
- `npm run test:resource-release:integration`: 11 перевірок (включно з parent test) у disposable loopback MariaDB: 288 baseline, незмінність game rows, невиконана передача/unchanged, CDN mismatch, обидві branches, restart recovery, concurrent same/different IDs, fingerprint collision, чужий канал, повтор seed, audit failure rollback, real HTTP.
- `npm run test:online` — 8; `npm run test:discord` — 8; `node tests/design.test.mjs` — 17; CMS integration — 10; knowledge integration — 14. Усі пройшли. TypeScript/Vite build пройшов; dist не містить static Project/info.json.
- Реальні CDN GET новим verifier пройшли з baseline hashes, без робочої БД й без activate. Production API/secret/migration та фактична C#-інтеграція **ще не перевірені**. Раніше зафіксований незалежний збій форумного mail-outbox тесту цим завданням не досліджувався і не виправлявся.

Тести БД ніколи не читають робочий .env; використовують явно вказаний loopback порт, окрему випадкову `roulette_test_<hex>` БД і прибирають її після завершення. Клієнтські GameManifestWindow.cs, GameReleasePublisher.cs, MANIFESTS-PC-ANDROID.md та APK не редагувалися.
