import { Router } from 'express';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, forbidden, notFound, HttpError } from '../middleware/auth.js';
import { claimUpload, removeUploadIfUnreferenced } from '../lib/uploads.js';

export const roomRoutes = Router();

const ROOM_SELECT = `
  SELECT r.id, r.name, r.topic, r.description, r.image_url, r.visibility,
         r.create_price_cents, r.entry_price_cents, r.billing_state, r.created_at, r.updated_at,
         r.creator_id, u.name AS creator_name, u.handle AS creator_handle,
         u.palette AS creator_palette, u.avatar_url AS creator_avatar_url,
         (SELECT count(*) FROM room_members rm WHERE rm.room_id = r.id)::int AS member_count,
         EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id = r.id AND rm.user_id = $1) AS joined,
         EXISTS(SELECT 1 FROM room_invites ri WHERE ri.room_id = r.id AND ri.user_id = $1) AS invited,
         EXISTS(SELECT 1 FROM room_payments rp WHERE rp.room_id = r.id AND rp.user_id = $1 AND rp.kind = 'entry' AND rp.status = 'paid') AS entry_paid
  FROM rooms r JOIN users u ON u.id = r.creator_id
`;

const pricesFor = visibility => visibility === 'ultra'
  ? { create: env.ULTRA_ROOM_CREATE_CENTS, entry: env.ULTRA_ROOM_ENTRY_CENTS }
  : { create: 0, entry: 0 };

function validateRoomInput(body) {
  const name=String(body.name||'').trim(), topic=String(body.topic||'').trim(), description=String(body.description||'').trim();
  const visibility=String(body.visibility||'public'), imageUrl=body.imageUrl?String(body.imageUrl):null;
  if(name.length<3||name.length>80) throw bad('O nome da sala tem entre 3 e 80 caracteres');
  if(topic.length<3||topic.length>180) throw bad('O tópico tem entre 3 e 180 caracteres');
  if(description.length>1000) throw bad('A descrição tem no máximo 1000 caracteres');
  if(!['public','private','ultra'].includes(visibility)) throw bad('Privacidade inválida');
  return {name,topic,description,visibility,imageUrl};
}

async function getRoom(roomId,userId,query=q){const {rows}=await query(`${ROOM_SELECT} WHERE r.id=$2`,[userId,roomId]);return rows[0]||null;}
function canDiscover(room,userId){return !!room&&(room.creator_id===userId||room.joined||room.invited||(room.visibility==='public'&&room.billing_state==='active'));}
async function assertDiscoverable(roomId,userId){const room=await getRoom(roomId,userId);if(!canDiscover(room,userId))throw notFound('Sala não encontrada');return room;}
async function assertMember(roomId,userId){const room=await getRoom(roomId,userId);if(!room||!room.joined||room.billing_state!=='active')throw forbidden('Não tens acesso a esta sala');return room;}

async function stripeCheckout({amountCents,name,metadata,successPath}) {
  if(!env.STRIPE_SECRET_KEY) throw new HttpError(503,'Pagamentos ainda não configurados','payments_unavailable');
  const body=new URLSearchParams();
  body.set('mode','payment');body.set('success_url',`${env.APP_URL}${successPath}?payment=success&session_id={CHECKOUT_SESSION_ID}`);body.set('cancel_url',`${env.APP_URL}${successPath}?payment=cancelled`);
  body.set('line_items[0][price_data][currency]','eur');body.set('line_items[0][price_data][unit_amount]',String(amountCents));body.set('line_items[0][price_data][product_data][name]',name);body.set('line_items[0][quantity]','1');
  Object.entries(metadata).forEach(([k,v])=>body.set(`metadata[${k}]`,String(v)));
  const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.url||!data.id){console.error('[stripe] checkout falhou:',data?.error?.message||response.status);throw new HttpError(502,'Não foi possível iniciar o pagamento','payment_provider');}
  return data;
}

roomRoutes.get('/',auth,h(async(req,res)=>{const {rows}=await q(`${ROOM_SELECT} WHERE ((r.visibility='public' AND r.billing_state='active') OR r.creator_id=$1 OR EXISTS(SELECT 1 FROM room_members rm WHERE rm.room_id=r.id AND rm.user_id=$1) OR EXISTS(SELECT 1 FROM room_invites ri WHERE ri.room_id=r.id AND ri.user_id=$1)) ORDER BY (r.creator_id=$1) DESC,r.created_at DESC LIMIT 200`,[req.user.id]);res.json(rows);}));

