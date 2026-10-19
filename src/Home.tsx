import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronLeft, ChevronRight, Copy, Download, Expand, Gamepad2, Globe2, MapPin, MessageCircle, Monitor, RefreshCw, Route, Sparkles, Users, X } from 'lucide-react';
import { Header, Footer } from '@/components/site-shell';
import {useSite,SiteMetadata} from './site/content';
import PagePreloader from './ui/PagePreloader';
import { Tilt, usePageMotion } from './motion';

type Status = { status: 'online' | 'unavailable'; players?: number; maxPlayers?: number; updatedAt: string; source?: string };
const address = '51.75.44.14:2219';
const scenes = [
  { title: 'Місто, яке надихає', subtitle: 'Київ · атмосфера проєкту', position: '15% 25%', label: 'МІСТО' },
  { title: 'Твій власний маршрут', subtitle: 'Дороги · атмосфера проєкту', position: '15% 85%', label: 'СВОБОДА' },
  { title: 'Знайди своїх', subtitle: 'Спільнота · атмосфера проєкту', position: '90% 30%', label: 'ЛЮДИ' },
];

function SectionLabel({ number, children }: { number: string; children: ReactNode }) {
  return <div className="section-label"><span className="section-index">{number}</span><span>{children}</span><span className="label-rule" /></div>;
}

