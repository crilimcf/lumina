import React, { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { Orb, Skeleton } from '../ui.jsx';

/** Ecrã diário de abertura, antes do feed. */
export function Abertura({ me, coms, days, onAnswer, onSkip, onCreateCommunity }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setStep(1), 240);
    const b = setTimeout(() => setStep(2), 900);
    return () => { clearTimeout(a); clearTimeout(b); };
  }, []);

  const main = coms.find(c => c.invite_id && !c.answered) || coms.find(c => c.invite_id) || coms[0];
  const pending = coms.filter(c => c.invite_id && !c.answered).length;
  const words = (main?.invite_text || '').split(' ');
  const hours = main?.closes_at ? Math.max(0, Math.round((new Date(main.closes_at) - Date.now()) / 3600000)) : 0;
  const total = days.filter(d => d.answered).length;

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      {step >= 1 && (<>
        <div className="halo" style={{ top: -70, right: -60, width: 240, height: 240, background: '#FF9A7E' }} />
        <div className="halo" style={{ bottom: 130, left: -80, width: 220, height: 220, background: '#9C93F2', animationDelay: '.3s' }} />
      </>)}

      <div style={{ position: 'relative', maxWidth: 460, margin: '0 auto', padding: '26px 20px 40px', minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 38 }}>
          {step === 0 ? <Skeleton w={38} h={38} r={99} /> : <div className="pill"><Orb p={me.palette} s={38} /></div>}
          <div style={{ flex: 1 }}>
            {step === 0 ? <Skeleton w={96} h={11} /> : <div className="m up">Olá, {me.name.split(' ')[0]}</div>}
          </div>
          {step === 0 ? <Skeleton w={74} h={11} /> : <div className="m up" style={{ animationDelay: '.1s' }}>{main?.name}</div>}
        </div>

        <div style={{ marginBottom: 30 }}>
          {step === 0 ? (
            <><Skeleton w="58%" h={15} st={{ marginBottom: 18 }} /><Skeleton w="90%" h={44} st={{ marginBottom: 12 }} /><Skeleton w="62%" h={44} /></>
          ) : coms.length === 0 ? (
            <>
              <div className="m up" style={{ color: 'var(--coral)', marginBottom: 16 }}>Ainda sem comunidade</div>
              <h1 className="d up" style={{ fontSize: 'clamp(34px,9vw,46px)' }}>Junta-te ou cria a tua <span className="it">comunidade</span></h1>
              <p className="up" style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)', marginTop: 16 }}>
                Sem uma comunidade não há convite diário nem publicações. Cria a tua ou entra numa já existente — demora menos de um minuto.
              </p>
            </>
          ) : !main?.invite_text ? (
            <>
              <div className="m up" style={{ color: 'var(--coral)', marginBottom: 16 }}>Hoje sem convite</div>
              <h1 className="d up" style={{ fontSize: 'clamp(34px,9vw,46px)' }}>A tua comunidade ficou sem <span className="it">propostas</span></h1>
              <p className="up" style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)', marginTop: 16 }}>
                Deixa uma ideia na lista para amanhã haver convite.
              </p>
            </>
          ) : (
            <>
              <div className="m up" style={{ color: 'var(--coral)', marginBottom: 16 }}>
                O convite de hoje · faltam {hours} h
              </div>
              <h1 className="d" style={{ fontSize: 'clamp(42px,12vw,58px)' }}>
                {words.map((w, i) => (
                  <span key={i} className="w" style={{ animationDelay: `${i * 130}ms`, marginRight: '.22em' }}>
                    {i === words.length - 1 ? <span className="it">{w}</span> : w}
                  </span>
                ))}
              </h1>
            </>
          )}
        </div>

        {step >= 2 && main?.reply_count > 0 && (
          <div className="up" style={{ fontSize: 14, color: 'var(--grey)', marginBottom: 30 }}>
            {main.reply_count} {main.reply_count === 1 ? 'pessoa já respondeu' : 'pessoas já responderam'}
          </div>
        )}

        {step >= 2 && (
          <div className="up" style={{ animationDelay: '.22s', marginBottom: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 13 }}>
              <span className="m">Os teus dias</span>
              <span className="m">{total} respostas · 4 semanas</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(14,1fr)', gap: 7 }}>
              {days.slice(0, 27).map((d, i) => (
                <div key={d.date} className="dot" style={{
                  aspectRatio: '1', background: d.answered ? 'var(--ink)' : 'rgba(20,18,42,.09)',
                  transform: d.answered ? 'none' : 'scale(.62)', transitionDelay: `${i * 22}ms`,
                }} />
              ))}
              <div className="dot glow" style={{ aspectRatio: '1', background: 'var(--coral)' }} />
            </div>
            <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--grey)', margin: '14px 2px 0' }}>
              Os dias que falhaste ficam em branco e ficam assim. Não há contador a
              zerar nem nada a perder — só o desenho a crescer.
            </p>
          </div>
        )}

        <div style={{ marginTop: 34 }}>
          {step === 0 ? <Skeleton w="100%" h={52} r={99} /> : step >= 2 && (
            coms.length === 0 ? (
              <button className="p p-cr up" onClick={onCreateCommunity}
                style={{ width: '100%', padding: 15, fontSize: 15, animationDelay: '.34s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                Criar ou entrar numa comunidade <ArrowUpRight size={17} />
              </button>
            ) : (
            <>
              {main?.invite_id && !main.answered && (
                <button className="p p-cr up" onClick={() => onAnswer(main)}
                  style={{ width: '100%', padding: 15, fontSize: 15, animationDelay: '.34s', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                  Responder ao convite <ArrowUpRight size={17} />
                </button>
              )}
              <button className="p up" onClick={onSkip}
                style={{ width: '100%', marginTop: 10, padding: '13px 16px', fontSize: 15, animationDelay: '.42s', background: 'transparent', boxShadow: 'none', color: 'var(--grey)' }}>
                {pending > 1 ? `Ver o feed · +${pending - 1} convites por responder` : 'Ver o feed'}
              </button>
            </>
            )
          )}
        </div>
      </div>
    </div>
  );
}
