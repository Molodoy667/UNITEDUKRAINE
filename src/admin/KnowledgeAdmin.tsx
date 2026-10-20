import { useEffect, useRef, useState, type FormEvent } from 'react';
import { BookOpen, Check, Copy, Eye, FilePlus2, FolderPlus, LoaderCircle, Pencil, RefreshCw, Save, Search, Trash2, Undo2, X } from 'lucide-react';
import { adminRead, adminWrite, AdminError, type AdminWriteAction } from './client';
import { createKnowledgeRetry, UnresolvedKnowledgeWrite } from './knowledge-retry';
import './knowledge-admin.css';
type Category = {
    id: number;
    parent: number;
    title: string;
    position: number;
    published: boolean;
    deleted_at: string | null;
    version: number;
    postCount: number;
    childCount: number;
};
type Post = {
    id: number;
    category_id: number;
    client: 'all' | 'pc';
    title: string;
    content: string;
    position: number;
    published: boolean;
    deleted_at: string | null;
    version: number;
};
type CategoryValue = Pick<Category, 'parent' | 'title' | 'position' | 'published'>;
type PostValue = Pick<Post, 'category_id' | 'client' | 'title' | 'content' | 'position' | 'published'>;
type Listing = {
    items: Post[];
    total: number;
    page: number;
    pages: number;
};
type Saved = {
    saved: boolean;
    id: number;
    version: number;
    replayed: boolean;
};
const message = (error: unknown) => error instanceof AdminError || error instanceof UnresolvedKnowledgeWrite ? error.message : 'З’єднання перервано. Запит міг зберегтися. Повторіть без зміни полів, не закриваючи редактор.';
const uncertainWrite = (error:unknown) => !(error instanceof AdminError) || error.status===408 || error.status<400 || error.status>=500;
export function categoryPath(id: number, categories: Category[]) {
    const map = new Map(categories.map(c => [c.id, c])), seen = new Set<number>(), names: string[] = [];
    let current = map.get(id);
    while (current && !seen.has(current.id)) {
        seen.add(current.id);
        names.unshift(current.title);
        current = map.get(current.parent);
    }
    return names.join(' / ') || `Категорія #${id}`;
}
function useWrite(csrf: string) {
    const retry = useRef(createKnowledgeRetry(csrf, (action, body) => adminWrite<Saved>(action as AdminWriteAction, body, csrf)));
    return (action: AdminWriteAction, body: Record<string, unknown>) => retry.current(action, body) as Promise<Saved>;
}
function CategoryEditor({ item, categories, csrf, onClose, onSaved, onWorking }: {
    item: Category | null;
    categories: Category[];
    csrf: string;
    onClose: () => void;
    onSaved: () => void;
    onWorking: (busy: boolean) => void;
}) {
    const [value, setValue] = useState<CategoryValue>(item ? { parent: item.parent, title: item.title, position: item.position, published: item.published } : { parent: 0, title: '', position: 0, published: false }), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain,setUncertain]=useState(false);
    const write = useWrite(csrf);
    function forbiddenParent(id: number) { const map = new Map(categories.map(c => [c.id, c])); const seen = new Set<number>(); let current = map.get(id); while (current && !seen.has(current.id)) {
        if (current.id === item?.id)
            return true;
        seen.add(current.id);
        current = map.get(current.parent);
    } return false; }
    async function save(event: FormEvent) { event.preventDefault(); let unresolved=false; if (busy)
        return; setBusy(true); onWorking(true); setError(''); try {
        await write('kb-category-save', { id: item?.id ?? null, version: item?.version ?? 0, category: value });
        onSaved();
    }
    catch (error) {
        unresolved=uncertainWrite(error); setUncertain(unresolved); setError(message(error));
    }
    finally {
        setBusy(false);
        onWorking(unresolved);
    } }
    return <form className="sa-form kb-editor" onSubmit={event => void save(event)}><div className="sa-title"><h3>{item ? 'Редагувати категорію' : 'Нова категорія'}</h3><button type="button" onClick={onClose} disabled={busy || uncertain} aria-label="Закрити редактор категорії"><X size={18}/></button></div><fieldset disabled={busy || uncertain}><div className="sa-fields"><label>Назва категорії<input required maxLength={180} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })}/></label><label>Батьківська категорія<select value={value.parent} onChange={e => setValue({ ...value, parent: Number(e.target.value) })}><option value={0}>Без батьківської — коренева</option>{categories.map(c => <option key={c.id} value={c.id} disabled={forbiddenParent(c.id)}>{categoryPath(c.id, categories)}{!c.published ? ' · чернетка' : ''}</option>)}</select></label><label>Порядок<input type="number" required min={0} max={2147483647} value={value.position} onChange={e => setValue({ ...value, position: Number(e.target.value) })}/></label><label className="sa-checkbox"><input type="checkbox" checked={value.published} onChange={e => setValue({ ...value, published: e.target.checked })}/>Опублікувати категорію</label></div><p className="sa-note">Перенесення змінює батьківську категорію без зміни ID. Якщо предок є чернеткою, у публічному API приховане все його піддерево.</p></fieldset><button className="cp-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="cp-spin" size={16}/> : <Save size={16}/>}Зберегти категорію</button>{error && <p role="alert" className="cp-error">{error}</p>}</form>;
}
export function KnowledgePostEditor({ item, categories, csrf, onClose, onSaved, onWorking }: {
    item: Post | null;
    categories: Category[];
    csrf: string;
    onClose: () => void;
    onSaved: () => void;
    onWorking: (busy: boolean) => void;
}) {
    const [value, setValue] = useState<PostValue>(item ? { category_id: item.category_id, client: item.client, title: item.title, content: item.content, position: item.position, published: item.published } : { category_id: categories[0]?.id || 0, client: 'all', title: '', content: '', position: 0, published: false }), [busy, setBusy] = useState(false), [error, setError] = useState(''), [uncertain,setUncertain]=useState(false);
    const write = useWrite(csrf);
    async function save(event: FormEvent) { event.preventDefault(); let unresolved=false; if (busy)
        return; setBusy(true); onWorking(true); setError(''); try {
        await write('kb-post-save', { id: item?.id ?? null, version: item?.version ?? 0, post: value });
        onSaved();
    }
    catch (error) {
        unresolved=uncertainWrite(error); setUncertain(unresolved); setError(message(error));
    }
    finally {
        setBusy(false);
        onWorking(unresolved);
    } }
    return <form className="sa-form kb-editor" onSubmit={event => void save(event)}><div className="sa-title"><h3>{item ? 'Редагувати статтю' : 'Нова стаття'}</h3><button type="button" onClick={onClose} disabled={busy || uncertain} aria-label="Закрити редактор статті"><X size={18}/></button></div><fieldset disabled={busy || uncertain}><div className="sa-fields"><label>Заголовок<input required maxLength={240} value={value.title} onChange={e => setValue({ ...value, title: e.target.value })}/></label><label>Категорія<select required value={value.category_id} onChange={e => setValue({ ...value, category_id: Number(e.target.value) })}><option value={0} disabled>Оберіть категорію</option>{categories.map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, categories)}{!c.published ? ' · чернетка' : ''}</option>)}</select></label><label>Порядок<input type="number" required min={0} max={2147483647} value={value.position} onChange={e => setValue({ ...value, position: Number(e.target.value) })}/></label><label>Клієнт<select value={value.client} onChange={e => setValue({ ...value, client: e.target.value as 'all' | 'pc' })}><option value="all">all · усі платформи</option><option value="pc">pc · комп’ютер</option></select></label><label className="sa-wide">Текст статті<textarea required rows={16} maxLength={30000} value={value.content} onChange={e => setValue({ ...value, content: e.target.value })}/><small>Звичайний текст. Команди, числа й посилання зберігайте точно. HTML не виконується.</small></label><label className="sa-checkbox"><input type="checkbox" checked={value.published} onChange={e => setValue({ ...value, published: e.target.checked })}/>Опублікувати статтю</label></div><p className="sa-note">Зміна категорії переносить статтю зі збереженням ID. Публічна видимість також залежить від публікації категорії та всіх її предків.</p><section className="kb-preview" aria-label="Попередній перегляд статті"><span><Eye size={15}/>Попередній перегляд</span><h4>{value.title || 'Заголовок статті'}</h4><div>{value.content || 'Тут буде текст статті…'}</div></section></fieldset><button className="cp-primary" type="submit" disabled={busy || !value.category_id}>{busy ? <LoaderCircle className="cp-spin" size={16}/> : <Save size={16}/>}Зберегти {value.published ? 'й опублікувати' : 'чернетку'}</button>{error && <p role="alert" className="cp-error">{error}</p>}</form>;
}
export default function KnowledgeAdmin({ csrf }: {
    csrf: string;
}) {
    const [categories, setCategories] = useState<Category[]>([]), [trashCategories, setTrashCategories] = useState<Category[]>([]), [data, setData] = useState<Listing | null>(null), [busy, setBusy] = useState(true), [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
    const [revision, setRevision] = useState(0), [state, setState] = useState('active'), [q, setQ] = useState(''), [search, setSearch] = useState(''), [categoryId, setCategoryId] = useState(''), [page, setPage] = useState(1), [size, setSize] = useState(20);
    const [editor, setEditor] = useState<{
        kind: 'category';
        item: Category | null;
    } | {
        kind: 'post';
        item: Post | null;
    } | null>(null), [removing, setRemoving] = useState<{
        kind: 'category' | 'post';
        item: Category | Post;
    } | null>(null), [confirmed, setConfirmed] = useState(false), [copied, setCopied] = useState('');
    const write = useWrite(csrf), endpoint = `${window.location.origin || ''}/api/knowledge-base`;
    useEffect(() => { const controller = new AbortController(); setBusy(true); setError(''); Promise.all([adminRead<{
            items: Category[];
        }>('kb-categories', { state: 'active' }, controller.signal), adminRead<{
            items: Category[];
        }>('kb-categories', { state: 'trash' }, controller.signal), adminRead<Listing>('kb-posts', { state, q, page, size, ...(categoryId ? { categoryId } : {}) }, controller.signal)]).then(([active, trash, posts]) => { if (!controller.signal.aborted) {
        setCategories(active.items);
        setTrashCategories(trash.items);
        setData(posts);
    } }).catch(error => { if (!controller.signal.aborted) {
        setError(message(error));
        if (error instanceof AdminError && [401, 403].includes(error.status)) {
            setData(null);
            setCategories([]);
            setTrashCategories([]);
            setEditor(null);
        }
    } }).finally(() => { if (!controller.signal.aborted)
        setBusy(false); }); return () => controller.abort(); }, [state, q, page, size, categoryId, revision]);
    function refresh() { setRevision(v => v + 1); }
    function saved() { setEditor(null); setNotice('Матеріал збережено в базі. API отримує опубліковані зміни без кешування.'); refresh(); }
    async function remove(restore = false, target = removing) { if (!target || working || (!restore && !confirmed))
        return; setWorking(true); setError(''); try {
        await write(`kb-${target.kind}-${restore ? 'restore' : 'delete'}`, { id: target.item.id, version: target.item.version });
        setRemoving(null);
        setNotice(restore ? 'Відновлено як чернетку. Опублікуйте через редактор.' : 'Переміщено до кошика. З публічного API прибрано.');
        refresh();
    }
    catch (error) {
        setError(message(error));
    }
    finally {
        setWorking(false);
    } }
    async function copy() { try {
        await navigator.clipboard.writeText(endpoint);
        setCopied('Адресу скопійовано.');
    }
    catch {
        setCopied('Скопіюйте адресу нижче вручну.');
    } }
    const visible = state === 'trash' ? trashCategories : categories;
    return <div className="kb-admin"><div className="sa-title"><div><span className="cp-eyebrow">UNITED KNOWLEDGE</span><h2>База знань</h2></div><button onClick={refresh} disabled={busy || working}><RefreshCw size={15}/>Оновити</button></div><p className="sa-note">Категорії, підкатегорії та статті зберігаються в MySQL. Доступ — адміністратору рівня 12. Перекладені початкові матеріали містять правила, ціни, бренди та посилання джерела; їх відповідність UNITED потребує перевірки. Автор імпорту обрав публікацію перекладу без зміни цих значень.</p><div className="kb-stats"><div><BookOpen size={21}/><strong>{busy && !data ? '…' : categories.length}</strong><span>Активні категорії</span></div><div><Search size={21}/><strong>{data?.total ?? '…'}</strong><span>Статті за фільтром</span></div><div><Check size={21}/><strong>MySQL</strong><span>Постійне зберігання</span></div></div>{error && <p role="alert" className="cp-error">{error}</p>}{notice && <p role="status" className="sa-success">{notice}</p>}<div className="kb-toolbar"><label>Стан<select disabled={working} value={state} onChange={e => { setState(e.target.value); setPage(1); setEditor(null); setRemoving(null); }}><option value="active">Активні й чернетки</option><option value="trash">Кошик</option></select></label><button className="cp-primary" disabled={working || busy} onClick={() => { setEditor({ kind: 'category', item: null }); setRemoving(null); }}><FolderPlus size={16}/>Нова категорія</button><button className="cp-primary" disabled={working || busy || !categories.length} onClick={() => { setEditor({ kind: 'post', item: null }); setRemoving(null); }}><FilePlus2 size={16}/>Нова стаття</button></div>{editor?.kind === 'category' && <CategoryEditor key={`cat:${editor.item?.id || 'new'}:${editor.item?.version || 0}`} item={editor.item} categories={categories} csrf={csrf} onClose={() => setEditor(null)} onSaved={saved} onWorking={setWorking}/>} {editor?.kind === 'post' && <KnowledgePostEditor key={`post:${editor.item?.id || 'new'}:${editor.item?.version || 0}`} item={editor.item} categories={categories} csrf={csrf} onClose={() => setEditor(null)} onSaved={saved} onWorking={setWorking}/>}<section className="sa-form"><div className="sa-title"><h3>Категорії та підкатегорії</h3><small>{visible.length} записів</small></div><div className="kb-categories">{visible.map(c => <article key={c.id}><div><strong>{categoryPath(c.id, [...categories, ...trashCategories])}</strong><small>#{c.id} · порядок {c.position} · {c.deleted_at ? 'У кошику' : c.published ? 'Опубліковано' : 'Чернетка'} · підкатегорії {c.childCount} · статті {c.postCount}</small></div><div className="sa-item-actions">{c.deleted_at ? <button disabled={working} onClick={() => void remove(true, { kind: 'category', item: c })}><Undo2 size={14}/>Відновити</button> : <><button disabled={working} onClick={() => { setEditor({ kind: 'category', item: c }); setRemoving(null); }}><Pencil size={14}/>Редагувати</button><button disabled={working} onClick={() => { setRemoving({ kind: 'category', item: c }); setConfirmed(false); }}><Trash2 size={14}/>Видалити</button></>}</div></article>)}{!busy && !visible.length && <p className="sa-note">Категорій немає.</p>}</div></section><section className="sa-form"><div className="sa-title"><h3>Статті</h3><small>{data?.total ?? 0} за фільтром</small></div><div className="kb-filters"><form onSubmit={e => { e.preventDefault(); setQ(search); setPage(1); }}><label>Пошук у заголовках і тексті<input value={search} maxLength={200} onChange={e => setSearch(e.target.value)} placeholder="Знайти статтю…" disabled={working}/></label><button disabled={working} type="submit"><Search size={16}/>Знайти</button></form><label>Категорія<select value={categoryId} disabled={working} onChange={e => { setCategoryId(e.target.value); setPage(1); }}><option value="">Усі категорії</option>{[...categories, ...trashCategories].map(c => <option key={c.id} value={c.id}>{categoryPath(c.id, [...categories, ...trashCategories])}</option>)}</select></label><label>На сторінці<select value={size} disabled={working} onChange={e => { setSize(Number(e.target.value)); setPage(1); }}>{[20, 50, 100].map(n => <option key={n}>{n}</option>)}</select></label></div>{busy && <p className="sa-note" role="status"><LoaderCircle className="cp-spin" size={17}/>Читаємо базу знань…</p>}<div className="sa-document-list">{data?.items.map(p => <article key={p.id}><div><strong>{p.title}</strong><small>#{p.id} · {categoryPath(p.category_id, [...categories, ...trashCategories])} · {p.deleted_at ? 'У кошику' : p.published ? 'Опубліковано' : 'Чернетка'} · {p.client} · порядок {p.position} · v{p.version}</small></div><div className="sa-item-actions">{p.deleted_at ? <button disabled={working} onClick={() => void remove(true, { kind: 'post', item: p })}><Undo2 size={14}/>Відновити</button> : <><button disabled={working} onClick={() => { setEditor({ kind: 'post', item: p }); setRemoving(null); }}><Pencil size={14}/>Редагувати / перегляд</button><button disabled={working} onClick={() => { setRemoving({ kind: 'post', item: p }); setConfirmed(false); }}><Trash2 size={14}/>Видалити</button></>}</div></article>)}{data && !busy && !data.items.length && <p className="sa-note">Статей за цим фільтром немає.</p>}</div>{data && <nav className="cp-pagination" aria-label="Сторінки статей"><span>Усього {data.total} · {data.page}/{data.pages}</span><div><button disabled={busy || working || data.page <= 1} onClick={() => setPage(data.page - 1)}>Назад</button><button disabled={busy || working || data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Далі</button></div></nav>}</section>{removing && <form className="sa-delete" onSubmit={e => { e.preventDefault(); void remove(); }}><h3>Прибрати «{removing.item.title}»?</h3><p>Матеріал перейде до кошика. Відновлення — як чернетка. Категорію з активними дочірніми категоріями або статтями видалити не можна: спочатку перенесіть чи приберіть їх.</p><label className="sa-checkbox"><input type="checkbox" checked={confirmed} disabled={working} onChange={e => setConfirmed(e.target.checked)}/>Підтверджую видалення</label><button disabled={working || !confirmed} type="submit">До кошика</button><button type="button" disabled={working} onClick={() => setRemoving(null)}>Скасувати</button></form>}<section className="sa-form kb-api"><h3>API для гри</h3><p className="sa-note">Публічне читання без логіна. Верхній рівень кожної успішної відповіді — масив. Чернетки та видалені матеріали не повертаються. Код клієнта тут не змінюється.</p><code>{endpoint}</code><button onClick={() => void copy()}><Copy size={15}/>Скопіювати базову адресу</button>{copied && <p role="status">{copied}</p>}<a href="/api/knowledge-base/categories" target="_blank" rel="noreferrer">GET /categories</a><code>GET /posts/ID_КАТЕГОРІЇ</code><a href="/api/knowledge-base/search?query=%D0%B4%D0%BE%D1%81%D0%B2%D1%96%D0%B4" target="_blank" rel="noreferrer">GET /search?query=досвід</a></section></div>;
}
