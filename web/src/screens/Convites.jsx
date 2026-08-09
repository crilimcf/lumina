import React from 'react';
import { ArrowUp, Flag, Plus } from 'lucide-react';
import { PAL, Empty } from '../ui.jsx';
import { Composer, Nav, Toast } from '../components/AppChrome.jsx';

export function Convites({
  tab, setTab, coms, pick, setPick, pool, idea, setIdea, vote, propose, report,
  setScreen, comp, setComp, file, setFile, palette, setPalette, body, setBody,
  busy, publish, threads, setThread, ping, toast,
}) {
  if (coms.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
        <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          <h2 className="d" style={{ fontSize: 42, margin: '10px 0 10px' }}>Con<span className="it">vites</span></h2>
          <Empty>
            Ainda não estás em nenhuma comunidade — por isso não há convite nenhum para mostrar.
            <button className="p p-cr" style={{ width: '100%', padding: 14, fontSize: 15, marginTop: 16 }}
              onClick={() => setScreen('comunidades')}>Criar ou entrar numa comunidade</button>
          </Empty>
        </div>
        <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
        <Toast text={toast} />
      </div>
    );
  }

  const cur = coms.find(c => c.id === pick) || coms[0];
  const pickIdx = Math.max(0, coms.findIndex(c => c.id === cur?.id));
  const sorted = [...pool].sort((a, b) => b.vote_count - a.vote_count);
  const tomorrow = sorted[0];
  const hours = cur?.closes_at ? Math.max(0, Math.round((new Date(cur.closes_at) - Date.now()) / 3600000)) : 0;

  return (
    <div style={{ minHeight: '100dvh', paddingBottom: 100, background: 'linear-gradient(180deg,#EFEDFB,#DFDCF2)' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
        <h2 className="d" style={{ fontSize: 42, margin: '10px 0 10px' }}>Con<span className="it">vites</span></h2>
        <p style={{ fontSize: 15, lineHeight: 1.45, color: 'var(--grey)', margin: '0 0 20px' }}>
          Cada comunidade tem o seu. Qualquer membro pode propor; o mais votado é o de amanhã.
        </p>

        <div className="ns" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 20 }}>
          {coms.map(c => (
            <button key={c.id} onClick={() => setPick(c.id)} className={cur?.id === c.id ? 'p p-sm p-ink' : 'p p-sm'} style={{ flexShrink: 0, position: 'relative' }}>
              {c.name}
              {c.invite_id && !c.answered && <span style={{ position: 'absolute', top: 2, right: 4, width: 6, height: 6, borderRadius: 9, background: 'var(--coral)' }} />}
            </button>
          ))}
        </div>

        <div className="card in" key={cur?.id} style={{ padding: 20, marginBottom: 12, background: PAL[pickIdx % 5].chip }}>
          {!cur?.invite_id ? (
            <>
              <div className="m" style={{ marginBottom: 8 }}>Hoje sem convite</div>
              <p style={{ fontSize: 15, lineHeight: 1.45 }}>
                Esta comunidade ficou sem propostas. Deixa uma ideia em baixo para amanhã haver convite.
              </p>
            </>
          ) : (<>
            <div className="m" style={{ marginBottom: 8 }}>Hoje em {cur.name} · faltam {hours} h</div>
            <div className="d" style={{ fontSize: 32, marginBottom: 10, lineHeight: .96 }}>{cur.invite_text}</div>
            <div className="m" style={{ marginBottom: 16 }}>{cur.reply_count} respostas</div>
            {cur.answered
              ? <div className="m" style={{ color: 'rgba(20,18,42,.6)' }}>Respondeste · vê tudo no feed</div>
              : <button className="p p-cr" style={{ width: '100%', padding: 14, fontSize: 15 }}
                  onClick={() => setComp({ community: cur.id, inviteId: cur.invite_id, title: cur.invite_text })}>Responder</button>}
          </>)}
        </div>

        {tomorrow && (
          <div className="card rise" key={tomorrow.id} style={{ padding: 20, marginBottom: 26 }}>
            <div className="m" style={{ marginBottom: 8 }}>Amanhã · o mais votado</div>
            <div className="d" style={{ fontSize: 23, marginBottom: 8, lineHeight: 1 }}>{tomorrow.text}</div>
            <div className="m">{tomorrow.vote_count} votos · de {tomorrow.author_name || 'alguém'}</div>
            <p style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--grey)', marginTop: 14 }}>
              Ainda pode mudar. Vota noutra ideia e vê este cartão trocar.
            </p>
          </div>
        )}

        <div className="m" style={{ marginBottom: 10 }}>Propor um convite</div>
        <div style={{ display: 'flex', gap: 9, marginBottom: 26 }}>
          <input value={idea} onChange={e => setIdea(e.target.value)} onKeyDown={e => e.key === 'Enter' && propose()}
            placeholder="ex: uma coisa que não acabaste" maxLength={120} />
          <button className="p p-ink" onClick={propose} disabled={!idea.trim()} aria-label="Propor convite" style={{ padding: '12px 16px' }}><Plus size={16} /></button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 className="d" style={{ fontSize: 21 }}>Em <span className="it">votação</span></h3>
          <span className="m">{sorted.length} ideias</span>
        </div>
        {sorted.length === 0 && <Empty>Ainda sem propostas. Deixa a primeira.</Empty>}
        <div style={{ display: 'grid', gap: 10 }}>
          {sorted.map((x, i) => (
            <div key={x.id} className="card in" style={{
              padding: 14, display: 'flex', alignItems: 'center', gap: 12, animationDelay: `${i * 45}ms`,
              boxShadow: i === 0 ? '0 0 0 2px var(--coral),0 14px 32px -10px rgba(30,16,90,.26)' : undefined,
            }}>
              <button onClick={() => vote(x)} style={{
                border: 0, borderRadius: 15, cursor: 'pointer', padding: '9px 10px', minWidth: 48,
                display: 'grid', placeItems: 'center', gap: 1, transition: 'background .2s',
                background: x.voted ? 'var(--ink)' : '#F1EFFA', color: x.voted ? '#fff' : 'var(--ink)',
              }}>
                <ArrowUp size={14} strokeWidth={2.7} /><span style={{ fontSize: 12, fontWeight: 700 }}>{x.vote_count}</span>
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-.02em', lineHeight: 1.25 }}>{x.text}</div>
                <div className="m" style={{ marginTop: 4 }}>{i === 0 ? 'a ganhar · ' : ''}{x.author_name || 'alguém'}</div>
              </div>
              <button onClick={() => report('proposal', x.id)} aria-label="Denunciar proposta" style={{ background: 'none', border: 0, cursor: 'pointer', color: '#C4BEDC', padding: 6 }}>
                <Flag size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <Composer comp={comp} setComp={setComp} coms={coms} file={file} setFile={setFile}
        palette={palette} setPalette={setPalette} body={body} setBody={setBody} busy={busy} publish={publish} />
      <Nav tab={tab} setTab={setTab} setThread={setThread} setComp={setComp} coms={coms} threads={threads} ping={ping} />
      <Toast text={toast} />
    </div>
  );
}
