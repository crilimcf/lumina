import React, { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Empty } from '../ui.jsx';
import { language } from '../i18n.js';

export function Legal({ page, onBack }) {
  const [text, setText] = useState(null);
  useEffect(() => {
    let alive = true;
    setText(null);
    const suffix = language === 'pt' ? '' : `.${language}`;
    fetch(`/legal/${page}${suffix}.md`)
      .then(r => r.ok ? r.text() : null)
      .then(value => { if (alive) setText(value); })
      .catch(() => { if (alive) setText(null); });
    return () => { alive = false; };
  }, [page]);
  return <div style={{ minHeight:'100dvh',background:'var(--paper)' }}><div style={{ maxWidth:640,margin:'0 auto',padding:20 }}><button className="p" onClick={onBack} aria-label="Voltar" style={{ padding:10,marginBottom:22 }}><ArrowLeft size={16}/></button>{text===null?<Empty>Não foi possível carregar. Escreve para o contacto de apoio.</Empty>:<pre data-i18n-ignore="true" style={{ whiteSpace:'pre-wrap',fontFamily:'inherit',fontSize:15,lineHeight:1.6 }}>{text}</pre>}</div></div>;
}
