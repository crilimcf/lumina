import React, { useState } from 'react';
import { api } from '../api.js';
import { ErrorNote } from '../ui.jsx';
import { Legal } from '../Seguranca.jsx';

/** Entrada na aplicação: login, registo e recuperação de password. */
export function Entrada({ onIn }) {
  const [mode, setMode] = useState('login');   // login · registo · esqueci
  const [f, setF] = useState({ email: '', password: '', handle: '', name: '', birthDate: '' });
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sent, setSent] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState('');
  const [legalPage, setLegalPage] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // Ecrãs internos (não navegação real): sem isto, os links de termos e
  // privacidade eram <a href> a saírem da SPA — sem router, a página
  // recarregava do zero e apagava tudo o que a pessoa já tinha escrito no
  // formulário de registo.
  if (legalPage) return <Legal page={legalPage} onBack={() => setLegalPage(null)} />;

  const submit = async (e) => {
    e.preventDefault();
    setErr(null); setBusy(true);
    try {
      if (mode === 'esqueci') { await api.account.forgot(f.email); setSent(true); return; }
      const out = mode === 'login'
        ? await api.auth.login({ email: f.email, password: f.password, code: code || undefined })
        : await api.auth.register({ ...f, acceptTerms: terms });
      if (out.needsCode) { setNeedsCode(true); return; }
      onIn(out.user, mode === 'registo');
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#FFE9A8,#FF5442 70%)', filter: 'blur(3px)', opacity: .4 }} />
      <div style={{ position: 'absolute', bottom: -60, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#DCD8FF,#2B2BF7 75%)', filter: 'blur(3px)', opacity: .32 }} />

      <div style={{ position: 'relative', maxWidth: 440, margin: '0 auto', padding: '52px 22px 40px' }}>
        <div className="up" style={{ marginBottom: 18 }}>
          <span className="m" style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--coral)' }} />
            Rede de amigos
          </span>
        </div>
        <h1 className="d up" style={{ fontSize: 'clamp(58px,17vw,84px)', animationDelay: '.06s' }}>
          Lumi<span className="it it-brand">na</span>
        </h1>
        <p className="up" style={{ fontSize: 16.5, lineHeight: 1.42, color: 'var(--grey)', margin: '20px 0 34px', maxWidth: 320, animationDelay: '.12s' }}>
          Uma pergunta por dia, escolhida pela tua gente — nunca por um algoritmo.
          Sem anúncios. Sem scroll infinito.
        </p>

        {sent ? (
          <div className="card in" style={{ padding: 22 }}>
            <h2 className="d" style={{ fontSize: 22, marginBottom: 10 }}>Vê o teu email</h2>
            <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)' }}>
              Se essa conta existir, enviámos uma ligação para escolheres uma password nova.
              Expira dentro de uma hora.
            </p>
            <button className="p" style={{ marginTop: 18 }} onClick={() => { setSent(false); setMode('login'); }}>Voltar</button>
          </div>
        ) : (
          <form onSubmit={submit} className="card in" style={{ padding: 22, display: 'grid', gap: 12, animationDelay: '.18s' }}>
            {mode === 'registo' && (
              <>
                <input placeholder="Como te chamas" value={f.name} onChange={set('name')} autoComplete="name" required />
                <input placeholder="Nome de utilizador" value={f.handle} onChange={set('handle')}
                  autoCapitalize="none" autoCorrect="off" pattern="[a-z0-9._]{3,24}" required />
                <label className="m" style={{ marginTop: 4 }}>Data de nascimento</label>
                <input type="date" value={f.birthDate} onChange={set('birthDate')}
                  max={new Date(Date.now() - 16 * 365.25 * 864e5).toISOString().slice(0, 10)} required />
              </>
            )}
            <input type="email" placeholder="Email" value={f.email} onChange={set('email')}
              autoComplete="email" autoCapitalize="none" required />
            {mode !== 'esqueci' && (
              <input type="password" placeholder="Password" value={f.password} onChange={set('password')}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required />
            )}
            {needsCode && (
              <>
                <label className="m">Código da tua app de autenticação</label>
                <input inputMode="numeric" pattern="[0-9]*" maxLength={11} value={code} autoFocus
                  onChange={e => setCode(e.target.value)} placeholder="000000"
                  style={{ letterSpacing: '.25em', textAlign: 'center' }} />
                <p style={{ fontSize: 12.5, color: 'var(--grey)', lineHeight: 1.4 }}>
                  Perdeste o telemóvel? Usa um dos códigos de emergência que guardaste.
                </p>
              </>
            )}

            {mode === 'registo' && (
              <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, color: 'var(--grey)', marginTop: 4 }}>
                <input type="checkbox" checked={terms} onChange={e => setTerms(e.target.checked)}
                  style={{ width: 20, height: 20, flexShrink: 0, marginTop: 1, accentColor: 'var(--coral)' }} required />
                <span>
                  Tenho 16 anos ou mais e aceito os{' '}
                  <button type="button" onClick={() => setLegalPage('TERMOS')}
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--cobalt)', cursor: 'pointer', textDecoration: 'underline' }}>termos</button> e a{' '}
                  <button type="button" onClick={() => setLegalPage('PRIVACIDADE')}
                    style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'var(--cobalt)', cursor: 'pointer', textDecoration: 'underline' }}>política de privacidade</button>.
                </span>
              </label>
            )}

            <ErrorNote error={err} />

            <button className="p p-brand" disabled={busy || (mode === 'registo' && !terms)} style={{ padding: 15, fontSize: 15, marginTop: 4 }}>
              {busy ? 'Um momento…' : mode === 'login' ? 'Entrar' : mode === 'registo' ? 'Criar conta' : 'Enviar ligação'}
            </button>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <button type="button" className="m" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                onClick={() => { setErr(null); setMode(mode === 'login' ? 'registo' : 'login'); }}>
                {mode === 'login' ? 'Criar conta' : 'Já tenho conta'}
              </button>
              {mode === 'login' && (
                <button type="button" className="m" style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0 }}
                  onClick={() => { setErr(null); setMode('esqueci'); }}>Esqueci a password</button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
