import React, { useEffect } from 'react';
import { Archive, ArchiveRestore, Ban, Bell, BellOff, Mail, Pin, PinOff, ShieldCheck, X } from 'lucide-react';
import { locale, t } from '../../i18n.js';
import { Orb } from '../../ui.jsx';

function previewText(message) {
  if (message.deleted_at) return t('Mensagem apagada');
  if (message.purged_at) return t('Mensagem indisponível');
  if (message.mode === 'once') return message.media_type === 'video'
    ? t('Vídeo de uma vez — abre a conversa para ver')
    : t('Foto de uma vez — abre a conversa para ver');
  if (message.mode === 'timer' && !message.body) return t('Mensagem efémera — abre a conversa para ver');
  if (message.kind === 'media') return message.media_type === 'video' ? t('Vídeo') : t('Fotografia');
  return message.body || t('Mensagem');
}

function messageTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { hour:'2-digit', minute:'2-digit' }).format(date);
  } catch {
    return '';
  }
}

export function ConversationContextMenu({ item, me, messages = [], loading = false, busyAction = '', onClose, onAction }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = event => { if (event.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const actions = [
    { key:'unread', label:t('Marcar como não lida'), icon:Mail },
    { key:'pin', label:item.pinned ? t('Desafixar') : t('Afixar'), icon:item.pinned ? PinOff : Pin },
    { key:'mute', label:item.muted ? t('Reativar som') : t('Silenciar'), icon:item.muted ? Bell : BellOff },
    { key:'archive', label:item.archived ? t('Desarquivar') : t('Arquivar'), icon:item.archived ? ArchiveRestore : Archive },
    { key:'block', label:t('Bloquear'), icon:Ban, destructive:true },
  ];

  return <div className="messages-context-backdrop" role="presentation" onPointerDown={event=>{ if (event.target === event.currentTarget) onClose?.(); }}>
    <div className="messages-context-stack" role="dialog" aria-modal="true" aria-label={t('Opções da conversa')} onPointerDown={event=>event.stopPropagation()}>
      <section className="messages-context-preview-card" aria-label={t('Pré-visualização privada')}>
        <header className="messages-context-preview-head">
          <span className="messages-context-avatar"><Orb p={item.palette} avatarUrl={item.avatar_url} s={44}/></span>
          <span className="messages-context-person">
            <strong>{item.name}</strong>
            <small>@{item.handle}</small>
          </span>
          <span className="messages-context-private"><ShieldCheck size={14}/>{t('Pré-visualização privada')}</span>
          <button type="button" className="messages-context-close" onClick={onClose} aria-label={t('Fechar')}><X size={19}/></button>
        </header>

        <div className="messages-context-private-note">{t('Podes ler esta pré-visualização sem enviar confirmação de leitura.')}</div>

        <div className="messages-context-message-list" aria-live="polite">
          {loading && <div className="messages-context-loading"><span/><span/><span/>{t('A carregar mensagens…')}</div>}
          {!loading && messages.length === 0 && <div className="messages-context-empty">{t('Ainda não há mensagens.')}</div>}
          {!loading && messages.map(message => {
            const mine = message.sender_id === me?.id;
            return <div key={message.id} className={`messages-context-message${mine ? ' is-mine' : ' is-theirs'}`}>
              <div className="messages-context-bubble">{previewText(message)}</div>
              <time>{messageTime(message.created_at)}</time>
            </div>;
          })}
        </div>
      </section>

      <section className="messages-context-actions" aria-label={t('Opções da conversa')}>
        {actions.map(({ key, label, icon:Icon, destructive }) => <button
          type="button"
          key={key}
          className={`messages-context-action${destructive ? ' is-destructive' : ''}`}
          disabled={!!busyAction}
          onClick={()=>onAction?.(key)}
        >
          <span>{busyAction === key ? <span className="messages-context-action-spinner"/> : <Icon size={20}/>}</span>
          <strong>{label}</strong>
        </button>)}
      </section>
    </div>
  </div>;
}
