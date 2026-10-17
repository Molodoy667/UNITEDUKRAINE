import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Bold, Code, Eye, ImagePlus, Italic, Link2, List, MessageSquareQuote, Paperclip, Save, Send, X } from 'lucide-react';
import { api, date, href, read, type RecordData } from './client';
import { useForum } from './context';

export function useData(action: string, params: Record<string, string | number> = {}, revision = 0, enabled = true) {
  const key = JSON.stringify(params), [state, setState] = useState<{ data: RecordData | null; error: string; loading: boolean }>({ data: null, error: '', loading: true });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(); setState({ data: null, error: '', loading: true });
    read(action, JSON.parse(key), controller.signal).then(data => { if (!controller.signal.aborted) setState({ data, error: '', loading: false }); }).catch(error => { if (!controller.signal.aborted) setState({ data: null, error: error.message, loading: false }); });
    return () => controller.abort();
  }, [action, key, revision, enabled]);
  return state;
}
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) { return <div className={`forum-panel ${className}`}>{children}</div>; }
export function ErrorNotice({ children }: { children: ReactNode }) { return <p className="forum-error" role="alert">{children}</p>; }
export function Loading() { return <div className="forum-loading" role="status"><span />Завантаження форуму…</div>; }
export function Empty({ children = 'Поки що тут немає публікацій.' }: { children?: ReactNode }) { return <div className="forum-empty"><MessageSquareQuote size={34} /><p>{children}</p></div>; }
export function Badge({ children, color }: { children: ReactNode; color?: string }) { return <span className="forum-badge" style={color && /^#[\da-f]{6}$/i.test(color) ? { color, borderColor: `${color}55`, background: `${color}12` } : undefined}>{children}</span>; }
export function Avatar({ user, size = '' }: { user: RecordData; size?: string }) {
  return <span className={`forum-avatar ${size}`}>{user.avatarId || user.avatar_id ? <RemoteImage id={user.avatarId || user.avatar_id} alt={`Аватар ${user.username}`} /> : String(user.username || 'U').slice(0, 2).toUpperCase()}</span>;
}
export function RemoteImage({ id, alt, className }: { id: number; alt: string; className?: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => { const controller = new AbortController(); read('attachment', { id }, controller.signal).then(data => setUrl(data.url)).catch(() => {}); return () => controller.abort(); }, [id]);
  return url ? <img src={url} alt={alt} className={className} referrerPolicy="no-referrer" /> : <span aria-label={alt} className={className}>…</span>;
}
export function Pager({ total, page = 1, size = 20, onPage, onSize }: { total: number; page: number; size: number; onPage: (value: number) => void; onSize: (value: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return <div className="forum-pager"><span>{total} записів</span><div><button className="forum-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Попередня сторінка"><ArrowLeft size={17} /></button><span>{page} / {pages}</span><button className="forum-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Наступна сторінка"><ArrowRight size={17} /></button></div><label>На сторінці <select value={size} onChange={event => onSize(Number(event.target.value))}>{[10,20,50,100].map(value => <option key={value}>{value}</option>)}</select></label></div>;
}

// Text is always rendered through React; raw HTML and executable URL schemes are never accepted.
export function RichText({ text }: { text: string }) {
  function inline(value: string, key = ''): ReactNode[] {
    const parts = value.split(/(\*\*[^*\n]+\*\*|(?<!\*)\*[^*\n]+\*(?!\*)|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<>]+|@[\p{L}\p{N}_-]{3,32})/gu);
    return parts.map((part, index) => {
      const k = `${key}-${index}`;
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={k}>{part.slice(2,-2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={k}>{part.slice(1,-1)}</em>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={k}>{part.slice(1,-1)}</code>;
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
      if (link) return <a href={link[2]} target="_blank" rel="noreferrer noopener ugc" key={k}>{link[1]}</a>;
      if (/^https?:\/\//.test(part)) return <a href={part} target="_blank" rel="noreferrer noopener ugc" key={k}>{part}</a>;
      if (part.startsWith('@')) return <span className="forum-mention" key={k}>{part}</span>;
      return part;
    });
  }
  const blocks = text.split(/(```[\s\S]*?```|\|\|[\s\S]*?\|\|)/g);
  return <div className="forum-richtext">{blocks.map((block, index) => block.startsWith('```') ? <pre key={index}><code>{block.slice(3,-3).replace(/^\n/, '')}</code></pre> : block.startsWith('||') ? <details key={index}><summary>Спойлер</summary>{inline(block.slice(2,-2))}</details> : block.split('\n').map((line, lineIndex) => line.startsWith('> ') ? <blockquote key={`${index}-${lineIndex}`}>{inline(line.slice(2))}</blockquote> : line.startsWith('- ') ? <p className="forum-list-line" key={`${index}-${lineIndex}`}>• {inline(line.slice(2))}</p> : <p key={`${index}-${lineIndex}`}>{inline(line) || <br />}</p>))}</div>;
}
export function AttachmentLink({ file }: { file: RecordData }) {
  const [error, setError] = useState('');
  async function openFile() {
    const tab = window.open('about:blank', '_blank');
    if (!tab) { setError('Дозвольте відкриття нової вкладки для перегляду файлу'); return; }
    tab.opener = null;
    try { const data = await read('attachment', { id: file.id }); tab.location.replace(data.url); }
    catch (error) { tab.close(); setError((error as Error).message); }
  }
  return <span className="forum-attachment"><button onClick={()=>{void openFile();}}><Paperclip size={15} />{file.filename}<small>{Math.ceil(file.size_bytes / 1024)} КБ</small></button>{error && <ErrorNotice>{error}</ErrorNotice>}</span>;
}
export async function upload(file: File, purpose = 'post') {
  const prepared = await api('attachment.prepare', { filename: file.name, mime: file.type, size: file.size, purpose });
  const response = await fetch(prepared.url, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
  if (!response.ok) throw new Error('Не вдалося завантажити файл');
  return (await api('attachment.complete', { attachmentId: prepared.attachmentId })).attachment as RecordData;
}
export function Editor({ value, onChange, onSubmit, onSave, busy, attachments, onAttachments, canUpload = false, submitLabel = 'Опублікувати', extra }: {
  value: string; onChange: (value: string) => void; onSubmit: () => void; onSave?: () => void; busy?: boolean; attachments: RecordData[]; onAttachments: (value: RecordData[]) => void; canUpload?: boolean; submitLabel?: string; extra?: ReactNode;
}) {
  const area = useRef<HTMLTextAreaElement>(null), [preview, setPreview] = useState(false), [uploading, setUploading] = useState(false), [error, setError] = useState('');
  function wrap(before: string, after = before) {
    const input = area.current, start = input?.selectionStart || 0, end = input?.selectionEnd || 0;
    onChange(`${value.slice(0,start)}${before}${value.slice(start,end) || 'текст'}${after}${value.slice(end)}`);
    input?.focus();
  }
  return <div className="forum-editor"><div className="forum-editor-toolbar">{[
    { label:'Жирний',icon:Bold,before:'**',after:'**' }, { label:'Курсив',icon:Italic,before:'*',after:'*' }, { label:'Цитата',icon:MessageSquareQuote,before:'\n> ',after:'\n' },
    { label:'Список',icon:List,before:'\n- ',after:'\n' }, { label:'Код',icon:Code,before:'\n```\n',after:'\n```\n' }, { label:'Посилання',icon:Link2,before:'[',after:'](https://example.com)' },
  ].map(item => <button key={item.label} type="button" title={item.label} aria-label={item.label} onClick={() => wrap(item.before,item.after)}><item.icon size={17} /></button>)}<button type="button" onClick={() => wrap('||','||')}>Спойлер</button><button type="button" className={preview ? 'active' : ''} onClick={() => setPreview(!preview)}><Eye size={17} />Передперегляд</button></div>
    {preview ? <div className="forum-editor-preview"><RichText text={value || 'Тут з’явиться ваше повідомлення.'} /></div> : <textarea ref={area} value={value} onChange={event => onChange(event.target.value)} rows={9} maxLength={30000} placeholder="Напишіть повідомлення…" aria-label="Текст повідомлення" />}
    {extra}
    {attachments.length > 0 && <div className="forum-attachments">{attachments.map(file => <span key={file.id}>{file.filename}<button type="button" onClick={() => onAttachments(attachments.filter(item => item.id !== file.id))} aria-label={`Прибрати ${file.filename}`}><X size={14} /></button></span>)}</div>}
    {error && <ErrorNotice>{error}</ErrorNotice>}<div className="forum-editor-footer"><label className={`forum-upload ${!canUpload || uploading || attachments.length >= 8 ? 'disabled' : ''}`}><ImagePlus size={18} />{uploading ? 'Завантаження…' : 'Додати файл'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" disabled={!canUpload || uploading || attachments.length >= 8} onChange={async event => { const file = event.target.files?.[0]; if (!file) return; setUploading(true); setError(''); try { onAttachments([...attachments, await upload(file)]); } catch (error) { setError((error as Error).message); } finally { setUploading(false); event.target.value = ''; } }} /></label>{onSave && <button type="button" className="forum-secondary" onClick={onSave} disabled={busy}><Save size={15} />Чернетка</button>}<button type="button" className="btn primary" disabled={busy || uploading || value.trim().length < 2} onClick={onSubmit}><Send size={16} />{busy ? 'Збереження…' : submitLabel}</button></div></div>;
}
export function TopicRows({ topics }: { topics: RecordData[] }) {
  const { bootstrap } = useForum();
  const statusName=(value:string)=>bootstrap.settings?.statuses?.find((status:RecordData)=>status.id===value)?.label||value;
  if (!topics.length) return <Empty />;
  return <div className="forum-topic-list">{topics.map(topic => <article className={`forum-topic-row ${topic.deleted_at ? 'is-deleted' : ''}`} key={topic.id}><span className={`forum-topic-indicator ${topic.last_post_id > topic.last_read_post_id ? 'unread' : ''}`} /><div><div className="forum-topic-meta">{Boolean(topic.pinned) && <Badge>Закріплено</Badge>}{Boolean(topic.private_topic) && <Badge>Приватно</Badge>}{topic.prefix && <Badge>{topic.prefix}</Badge>}{!topic.approved && <Badge>На модерації</Badge>}{topic.status !== 'open' && <Badge>{statusName(topic.status)}</Badge>}</div><a className="forum-topic-title" href={href('topic', { id: topic.id, firstUnread: 1 })}>{topic.title}</a><p><a href={href('profile', { id: topic.author_id })}>{topic.username}</a><span>·</span>{date(topic.created_at)}<span>·</span>{topic.board_title}</p></div><div className="forum-topic-count"><strong>{Math.max(0, (topic.post_count || 1) - 1)}</strong><small>відповідей</small></div><a className="forum-topic-last" href={href('topic', { id: topic.id, post: topic.last_post_id || 1 })}>{date(topic.updated_at)}<ArrowRight size={15} /></a></article>)}</div>;
}
