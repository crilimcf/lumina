import React from 'react';
import { ArrowUpRight, Flag, Shield, User, Users } from 'lucide-react';
import { api } from '../api.js';
import { PAL, Orb } from '../ui.jsx';
import { Nav, Toast } from '../components/AppChrome.jsx';

export function Perfil({
  me, coms, days, blocked, setBlocked, setScreen, logout,
  tab, setTab, setThread, setComp, threads, ping, toast,
}) {
  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 460, margin: '0 auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <Orb p={me.palette} avatarUrl={me.avatar_url} s={82} cls="float" />
          <button className="p" onClick={() => setScreen('editar-perfil')} style={{ marginTop: 4 }}>Editar perfil</button>
        </div>
        <h2 className="d" style={{ fontSize: 38, margin: '26px 0 8px' }}>{me.name}</h2>
        <div className="m">@{me.handle} · {me.followers || 0} seguidores</div>
        <p style={{ fontSize: 16, lineHeight: 1.45, color: 'var(--grey)', margin: '16px 0 22px' }}>{me.bio || 'Sem descrição.'}</p>

        <div className="m" style={{ marginBottom: 9 }}>As tuas comunidades</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 24 }}>
          {coms.map((c, i) => <span key={c.id} className="star" style={{ background: PAL[i % 5].chip }}>{c.name}</span>)}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 11, marginBottom: 24 }}>
          {[['Dias respondidos', days.filter(d => d.answered).length, PAL[3].chip],
            ['Comunidades', coms.length, PAL[1].chip]].map(([label, value, bg]) => (
            <div key={label} style={{ background: bg, borderRadius: 22, padding: '18px 16px', boxShadow: 'inset 0 2px 0 rgba(255,255,255,.7),0 10px 22px -6px rgba(30,16,90,.24)' }}>
              <div className="d" style={{ fontSize: 30 }}>{value}</div>
              <div className="m" style={{ marginTop: 5, color: 'rgba(20,18,42,.55)' }}>{label}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div className="m" style={{ marginBottom: 8 }}>Os teus dados</div>
          <button className="p p-sm" style={{ marginRight: 8 }}
            onClick={async () => { try { await api.account.download(); ping('Descarregado'); } catch (e) { ping(e.message); } }}>
            Descarregar tudo
          </button>
          <button className="p p-sm" style={{ color: 'var(--coral)' }}
            onClick={async () => {
              if (!confirm('Apagar a conta? Tens 30 dias para mudar de ideias.')) return;
              try { const r = await api.account.remove(); ping(r.message); } catch (e) { ping(e.message); }
            }}>Apagar conta</button>
          <p style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--grey)', marginTop: 12 }}>
            Podes levar os teus dados contigo a qualquer momento. O apagamento tem 30 dias
            de espera — entra outra vez até lá para cancelar.
          </p>
        </div>

        <button className="card" onClick={() => setScreen('amigos')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <User size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Amigos</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        <button className="card" onClick={() => setScreen('comunidades')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Users size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Comunidades</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        <button className="card" onClick={() => setScreen('seguranca')}
          style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <Shield size={17} color="var(--grey)" />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Segurança da conta</span>
          <ArrowUpRight size={17} color="#ADA6CC" />
        </button>

        {coms.some(c => c.role === 'moderator' || c.role === 'founder') && (
          <button className="card" onClick={() => setScreen('moderacao')}
            style={{ width: '100%', border: 0, cursor: 'pointer', padding: 18, textAlign: 'left', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Flag size={17} color="var(--grey)" />
            <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>Moderação</span>
            <ArrowUpRight size={17} color="#ADA6CC" />
          </button>
        )}

        <div className="card" style={{ padding: 18, marginBottom: 12 }}>
          <div className="m" style={{ marginBottom: 10 }}>Pessoas bloqueadas</div>
          {blocked.length === 0
            ? <p style={{ fontSize: 14, color: 'var(--grey)' }}>Ninguém bloqueado.</p>
            : blocked.map(b => (
              <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '8px 0' }}>
                <Orb p={b.palette} s={30} />
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{b.name}</span>
                <button className="p p-sm" onClick={async () => {
                  try { await api.users.unblock(b.id); setBlocked(await api.users.blocked()); ping('Desbloqueado'); }
                  catch (e) { ping(e.message); }
                }}>Desbloquear</button>
              </div>
            ))}
        </div>

        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '20px 0' }}>
          <button className="m" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setScreen('TERMOS')}>Termos</button>
          <button className="m" style={{ background: 'none', border: 0, cursor: 'pointer' }} onClick={() => setScreen('PRIVACIDADE')}>Privacidade</button>
        </div>

        <button className="p" onClick={logout} style={{ width: '100%', color: 'var(--coral)' }}>Sair</button>
      </div>
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />
    </div>
  );
}
