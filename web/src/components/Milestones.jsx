import React from 'react';
import { Camera, Home, Sparkles, Timer } from 'lucide-react';
import { Orb } from '../ui.jsx';

// Sem streak que reseta — um marco só soma; nunca é uma sequência que se perde.
const MILESTONES = [7, 30, 100, 365, 1000];
const MILESTONE_COPY = {
  7: 'Uma semana inteira de dias respondidos. Já é um hábito.',
  30: 'Trinta dias. Um mês inteiro a aparecer para a tua gente.',
  100: 'Cem dias respondidos. Isto já é teu.',
  365: 'Um ano inteiro de dias respondidos.',
  1000: 'Mil dias. A sério.',
};

/** Compara o total vitalício com o que já foi celebrado e devolve o marco novo, se houver. */
export function checkMilestone(lifetime, userId) {
  if (!userId || !Number.isFinite(lifetime)) return null;
  const key = `lumina.milestone.${userId}`;
  const last = Number(localStorage.getItem(key) || 0);
  const crossed = MILESTONES.filter(m => m <= lifetime && m > last);
  if (!crossed.length) return null;
  const milestone = crossed[crossed.length - 1];
  localStorage.setItem(key, String(milestone));
  return milestone;
}

export function Marco({ milestone, onContinue }) {
  return (
    <div style={{ minHeight: '100dvh', position: 'relative', display: 'flex', flexDirection: 'column', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div className="halo" style={{ top: -70, right: -60, width: 260, height: 260, background: '#FF9A7E' }} />
      <div className="halo" style={{ bottom: 100, left: -80, width: 220, height: 220, background: '#9C93F2', animationDelay: '.3s' }} />
      <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 26px', textAlign: 'center' }}>
        <div className="pill" style={{ marginBottom: 22 }}><Orb p={2} s={64} cls="float" /></div>
        <div className="m up" style={{ color: 'var(--coral)', marginBottom: 10 }}>Marco</div>
        <h1 className="d up" style={{ fontSize: 'clamp(64px,22vw,104px)', animationDelay: '.08s' }}>{milestone}</h1>
        <p className="up" style={{ fontSize: 17, lineHeight: 1.5, color: 'var(--grey)', maxWidth: 320, margin: '18px 0 34px', animationDelay: '.16s' }}>
          {MILESTONE_COPY[milestone] || `${milestone} dias respondidos.`}
        </p>
        <button className="p p-brand up" style={{ padding: '14px 26px', fontSize: 15, animationDelay: '.24s' }} onClick={onContinue}>
          Continuar
        </button>
      </div>
    </div>
  );
}

const WELCOME_ITEMS = [
  { icon: Sparkles, title: 'Um convite por dia', body: 'Cada dia há uma pergunta ou desafio para a tua comunidade. Quem está lá propõe ideias e vota — o convite do dia é sempre escolhido pela tua gente, nunca por um algoritmo.' },
  { icon: Home, title: 'Comunidades pequenas', body: 'Junta-te ou cria uma comunidade fechada com amigos de verdade. O feed é só delas, por ordem cronológica — sem posts patrocinados, sem scroll infinito.' },
  { icon: Camera, title: 'Momentos', body: 'Partilha uma foto ou só uma cor, visível 24 horas para quem partilha uma comunidade contigo. Depois desaparece — como um Story, mas sem ninguém de fora a ver.' },
  { icon: Timer, title: 'Mensagens efémeras', body: 'Manda uma mensagem com temporizador ou para abrir só uma vez. Passado esse tempo, é apagada a sério do servidor — não só escondida no ecrã.' },
];

/** Ecrã de boas-vindas, mostrado uma única vez logo a seguir ao registo. */
export function Welcome({ onContinue }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 22px calc(26px + env(safe-area-inset-bottom))' }}>
        <div className="m" style={{ color: 'var(--coral)', marginBottom: 10 }}>Bem-vindo à Lumina</div>
        <h1 className="d" style={{ fontSize: 'clamp(32px,9vw,44px)', lineHeight: 1.08, marginBottom: 14 }}>
          Antes de começares, quatro coisas para saberes
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--grey)', marginBottom: 30 }}>
          A Lumina não tem anúncios nem algoritmo — só a tua gente, um convite por dia.
        </p>

        <div style={{ display: 'grid', gap: 16, marginBottom: 30 }}>
          {WELCOME_ITEMS.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card" style={{ padding: 18, display: 'flex', gap: 14 }}>
              <div style={{ width: 40, height: 40, flexShrink: 0, display: 'grid', placeItems: 'center' }}>
                <Icon size={18} strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{title}</div>
                <p style={{ fontSize: 13.5, lineHeight: 1.45, color: 'var(--grey)' }}>{body}</p>
              </div>
            </div>
          ))}
        </div>

        <button className="p p-brand" style={{ width: '100%', padding: 15, fontSize: 15 }} onClick={onContinue}>
          Entendido, vamos lá
        </button>
      </div>
    </div>
  );
}
