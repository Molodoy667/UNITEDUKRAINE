import {useEffect} from 'react';

// Shared with the small, pre-JavaScript shell in index.html (public/preloader.css).
export default function PagePreloader({fullscreen=false}:{fullscreen?:boolean}){
 return <div className={`site-preloader${fullscreen?' site-preloader-screen':''}`} role="status" aria-live="polite" aria-atomic="true"><div className="site-preloader-mark" aria-hidden="true"><img src="/assets/logo.png" alt="" width={36} height={45}/><span/></div><p>Завантажуємо твій світ…</p></div>;
}

// Run after React commits either the page or its Suspense fallback, never on a timer.
export function BootPreloaderReady(){
 useEffect(()=>{document.getElementById('site-boot-preloader')?.remove();},[]);
 return null;
}
