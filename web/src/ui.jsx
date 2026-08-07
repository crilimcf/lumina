import React from 'react';

export const PAL = [
  { o1: '#FFB3A6', o2: '#FF5442', bg: 'linear-gradient(155deg,#FFD9CE,#FF7A63 60%,#E8341C)', chip: '#FFD9CE' },
  { o1: '#B8B0FF', o2: '#2B2BF7', bg: 'linear-gradient(155deg,#DCD8FF,#7C74F0 58%,#2B2BF7)', chip: '#DCD8FF' },
  { o1: '#C9E9A8', o2: '#8FCB2E', bg: 'linear-gradient(155deg,#EEFFCC,#C4EE63 58%,#8FCB2E)', chip: '#EAFFC4' },
  { o1: '#FFDF9B', o2: '#F0A32E', bg: 'linear-gradient(155deg,#FFF3D2,#FFCB63 58%,#EE9A18)', chip: '#FFEFC6' },
  { o1: '#A8DDE9', o2: '#22A8C8', bg: 'linear-gradient(155deg,#D4F2F8,#6FD0E4 58%,#189FBF)', chip: '#D4F2F8' },
];

export const Orb = ({ p = 0, s = 34, cls = '', st = {} }) => (
  <div className={`orb ${cls}`} style={{ width: s, height: s, '--o1': PAL[p % 5].o1, '--o2': PAL[p % 5].o2, ...st }} />
);

export const Skeleton = ({ w = '100%', h = 14, r = 8, st = {} }) => (
  <div className="sk" style={{ width: w, height: h, borderRadius: r, ...st }} />
);

/** Mensagem de erro reutilizável. Fala em português, não em códigos HTTP. */
export const ErrorNote = ({ error, onRetry }) => !error ? null : (
  <div style={{
    background: '#FFE4DF', border: '1px solid #FFC9BF', borderRadius: 16,
    padding: '13px 16px', fontSize: 14, lineHeight: 1.4, color: '#7A2213', margin: '12px 0',
  }}>
    {error.message}
    {onRetry && (
      <button onClick={onRetry} style={{
        display: 'block', marginTop: 9, background: 'none', border: 0, padding: 0,
        color: '#B3341C', fontWeight: 600, fontSize: 13, cursor: 'pointer', font: 'inherit',
      }}>Tentar outra vez</button>
    )}
  </div>
);

export const Empty = ({ children }) => (
  <div className="m" style={{ padding: 40, textAlign: 'center', lineHeight: 1.6 }}>{children}</div>
);

/**
 * Sem isto, um erro de render em qualquer sítio desmonta a app toda e o
 * React devolve um ecrã branco — sem pista nenhuma do que aconteceu, nem
 * forma de continuar sem fechar a aba.
 */
export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[erro fatal]', error, info.componentStack); }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
        textAlign: 'center', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)',
      }}>
        <h1 className="d" style={{ fontSize: 34, marginBottom: 14 }}>Qualquer coisa correu mal</h1>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--grey)', maxWidth: 340, marginBottom: 22 }}>
          Não é o teu telemóvel, é a Lumina. Recarrega a página — se continuar
          a acontecer, o que estavas a fazer ajuda-nos a perceber porquê.
        </p>
        <button className="p p-brand" style={{ padding: '13px 22px', fontSize: 14 }}
          onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}
