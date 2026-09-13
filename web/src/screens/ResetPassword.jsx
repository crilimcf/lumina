import React, { useMemo, useState } from 'react';
import { api } from '../api.js';
import { ErrorNote } from '../ui.jsx';
import { t } from '../i18n.js';

/** Ecrã público aberto pela ligação enviada por email em /recuperar?token=… */
export function ResetPassword() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token') || '', []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState(null);

  const goLogin = () => {
    window.history.replaceState(window.history.state, '', '/');
    window.location.reload();
  };

  const submit = async (event) => {
    event.preventDefault();
    setErr(null);
    if (!token) {
      setErr(new Error(t('A ligação de recuperação é inválida ou está incompleta.')));
      return;
    }
    if (password.length < 8) {
      setErr(new Error(t('A password precisa de 8 caracteres ou mais.')));
      return;
    }
    if (password !== confirm) {
      setErr(new Error(t('As passwords não coincidem.')));
      return;
    }

    setBusy(true);
    try {
      await api.account.reset({ token, password });
      // O token é uma credencial de uso único: retirá-lo do URL assim que for consumido.
      window.history.replaceState(window.history.state, '', '/recuperar');
      setDone(true);
    } catch (error) {
      setErr(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lumina-auth" style={{ minHeight: '100dvh', position: 'relative', background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div aria-hidden="true" style={{ position: 'absolute', top: -90, right: -70, width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%,#FFE9A8,#FF5442 70%)', filter: 'blur(3px)', opacity: .4 }} />
      <div aria-hidden="true" style={{ position: 'absolute', bottom: -60, left: -70, width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle at 40% 35%,#DCD8FF,#2B2BF7 75%)', filter: 'blur(3px)', opacity: .32 }} />

      <main className="auth-shell" style={{ position: 'relative', maxWidth: 440, margin: '0 auto', padding: '52px 22px 40px' }}>
        <span className="m auth-kicker" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginBottom: 18 }}>
          <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 9, background: 'var(--coral)' }} />
          Lumina
        </span>
        <h1 className="d auth-title" style={{ fontSize: 'clamp(42px,12vw,64px)', marginBottom: 14 }}>
          {done ? t('Password atualizada') : t('Nova password')}
        </h1>

        {done ? (
          <section className="card in auth-card" style={{ padding: 22 }}>
            <p style={{ fontSize: 15, lineHeight: 1.5, color: 'var(--grey)' }}>
              {t('A tua password foi alterada. Já podes entrar na Lumina com a nova password.')}
            </p>
            <button className="p p-brand" type="button" onClick={goLogin} style={{ width: '100%', padding: 15, marginTop: 18 }}>
              {t('Ir para o login')}
            </button>
          </section>
        ) : (
          <form onSubmit={submit} className="card in auth-card" style={{ padding: 22, display: 'grid', gap: 12 }}>
            <p style={{ fontSize: 14, lineHeight: 1.45, color: 'var(--grey)', marginBottom: 4 }}>
              {token
                ? t('Escolhe uma nova password para a tua conta.')
                : t('Esta ligação de recuperação não contém um token válido. Pede uma nova ligação no ecrã de login.')}
            </p>
            <input
              type="password"
              placeholder={t('Nova password')}
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={!token || busy}
            />
            <input
              type="password"
              placeholder={t('Confirmar nova password')}
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              disabled={!token || busy}
            />
            <ErrorNote error={err} />
            <button className="p p-brand" disabled={!token || busy} style={{ padding: 15, fontSize: 15, marginTop: 4 }}>
              {busy ? t('Um momento…') : t('Guardar nova password')}
            </button>
            <button type="button" className="m" onClick={goLogin} style={{ background: 'none', border: 0, cursor: 'pointer', padding: 8 }}>
              {t('Voltar ao login')}
            </button>
          </form>
        )}
      </main>
    </div>
  );
}
