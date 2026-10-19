import { useEffect, useRef, useState } from 'react';
import { Menu, X, ArrowUpRight, ArrowUp, UserRound, MessageCircle } from 'lucide-react';
import {useSite} from '../src/site/content';
export const discord = 'https://discord.gg/GyJnWJXdJ';
export function Brand() {
  return <a href="/" className="brand" aria-label="United Ukraine — головна"><img src="/assets/logo.png" alt="" width="44" height="54" /><span>UNITED<span>UKRAINE</span><small>ROLEPLAY</small></span></a>;
}
export function Header() {
  const [open, setOpen] = useState(false);
  const header = useRef<HTMLElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  useEffect(() => {
    let frame = 0;
    const update = () => { frame = 0; if (header.current) header.current.dataset.scrolled = String(window.scrollY > 24); };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => { window.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); } };
    const outside = (event: PointerEvent) => { if (!header.current?.contains(event.target as Node)) setOpen(false); };
    window.addEventListener('keydown', escape);
    document.addEventListener('pointerdown', outside);
    return () => { window.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside); };
  }, [open]);
  return <><a className="skip-link" href="#main-content">Перейти до вмісту</a><header className="header" ref={header}><div className="header-inner"><Brand />
    <nav id="primary-navigation" className={open ? 'nav open' : 'nav'} aria-label="Основна навігація" onClick={() => setOpen(false)}>{[{ href: '/', name: 'Головна' }, { href: '/forum', name: 'Форум' }, { href: '/wiki', name: 'Вікі' }, { href: '/roulette', name: 'Рулетка' }, { href: '/forbes', name: 'Forbes' }, { href: '/donate', name: 'Донат' }].map(link => <a href={link.href} key={link.href} aria-current={path === link.href ? 'page' : undefined}>{link.name}{link.href === '/donate' && <span className="nav-plus">+</span>}</a>)}<a className="mobile-account" href="/account">Особистий кабінет <ArrowUpRight size={16} /></a></nav>
    <a className="account" href="/account" aria-label="Особистий кабінет"><UserRound size={17} /><span>Особистий кабінет</span><ArrowUpRight size={16} /></a><button className="menu-toggle icon-btn" ref={menuButton} onClick={() => setOpen(value => !value)} aria-label={open ? 'Закрити меню' : 'Відкрити меню'} aria-controls="primary-navigation" aria-expanded={open}>{open ? <X /> : <Menu />}</button>
  </div></header></>;
}
export function Footer() {
  const {data}=useSite();
  return <footer className="footer page-width"><div className="footer-top"><Brand /><p>Твоя країна. Твої правила гри.<br />Твоя нова історія.</p>{data.home.discordUrl&&<a href={data.home.discordUrl} target="_blank" rel="noreferrer" className="discord-small"><MessageCircle size={18} /> Зустрінемось у Discord <ArrowUpRight size={17} /></a>}<a className="back-to-top icon-btn" href="#main-content" aria-label="На початок сторінки"><ArrowUp size={19} /></a></div><div className="footer-bottom"><span>© {new Date().getFullYear()} United Ukraine Roleplay</span><div>{data.pages.map(page=><a key={page.id} href={page.url}>{page.title}</a>)}</div><span className="made"><span className="flag" /> З любов’ю до України</span></div></footer>;
}
