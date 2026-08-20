import React, { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Trash2, UsersRound, Video, X } from 'lucide-react';
import { api } from '../../api.js';
import { Orb } from '../../ui.jsx';
import { locale } from '../../i18n.js';

const MAX_OTHER_PEOPLE = 5;

const dictionary = {
  pt:{ launcher:'Vídeo em grupo', title:'Videochamadas de grupo', subtitle:'Cria um grupo privado no Direct e liga até 6 pessoas. Não cria uma Sala.', create:'Novo grupo', name:'Nome do grupo', choose:'Escolhe até 5 pessoas', selected:'selecionadas', save:'Criar grupo', creating:'A criar…', groups:'Os teus grupos', empty:'Ainda não tens grupos de videochamada.', call:'Iniciar videochamada', calling:'A iniciar…', delete:'Apagar grupo', deleteConfirm:'Apagar este grupo de videochamada?', close:'Fechar', min:'Escolhe pelo menos uma pessoa.', max:'Podes escolher no máximo 5 pessoas.', created:'Grupo criado.', deleted:'Grupo apagado.', people:'pessoas' },
  fr:{ launcher:'Vidéo de groupe', title:'Appels vidéo de groupe', subtitle:'Crée un groupe privé dans Direct et appelle jusqu’à 6 personnes. Cela ne crée pas de Salon.', create:'Nouveau groupe', name:'Nom du groupe', choose:'Choisis jusqu’à 5 personnes', selected:'sélectionnées', save:'Créer le groupe', creating:'Création…', groups:'Tes groupes', empty:'Tu n’as pas encore de groupe d’appel vidéo.', call:'Démarrer l’appel vidéo', calling:'Démarrage…', delete:'Supprimer le groupe', deleteConfirm:'Supprimer ce groupe d’appel vidéo ?', close:'Fermer', min:'Choisis au moins une personne.', max:'Tu peux choisir au maximum 5 personnes.', created:'Groupe créé.', deleted:'Groupe supprimé.', people:'personnes' },
  en:{ launcher:'Group video', title:'Group video calls', subtitle:'Create a private group in Direct and call up to 6 people. It does not create a Room.', create:'New group', name:'Group name', choose:'Choose up to 5 people', selected:'selected', save:'Create group', creating:'Creating…', groups:'Your groups', empty:'You do not have any video-call groups yet.', call:'Start video call', calling:'Starting…', delete:'Delete group', deleteConfirm:'Delete this video-call group?', close:'Close', min:'Choose at least one person.', max:'You can choose at most 5 people.', created:'Group created.', deleted:'Group deleted.', people:'people' },
  es:{ launcher:'Vídeo en grupo', title:'Videollamadas de grupo', subtitle:'Crea un grupo privado en Direct y llama hasta a 6 personas. No crea una Sala.', create:'Nuevo grupo', name:'Nombre del grupo', choose:'Elige hasta 5 personas', selected:'seleccionadas', save:'Crear grupo', creating:'Creando…', groups:'Tus grupos', empty:'Todavía no tienes grupos de videollamada.', call:'Iniciar videollamada', calling:'Iniciando…', delete:'Eliminar grupo', deleteConfirm:'¿Eliminar este grupo de videollamada?', close:'Cerrar', min:'Elige al menos una persona.', max:'Puedes elegir como máximo 5 personas.', created:'Grupo creado.', deleted:'Grupo eliminado.', people:'personas' },
};

const lang = String(locale || 'pt').slice(0,2).toLowerCase();
const copy = dictionary[lang] || dictionary.en;

