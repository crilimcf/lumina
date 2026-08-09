import React from 'react';
import { Camera, DoorOpen, Home, Timer } from 'lucide-react';

const WELCOME_ITEMS = [
  { icon: Home, title: 'Feed cronológico', body: 'O Feed mostra as publicações das pessoas que segues, por ordem cronológica. Likes e fogos servem para reagir — não para decidir a ordem.' },
  { icon: DoorOpen, title: 'Salas públicas ou privadas', body: 'Cria ou entra em Salas para falar de temas específicos. As públicas podem ser descobertas por todos; as privadas funcionam por convite.' },
  { icon: Camera, title: 'Momentos por 24 horas', body: 'Partilha uma fotografia ou vídeo durante 24 horas. Enquanto estiver ativo, podes substituir o media ou apagar o Momento quando quiseres.' },
  { icon: Timer, title: 'Conversas à tua maneira', body: 'No Chat podes falar normalmente ou usar mensagens com temporizador e conteúdos para abrir uma só vez.' },
];

export function Welcome({ onContinue }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: '48px 22px calc(26px + env(safe-area-inset-bottom))' }}>
        <div className="m" style={{ color: 'var(--cobalt)', marginBottom: 10 }}>Bem-vindo à Lumina</div>
        <h1 className="d" style={{ fontSize: 'clamp(32px,9vw,44px)', lineHeight: 1.08, marginBottom: 14 }}>
          Antes de começares, quatro coisas para saberes
        </h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--grey)', marginBottom: 30 }}>
          Pessoas no Feed, tópicos nas Salas e liberdade para partilhares ao teu ritmo.
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
