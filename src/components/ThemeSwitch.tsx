import { useEffect, useState, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
import { Moon, Sun } from 'lucide-react';

type Scheme = 'light' | 'dark';
const KEY = 'trendbeak-theme';
// Runs before the stylesheet to honor a saved preference on the first paint.
export const THEME_BOOTSTRAP = `(()=>{let s;try{s=localStorage.getItem('${KEY}')}catch{}if(s!=='light'&&s!=='dark')s=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';document.documentElement.dataset.theme=s;let m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement('meta');m.name='theme-color';document.head.append(m)}m.content=s==='dark'?'#000000':'#ffffff'})()`;
function apply(scheme: Scheme) {
  document.documentElement.dataset.theme = scheme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', scheme === 'dark' ? '#000000' : '#ffffff');
}
export function useColorScheme() {
  const [scheme, update] = useState<Scheme>('light');
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(KEY); } catch { /* Optional storage. */ }
      const next = saved === 'light' || saved === 'dark' ? saved : media.matches ? 'dark' : 'light';
      apply(next); update(next);
    };
    sync(); media.addEventListener('change', sync);
    const storage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) sync(); };
    window.addEventListener('storage', storage);
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', storage); };
  }, []);
  const setScheme = (next: Scheme) => {
    try { localStorage.setItem(KEY, next); } catch { /* Theme still works without persistence. */ }
    apply(next); update(next);
  };
  return { scheme, setScheme };
}
export default function ThemeSwitch({ scheme, setScheme }: { scheme: Scheme; setScheme: (value: Scheme) => void }) {
  const toggle = async (event: MouseEvent<HTMLButtonElement>) => {
    const next = scheme === 'dark' ? 'light' : 'dark';
    const update = () => flushSync(() => setScheme(next));
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { update(); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.detail ? event.clientX : rect.left + rect.width / 2;
    const y = event.detail ? event.clientY : rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    const transition = document.startViewTransition(update);
    let animation: Animation | undefined;
    try {
      await transition.ready;
      const clips = [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`];
      animation = document.documentElement.animate({ clipPath: next === 'dark' ? clips.reverse() : clips }, {
        duration: 400, easing: 'ease-out', fill: 'forwards',
        pseudoElement: next === 'dark' ? '::view-transition-old(root)' : '::view-transition-new(root)',
      });
      await transition.finished;
    } catch { /* Navigation or another toggle may cancel the visual transition. */ }
    finally { animation?.cancel(); }
  };
  return <button type="button" className="theme-switch" aria-label={scheme === 'dark' ? '切换至浅色模式' : '切换至深色模式'} onClick={toggle}>
    {scheme === 'dark' ? <Moon size={19} /> : <Sun size={19} />}
  </button>;
}