export function GroupCallHub({ me, contacts = [], hidden = false, startGroupCall, callBusy, ping }) {
  const [open,setOpen]=useState(false);
  const [groups,setGroups]=useState([]);
  const [loading,setLoading]=useState(false);
  const [creating,setCreating]=useState(false);
  const [callingId,setCallingId]=useState(null);
  const [deletingId,setDeletingId]=useState(null);
  const [name,setName]=useState('');
  const [selected,setSelected]=useState([]);

  const people=useMemo(()=>contacts.filter(person=>person.id!==me?.id),[contacts,me?.id]);

  const load=async()=>{
    setLoading(true);
    try{setGroups(await api.calls.groups())}catch(e){ping?.(e.message)}finally{setLoading(false)}
  };
  useEffect(()=>{if(open)load()},[open]);
  if(hidden)return null;

  const togglePerson=id=>{
    setSelected(current=>{
      if(current.includes(id))return current.filter(value=>value!==id);
      if(current.length>=MAX_OTHER_PEOPLE){ping?.(copy.max);return current}
      return [...current,id];
    });
  };

  const create=async()=>{
    const clean=name.trim();
    if(clean.length<3){ping?.(copy.name);return}
    if(!selected.length){ping?.(copy.min);return}
    setCreating(true);
    try{
      await api.calls.createGroup({name:clean,memberIds:selected});
      setName('');setSelected([]);ping?.(copy.created);await load();
    }catch(e){ping?.(e.message)}finally{setCreating(false)}
  };

  const start=async group=>{
    if(callBusy||callingId)return;
    setCallingId(group.id);
    try{
      await startGroupCall?.(group);
      setOpen(false);
    }catch(e){ping?.(e.message)}finally{setCallingId(null)}
  };

  const remove=async group=>{
    if(group.creator_id!==me?.id||deletingId)return;
    if(!window.confirm(copy.deleteConfirm))return;
    setDeletingId(group.id);
    try{
      await api.calls.removeGroup(group.id);
      setGroups(current=>current.filter(item=>item.id!==group.id));
      ping?.(copy.deleted);
    }catch(e){ping?.(e.message)}finally{setDeletingId(null)}
  };

  return <>
    <button type="button" onClick={()=>setOpen(true)} aria-label={copy.launcher} style={{position:'fixed',right:14,bottom:'calc(88px + env(safe-area-inset-bottom))',zIndex:72,border:0,borderRadius:999,padding:'12px 16px',display:'flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#6C55FF,#FF5A79)',color:'#fff',fontWeight:850,boxShadow:'0 14px 34px rgba(38,25,99,.32)'}}><UsersRound size={18}/><span>{copy.launcher}</span></button>
    {open&&<div role="dialog" aria-modal="true" aria-label={copy.title} style={{position:'fixed',inset:0,zIndex:190,background:'rgba(6,8,18,.72)',backdropFilter:'blur(14px)',display:'grid',alignItems:'end'}}>
      <section style={{width:'100%',maxWidth:620,justifySelf:'center',maxHeight:'92dvh',overflow:'auto',background:'#F8F8FC',color:'#151426',borderRadius:'28px 28px 0 0',padding:'18px 16px calc(24px + env(safe-area-inset-bottom))',boxShadow:'0 -24px 60px rgba(0,0,0,.22)'}}>
        <header style={{display:'flex',alignItems:'flex-start',gap:12}}><div style={{flex:1}}><div style={{fontSize:12,fontWeight:850,letterSpacing:'.08em',textTransform:'uppercase',opacity:.5}}>Lumina Direct</div><h2 style={{margin:'4px 0 4px',fontSize:27}}>{copy.title}</h2><p style={{margin:0,opacity:.62,fontSize:14}}>{copy.subtitle}</p></div><button onClick={()=>setOpen(false)} aria-label={copy.close} style={{width:40,height:40,borderRadius:99,border:'1px solid #deddea',background:'#fff',display:'grid',placeItems:'center'}}><X size={19}/></button></header>

        <div style={{marginTop:20,padding:15,borderRadius:22,background:'#fff',border:'1px solid #E6E4F0'}}>
          <div style={{display:'flex',alignItems:'center',gap:8,fontWeight:850}}><Plus size={17}/>{copy.create}</div>
          <input value={name} onChange={e=>setName(e.target.value)} maxLength={60} placeholder={copy.name} style={{marginTop:12,width:'100%',boxSizing:'border-box',height:46,borderRadius:14,border:'1px solid #DCD9E8',padding:'0 13px',fontSize:16,background:'#FCFCFE'}}/>
          <div style={{display:'flex',justifyContent:'space-between',margin:'14px 1px 9px',fontSize:12,fontWeight:800,opacity:.6}}><span>{copy.choose}</span><span>{selected.length}/5 {copy.selected}</span></div>
          <div style={{display:'grid',gap:7,maxHeight:230,overflow:'auto'}}>{people.map(person=>{
            const active=selected.includes(person.id);
            return <button key={person.id} type="button" onClick={()=>togglePerson(person.id)} style={{border:active?'1px solid #6955FF':'1px solid #E6E4EE',background:active?'#F0EDFF':'#fff',borderRadius:16,padding:'9px 10px',display:'flex',alignItems:'center',gap:10,textAlign:'left'}}><Orb p={person.palette} avatarUrl={person.avatar_url} s={38}/><span style={{minWidth:0,flex:1}}><strong style={{display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{person.name}</strong><small style={{opacity:.55}}>@{person.handle}</small></span><span style={{width:26,height:26,borderRadius:99,display:'grid',placeItems:'center',background:active?'#6955FF':'#F0EFF5',color:active?'#fff':'#767187'}}>{active?<Check size={15}/>:<Plus size={15}/>}</span></button>
          })}</div>
          <button type="button" onClick={create} disabled={creating||selected.length===0||name.trim().length<3} style={{marginTop:13,width:'100%',height:46,border:0,borderRadius:15,background:'#18162A',color:'#fff',fontWeight:850,opacity:creating?0.6:1}}>{creating?copy.creating:copy.save}</button>
        </div>

        <div style={{marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'0 2px 9px'}}><strong>{copy.groups}</strong>{loading&&<span style={{fontSize:12,opacity:.5}}>…</span>}</div>
          {!loading&&groups.length===0&&<div style={{padding:18,borderRadius:18,background:'#EEEDF5',fontSize:14,opacity:.65}}>{copy.empty}</div>}
          <div style={{display:'grid',gap:9}}>{groups.map(group=><article key={group.id} style={{padding:13,borderRadius:19,background:'#fff',border:'1px solid #E4E2ED',display:'grid',gridTemplateColumns:'auto 1fr auto',alignItems:'center',gap:11}}>
            <div style={{width:46,height:46,borderRadius:16,display:'grid',placeItems:'center',background:'linear-gradient(135deg,#ECE8FF,#FFE7EF)',color:'#5F4BE8'}}><UsersRound size={22}/></div>
            <div style={{minWidth:0}}><strong style={{display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{group.name}</strong><small style={{opacity:.55}}>{Math.max(1,Number(group.member_count||0))} {copy.people}</small></div>
            <div style={{display:'flex',gap:7}}>{group.creator_id===me?.id&&<button onClick={()=>remove(group)} disabled={deletingId===group.id} aria-label={copy.delete} style={{width:38,height:38,borderRadius:99,border:'1px solid #E8E5EF',background:'#fff',display:'grid',placeItems:'center',color:'#A43A49',opacity:deletingId===group.id?.55:1}}><Trash2 size={16}/></button>}<button onClick={()=>start(group)} disabled={callBusy||callingId===group.id} aria-label={copy.call} style={{height:38,border:0,borderRadius:99,padding:'0 12px',display:'flex',alignItems:'center',gap:7,background:'#6753F2',color:'#fff',fontWeight:850}}><Video size={17}/><span>{callingId===group.id?copy.calling:copy.call}</span></button></div>
          </article>)}</div>
        </div>
      </section>
    </div>}
  </>;
}