export default function Home() {
  const {data,loading:contentLoading,error:contentError}=useSite();
  const articles=data.news,discord=data.home.discordUrl;
  const filters=['Усі матеріали',...new Set(articles.map(item=>item.category||'Новини'))];
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [modal, setModal] = useState<string | null>(null);
  const [gallery, setGallery] = useState<number | null>(null);
  const [filter, setFilter] = useState(filters[0]);
  const request = useRef<AbortController | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dialogOpen = modal !== null || gallery !== null;
  usePageMotion();

  const refresh = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    try {
      const response = await fetch('/api/server', { signal: AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]) });
      if (!response.ok) throw new Error('Monitoring unavailable');
      const data: Status = await response.json();
      if (!controller.signal.aborted) setStatus(data);
    } catch {
      if (!controller.signal.aborted) setStatus({ status: 'unavailable', updatedAt: new Date().toISOString() });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60000);
    return () => { clearInterval(timer); request.current?.abort(); clearTimeout(copyTimer.current); };
  }, [refresh]);

  const closeDialog = useCallback(() => { setModal(null); setGallery(null); }, []);
  useEffect(() => {
    if (!dialogOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDialog();
      if (event.key !== 'Tab') return;
      const items = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
      if (!items?.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = overflow; window.removeEventListener('keydown', onKey); previous?.focus(); };
  }, [dialogOpen, closeDialog]);
  useEffect(() => {
    if (gallery === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setGallery(value => value === null ? null : (value + 1) % scenes.length);
      if (event.key === 'ArrowLeft') setGallery(value => value === null ? null : (value + scenes.length - 1) % scenes.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [gallery]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2500);
    } catch { setModal(`Адреса сервера: ${address}`); }
  }

  return <>
    {contentLoading&&<PagePreloader fullscreen/>}
    <SiteMetadata/><Header />
    <main id="main-content">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-ambient" aria-hidden="true" />
        <div className="hero-intro page-width">
          <div className="hero-heading"><div className="eyebrow"><span className="flag" /> УКРАЇНСЬКИЙ ROLEPLAY <span className="eyebrow-separator">/</span> UNITED UKRAINE</div><h1 id="hero-title">{data.home.headline}<br /><span className="hero-gold">{data.home.highlight}</span></h1></div>
          <div className="hero-copy"><span className="intro-cross" aria-hidden="true">✳</span><p style={{whiteSpace:'pre-line'}}>{data.home.description}</p><div className="hero-actions"><a className="btn primary" href="#start"><Gamepad2 size={19} />Почати гру<ArrowUpRight size={19} /></a>{discord&&<a className="icon-btn discord-link" href={discord} target="_blank" rel="noreferrer" aria-label="Наш Discord"><MessageCircle size={22} /></a>}{data.home.trailerUrl&&<a className="text-link" href={data.home.trailerUrl} target="_blank" rel="noreferrer">Трейлер<ArrowUpRight size={17}/></a>}</div></div>
        </div>
        <div className="hero-visual page-width"><Tilt className="hero-art" intensity={2.4}><div className="hero-art-frame">
          <img className="hero-image" src="/assets/world-promo.png" alt="United Ukraine на комп’ютері та телефоні на тлі вечірнього українського міста" fetchPriority="high" width="1850" height="850" />
          <div className="hero-vignette" aria-hidden="true" /><span className="art-corner corner-tl" aria-hidden="true" /><span className="art-corner corner-br" aria-hidden="true" />
          <div className="art-topline"><span><i /> ВІДКРИЙ СВІЙ СВІТ</span><span>UNITED UKRAINE / ROLEPLAY</span></div>
          <div className="art-caption"><span className="art-caption-number">01</span><div><small>ТВОЯ НАСТУПНА ПРИГОДА</small><p>Починається тут.</p></div><a href="#world" className="art-explore" aria-label="Відкрити світ проєкту"><ArrowDown size={22} /></a></div>
        </div></Tilt><div className="visual-bottom"><span>UNITED BY FREEDOM. CONNECTED BY PLAY.</span><a href="#world">ГОРТАЙ, ЩОБ ВІДКРИТИ <ArrowDown size={13} /></a></div></div>
      </section>

      <section className="server-wrap page-width" aria-label="Ігровий сервер"><div className="server-card">
        <div className="server-icon"><Globe2 size={26} /></div><div className="server-name"><span className="micro-label">ТВІЙ ІГРОВИЙ СВІТ</span><h2>United Ukraine <span>#01</span></h2></div>
        <div className="server-state" aria-live="polite"><span className={status?.status === 'online' ? 'status-dot online' : 'status-dot'} />{loading ? 'Оновлення…' : status?.status === 'online' ? 'Сервер онлайн' : 'Статус недоступний'}</div>
        <div className="player-count"><Users size={17} /><strong>{status?.status === 'online' ? status.players : '—'}</strong><span>/ {status?.maxPlayers ?? '—'}</span><small>ГРАВЦІВ</small></div>
        <button className="server-address" onClick={copy} aria-label={copied ? 'IP скопійовано' : `Скопіювати IP ${address}`}><span>{copied ? 'IP скопійовано' : address}</span>{copied ? <Check size={16} /> : <Copy size={16} />}</button>
        <button className="icon-btn refresh" onClick={() => void refresh()} disabled={loading} aria-label="Оновити статус сервера"><RefreshCw size={17} className={loading ? 'spinning' : ''} /></button>
      </div><p className="monitor-note">{status?.status === 'online' ? 'Живий статус · оновлюється щохвилини' : 'Моніторинг сервера · очікуємо доступні дані'}{status && ` · ${new Date(status.updatedAt).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`}</p></section>

      <section id="world" className="world section page-width" data-reveal><SectionLabel number="01">БІЛЬШЕ, НІЖ ГРА</SectionLabel>
        <div className="world-heading"><h2>{data.home.aboutTitle}</h2><div><p style={{whiteSpace:'pre-line'}}>{data.home.aboutText}</p><a href="#gallery" className="text-link">Відчути атмосферу <ArrowUpRight size={18} /></a></div></div>
        <div className="world-layout"><Tilt className="world-image-wrap" intensity={2}><img src="/assets/world.jpg" alt="Концепт-арт українського міста та персонажів United Ukraine" loading="lazy" /><div className="world-image-shade" /><span className="image-location"><MapPin size={14} /> НАТХНЕННО УКРАЇНОЮ</span><div className="world-image-title"><span>ВПІЗНАВАЙ СВОЄ.</span><strong>ВІДКРИВАЙ НОВЕ.</strong></div><span className="image-disclaimer">КОНЦЕПТ-АРТ ПРОЄКТУ</span></Tilt>
          <div className="world-features">{[
            { icon: MapPin, number: '01', title: 'Своя атмосфера', text: 'Український характер у кожній деталі. Місця, у яких відчуваєш себе вдома.' },
            { icon: Route, number: '02', title: 'Твій власний шлях', text: 'Створи персонажа, знаходь можливості та вирішуй, ким стане твій герой.' },
            { icon: Users, number: '03', title: 'Люди, які поруч', text: 'Нові знайомства, спільні пригоди й моменти, які хочеться згадувати.' },
          ].map(feature => <div className="feature" key={feature.number}><div className="feature-top"><feature.icon size={23} /><span>{feature.number} /</span></div><h3>{feature.title}</h3><p>{feature.text}</p></div>)}</div>
        </div>
      </section>

      <div className="manifesto" aria-hidden="true"><div className="manifesto-track">{[0, 1].map(i => <span key={i}>ТВОЯ КРАЇНА <b>✳</b> ТВОЯ ІСТОРІЯ <b>✳</b> UNITED UKRAINE <b>✳</b>&nbsp;</span>)}</div></div>

      <section className="news section page-width" id="news" data-reveal><SectionLabel number="02">НА ЗВ’ЯЗКУ З ПРОЄКТОМ</SectionLabel>
        <div className="section-title"><h2>У ЦЕНТРІ <span className="gold">ПОДІЙ.</span></h2><div className="filters" aria-label="Фільтр матеріалів">{filters.map(item => <button key={item} className={filter === item ? 'active' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
        <p className="editorial-note" role="status">{contentError|| (contentLoading?'Завантажуємо новини…':articles.length?'Опубліковано адміністрацією проєкту':'Опублікованих новин поки немає.')}</p>
        <div className="news-grid">{articles.map((item, index) => (filter===filters[0]||filter===(item.category||'Новини'))&&<Tilt className="news-tilt" key={item.id} intensity={3}><a className="news-card" href={item.url} aria-label={`Читати: ${item.title}`}><div className="news-image"><img src={item.image||'/assets/world.jpg'} alt="" loading="lazy" /><span className="article-tag">{item.category||'Новини'}</span><span className="round-arrow"><ArrowUpRight size={21} /></span></div><div className="news-body"><span className="micro-label">UNITED JOURNAL <span>/ {index + 1}</span></span><h3>{item.title}</h3><p>{item.excerpt}</p><span className="read-more">Читати новину <ArrowRight size={17} /></span></div></a></Tilt>)}</div>
      </section>

      <section className="start-section" id="start"><div className="start section page-width" data-reveal><SectionLabel number="03">НОВА ІСТОРІЯ ЗА ТРИ КРОКИ</SectionLabel>
        <div className="start-grid"><div className="start-heading"><h2>ТВІЙ СВІТ.<br />ТВОЇ ПРАВИЛА.<br /><span className="gold">ТВІЙ СТАРТ.</span></h2><p>Не спостерігай за чужими історіями.<br />Почни свою.</p><div className="start-orbit" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit orbit-three" /><img src="/assets/logo.png" alt="" /><span className="orbit-star">✳</span><span className="orbit-caption">YOUR NEXT CHAPTER</span></div></div>
          <div className="steps"><div className="step step-featured"><div className="step-top"><span className="step-num">01</span><Download size={24} /></div><h3>Завантаж лаунчер</h3><p>Твій ключ до світу United Ukraine.<br />Усе необхідне для початку гри.</p>{data.launcher.downloadUrl?<a className="btn primary" href={data.launcher.downloadUrl} target="_blank" rel="noreferrer"><Download size={18}/>Завантажити лаунчер<ArrowUpRight size={18}/></a>:<button className="btn primary" disabled><Download size={18}/>Посилання ще не задане</button>}<small><Monitor size={14} />Для Windows{data.launcher.version?` · v${data.launcher.version}`:''}</small></div>
            <div className="step"><span className="step-num">02</span><div><h3>Встанови гру</h3><p>Відкрий лаунчер і виконай прості інструкції встановлення.</p></div><ArrowDown size={20} /></div>
            <div className="step"><span className="step-num">03</span><div><h3>Увійди у свій світ</h3><p>Приєднуйся до сервера та напиши перший розділ своєї історії.</p><button className="text-link" onClick={copy}>{copied ? 'Адресу скопійовано' : 'Скопіювати IP сервера'}{copied ? <Check size={16} /> : <Copy size={16} />}</button></div><ArrowUpRight size={20} /></div>
          </div>
        </div>
      </div></section>

      <section className="gallery section page-width" id="gallery" data-reveal><SectionLabel number="04">ПОБАЧ. ВІДЧУЙ. ЗАЛИШСЯ.</SectionLabel><div className="section-title"><h2>АТМОСФЕРА,<br /><span className="muted-heading">ЯКУ ВІДЧУВАЄШ.</span></h2><span className="gallery-note"><Sparkles size={16} /> Концепт-арт United Ukraine</span></div>
        <div className="gallery-grid">{scenes.map((scene, index) => <button className={`gallery-card scene-${index}`} key={scene.title} onClick={() => setGallery(index)} aria-label={`Відкрити зображення: ${scene.title}`}><img src="/assets/world.jpg" style={{ objectPosition: scene.position }} alt={scene.title} loading="lazy" /><span className="gallery-top"><span>0{index + 1} / {scene.label}</span><Expand size={18} /></span><div className="gallery-caption"><h3>{scene.title}</h3><span className="gallery-arrow"><ArrowUpRight size={23} /></span></div></button>)}</div>
      </section>

      <section className="community page-width" data-reveal><div className="community-grid" aria-hidden="true" /><div className="community-orb" aria-hidden="true"><MessageCircle /><span className="orb-ring" /><span className="orb-star">✳</span></div><div className="community-copy"><div className="eyebrow"><span className="status-dot online" /> СВОЇ ЗАВЖДИ ПОРУЧ</div><h2>ВЕЛИКИЙ СВІТ.<br /><span>ТВОЯ СПІЛЬНОТА.</span></h2><p>Знайди друзів ще до першого входу у гру.<br />Знайомства, новини й підтримка — в нашому Discord.</p><a className="btn primary" href={discord} target="_blank" rel="noreferrer"><MessageCircle size={20} />Приєднатися до Discord<ArrowUpRight size={19} /></a></div><span className="community-word" aria-hidden="true">UNITED</span></section>
    </main>
    <Footer />
    <span className="sr-only" role="status">{copied ? 'Адресу сервера скопійовано' : ''}</span>
    {dialogOpen && <div className="modal-backdrop" onClick={closeDialog}><div ref={dialogRef} className={`modal ${gallery !== null ? 'gallery-modal' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dialog-title" onClick={event => event.stopPropagation()}><button className="modal-close icon-btn" aria-label="Закрити" onClick={closeDialog}><X size={22} /></button>
      {gallery !== null ? <><img className="lightbox-image" src="/assets/world.jpg" style={{ objectPosition: scenes[gallery].position }} alt={scenes[gallery].title} /><div className="lightbox-bottom"><div><span className="micro-label">{scenes[gallery].subtitle}</span><h2 id="dialog-title">{scenes[gallery].title}</h2></div><div className="lightbox-nav"><button className="icon-btn" aria-label="Попереднє зображення" onClick={() => setGallery((gallery + scenes.length - 1) % scenes.length)}><ChevronLeft /></button><span aria-live="polite">0{gallery + 1} / 03</span><button className="icon-btn" aria-label="Наступне зображення" onClick={() => setGallery((gallery + 1) % scenes.length)}><ChevronRight /></button></div></div></> : <><Download size={35} className="gold" /><h2 id="dialog-title">Твій старт у United Ukraine</h2><p>{modal}</p>{discord&&<a href={discord} target="_blank" rel="noreferrer" className="btn primary">Офіційний Discord<ArrowUpRight size={18} /></a>}</>}
    </div></div>}
  </>;
}
