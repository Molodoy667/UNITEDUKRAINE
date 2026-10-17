import { useEffect, useRef, type PointerEvent, type ReactNode } from 'react';

export function Tilt({ children, className = '', intensity = 3 }: { children: ReactNode; className?: string; intensity?: number }) {
  const surface = useRef<HTMLDivElement>(null);
  const frame = useRef<number | undefined>(undefined);
  useEffect(() => () => { if (frame.current !== undefined) cancelAnimationFrame(frame.current); }, []);
  function move(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      surface.current?.style.setProperty('--tilt-x', `${(0.5 - y) * intensity}deg`);
      surface.current?.style.setProperty('--tilt-y', `${(x - 0.5) * intensity}deg`);
      surface.current?.style.setProperty('--shine-x', `${x * 100}%`);
      surface.current?.style.setProperty('--shine-y', `${y * 100}%`);
    });
  }
  function reset() {
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    surface.current?.style.setProperty('--tilt-x', '0deg');
    surface.current?.style.setProperty('--tilt-y', '0deg');
  }
  return <div ref={surface} className={`tilt-surface ${className}`} onPointerMove={move} onPointerLeave={reset} onPointerCancel={reset}>{children}<span className="tilt-shine" aria-hidden="true" /></div>;
}

export function usePageMotion() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!('IntersectionObserver' in window)) return;
    const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        entry.target.setAttribute('data-in-view', 'true');
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.08 });
    const enable = () => {
      sections.forEach(section => {
        if (media.matches) { section.removeAttribute('data-motion'); observer.unobserve(section); }
        else { section.setAttribute('data-motion', 'true'); observer.observe(section); }
      });
    };
    enable();
    media.addEventListener('change', enable);
    return () => { observer.disconnect(); media.removeEventListener('change', enable); sections.forEach(section => section.removeAttribute('data-motion')); };
  }, []);
}
