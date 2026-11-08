import { useEffect, useRef, type ReactNode } from 'react';
import './sticky-header.css';

/** Remains in normal flow; only the background responds to scroll. */
export default function StickyHeader({ children, className = 'topbar' }: { children: ReactNode; className?: string }) {
  const backdrop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const paint = () => {
      frame = 0;
      if (backdrop.current) backdrop.current.style.opacity = String(Math.min(1, Math.max(0, window.scrollY) / 72));
    };
    const scroll = () => { if (!frame) frame = requestAnimationFrame(paint); };
    paint();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => { window.removeEventListener('scroll', scroll); cancelAnimationFrame(frame); };
  }, []);
  return <header className={`${className} sticky-header`}>
    <div className="sticky-header-backdrop" ref={backdrop} aria-hidden="true" />
    {children}
  </header>;
}
