import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export function ScrollToTopButton({ threshold = 620 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let ticking = false;
    const sync = () => {
      ticking = false;
      setVisible(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, { passive:true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [threshold]);

  if (!visible) return null;
  return <button
    type="button"
    className="radar-scroll-top in"
    aria-label="Voltar ao topo"
    onClick={()=>window.scrollTo({ top:0, behavior:'smooth' })}
  >
    <ArrowUp size={19} strokeWidth={2.5}/>
  </button>;
}