roomRoutes.post('/',auth,h(async(req,res)=>{
  const input=validateRoomInput(req.body||{}), prices=pricesFor(input.visibility);
  const room=await tx(async c=>{
    if(input.imageUrl){const claimed=await claimUpload(input.imageUrl,req.user.id,'room',(text,params)=>c.query(text,params));if(!claimed)throw bad('Imagem da sala não verificada ou já utilizada','unconfirmed_upload');}
    const billingState=input.visibility==='ultra'?'pending_payment':'active';
    const {rows}=await c.query(`INSERT INTO rooms (creator_id,name,topic,description,image_url,visibility,create_price_cents,entry_price_cents,billing_state) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,[req.user.id,input.name,input.topic,input.description,input.imageUrl,input.visibility,prices.create,prices.entry,billingState]);
    await c.query(`INSERT INTO room_members (room_id,user_id,role,paid_entry_at) VALUES ($1,$2,'owner',CASE WHEN $3='ultra' THEN NULL ELSE now() END)`,[rows[0].id,req.user.id,input.visibility]);
    return rows[0];
  });
  res.status(201).json({room:await getRoom(room.id,req.user.id),paymentRequired:input.visibility==='ultra'});
}));

roomRoutes.get('/:roomId',auth,h(async(req,res)=>res.json(await assertDiscoverable(req.params.roomId,req.user.id))));
roomRoutes.patch('/:roomId',auth,h(async(req,res)=>{const room=await getRoom(req.params.roomId,req.user.id);if(!room||room.creator_id!==req.user.id)throw forbidden('Só quem criou a sala pode alterá-la');const name=req.body.name===undefined?room.name:String(req.body.name).trim(),topic=req.body.topic===undefined?room.topic:String(req.body.topic).trim(),description=req.body.description===undefined?room.description:String(req.body.description).trim();if(name.length<3||name.length>80)throw bad('Nome inválido');if(topic.length<3||topic.length>180)throw bad('Tópico inválido');if(description.length>1000)throw bad('Descrição demasiado longa');await q('UPDATE rooms SET name=$2,topic=$3,description=$4,updated_at=now() WHERE id=$1',[room.id,name,topic,description]);res.json(await getRoom(room.id,req.user.id));}));
roomRoutes.delete('/:roomId',auth,h(async(req,res)=>{const {rows}=await q('DELETE FROM rooms WHERE id=$1 AND creator_id=$2 RETURNING image_url',[req.params.roomId,req.user.id]);if(!rows[0])throw notFound('Sala não encontrada');if(rows[0].image_url)removeUploadIfUnreferenced(rows[0].image_url).catch(()=>{});res.json({deleted:true});}));

roomRoutes.post('/:roomId/invite',auth,h(async(req,res)=>{const room=await getRoom(req.params.roomId,req.user.id);if(!room||room.creator_id!==req.user.id)throw forbidden('Só quem criou a sala envia convites');if(room.visibility==='public')throw bad('Salas públicas não precisam de convite');const userId=String(req.body.userId||'');if(!userId||userId===req.user.id)throw bad('Pessoa inválida');const {rows:user}=await q('SELECT id,handle,name FROM users WHERE id=$1 AND suspended_at IS NULL',[userId]);if(!user[0])throw notFound('Pessoa não encontrada');await q(`INSERT INTO room_invites (room_id,user_id,invited_by) VALUES ($1,$2,$3) ON CONFLICT (room_id,user_id) DO UPDATE SET invited_by=EXCLUDED.invited_by,created_at=now()`,[room.id,userId,req.user.id]);res.status(201).json(user[0]);}));

roomRoutes.post('/:roomId/join',auth,h(async(req,res)=>{const room=await assertDiscoverable(req.params.roomId,req.user.id);if(room.joined&&room.billing_state==='active')return res.json(room);if(room.billing_state!=='active')throw new HttpError(402,'A sala ainda aguarda pagamento de criação','room_pending_payment');if(room.visibility==='private'&&!room.invited)throw forbidden('Esta sala é privada e só entra quem foi convidado');if(room.visibility==='ultra'){if(!room.invited)throw forbidden('Esta Sala Ultra é apenas por convite');if(!room.entry_paid)throw new HttpError(402,'É necessário pagar a entrada desta Sala Ultra','entry_payment_required');}await q(`INSERT INTO room_members (room_id,user_id,paid_entry_at) VALUES ($1,$2,CASE WHEN $3='ultra' THEN now() ELSE NULL END) ON CONFLICT DO NOTHING`,[room.id,req.user.id,room.visibility]);await q('UPDATE room_invites SET accepted_at=now() WHERE room_id=$1 AND user_id=$2',[room.id,req.user.id]);res.json(await getRoom(room.id,req.user.id));}));

roomRoutes.post('/:roomId/checkout-entry',auth,h(async(req,res)=>{const room=await assertDiscoverable(req.params.roomId,req.user.id);if(room.visibility!=='ultra')throw bad('Esta sala não tem entrada paga');if(!room.invited)throw forbidden('Esta Sala Ultra é apenas por convite');if(room.joined&&room.entry_paid)return res.json({paid:true,checkoutUrl:null});if(room.billing_state!=='active')throw new HttpError(402,'A sala ainda não foi ativada pelo criador','room_pending_payment');const {rows:pay}=await q(`INSERT INTO room_payments (room_id,user_id,kind,amount_cents) VALUES ($1,$2,'entry',$3) RETURNING id`,[room.id,req.user.id,room.entry_price_cents]);const checkout=await stripeCheckout({amountCents:room.entry_price_cents,name:`Lumina · Entrada Sala Ultra · ${room.name}`,metadata:{kind:'room_entry',room_id:room.id,user_id:req.user.id,payment_id:pay[0].id},successPath:'/?tab=rooms'});await q('UPDATE room_payments SET provider_ref=$2 WHERE id=$1',[pay[0].id,checkout.id]);res.status(201).json({checkoutUrl:checkout.url});}));

roomRoutes.post('/:roomId/checkout-create',auth,h(async(req,res)=>{const room=await getRoom(req.params.roomId,req.user.id);if(!room||room.creator_id!==req.user.id)throw forbidden();if(room.visibility!=='ultra'||room.billing_state==='active')return res.json({paid:true,checkoutUrl:null});let {rows:pay}=await q(`SELECT id FROM room_payments WHERE room_id=$1 AND user_id=$2 AND kind='create' AND status='pending' ORDER BY created_at DESC LIMIT 1`,[room.id,req.user.id]);if(!pay[0])({rows:pay}=await q(`INSERT INTO room_payments (room_id,user_id,kind,amount_cents) VALUES ($1,$2,'create',$3) RETURNING id`,[room.id,req.user.id,room.create_price_cents]));const checkout=await stripeCheckout({amountCents:room.create_price_cents,name:`Lumina · Criar Sala Ultra · ${room.name}`,metadata:{kind:'room_create',room_id:room.id,user_id:req.user.id,payment_id:pay[0].id},successPath:'/?tab=rooms'});await q('UPDATE room_payments SET provider_ref=$2 WHERE id=$1',[pay[0].id,checkout.id]);res.status(201).json({checkoutUrl:checkout.url});}));

roomRoutes.get('/:roomId/messages',auth,h(async(req,res)=>{await assertMember(req.params.roomId,req.user.id);const {rows}=await q(`SELECT rm.id,rm.sender_id,rm.body,rm.created_at,rm.edited_at,u.name,u.handle,u.palette,u.avatar_url FROM room_messages rm JOIN users u ON u.id=rm.sender_id WHERE rm.room_id=$1 AND rm.deleted_at IS NULL ORDER BY rm.created_at ASC LIMIT 300`,[req.params.roomId]);res.json(rows);}));
roomRoutes.post('/:roomId/messages',auth,h(async(req,res)=>{await assertMember(req.params.roomId,req.user.id);const body=String(req.body.body||'').trim();if(!body)throw bad('Mensagem vazia');if(body.length>4000)throw bad('A mensagem tem no máximo 4000 caracteres');const {rows}=await q(`INSERT INTO room_messages (room_id,sender_id,body) VALUES ($1,$2,$3) RETURNING id,sender_id,body,created_at,edited_at`,[req.params.roomId,req.user.id,body]);res.status(201).json(rows[0]);}));
roomRoutes.patch('/:roomId/messages/:messageId',auth,h(async(req,res)=>{await assertMember(req.params.roomId,req.user.id);const body=String(req.body.body||'').trim();if(!body||body.length>4000)throw bad('Mensagem inválida');const {rows}=await q(`UPDATE room_messages SET body=$4,edited_at=now() WHERE id=$1 AND room_id=$2 AND sender_id=$3 AND deleted_at IS NULL RETURNING id,body,edited_at`,[req.params.messageId,req.params.roomId,req.user.id,body]);if(!rows[0])throw notFound('Mensagem não encontrada');res.json(rows[0]);}));
roomRoutes.delete('/:roomId/messages/:messageId',auth,h(async(req,res)=>{const room=await assertMember(req.params.roomId,req.user.id);const {rows}=await q(`UPDATE room_messages SET deleted_at=now() WHERE id=$1 AND room_id=$2 AND (sender_id=$3 OR $4::uuid=$3::uuid) AND deleted_at IS NULL RETURNING id`,[req.params.messageId,req.params.roomId,req.user.id,room.creator_id]);if(!rows[0])throw forbidden('Só podes apagar as tuas mensagens, salvo se fores dono da sala');res.json({deleted:true});}));
