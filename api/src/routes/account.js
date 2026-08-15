import { Router } from 'express';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { q, tx } from '../db.js';
import { env } from '../env.js';
import { auth, h, bad, notFound } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';

export const accountRoutes = Router();
const hashToken=t=>crypto.createHash('sha256').update(t).digest('hex');

accountRoutes.post('/forgot-password',h(async(req,res)=>{const email=String(req.body.email||'').trim();const {rows}=await q('SELECT id,name FROM users WHERE email=$1',[email]);if(rows[0]){const token=crypto.randomBytes(32).toString('base64url');await q(`INSERT INTO password_resets (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '1 hour')`,[hashToken(token),rows[0].id]);await sendEmail({to:email,subject:'Recuperar a tua password',text:`Olá ${rows[0].name},\n\nAbre esta ligação para escolher uma password nova:\n${env.APP_URL}/recuperar?token=${token}\n\nExpira dentro de uma hora. Se não foste tu, ignora este email.`});}res.json({ok:true,message:'Se essa conta existir, enviámos um email.'});}));

accountRoutes.post('/reset-password',h(async(req,res)=>{const {token,password}=req.body;if(!token||!password)throw bad('Faltam campos');if(String(password).length<8)throw bad('A password precisa de 8 caracteres ou mais');await tx(async c=>{const {rows}=await c.query(`SELECT user_id FROM password_resets WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() FOR UPDATE`,[hashToken(token)]);if(!rows[0])throw bad('Ligação inválida ou expirada','invalid_token');await c.query('UPDATE users SET password_hash=$2,session_version=session_version+1 WHERE id=$1',[rows[0].user_id,await bcrypt.hash(password,12)]);await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[rows[0].user_id]);await c.query('UPDATE password_resets SET used_at=now() WHERE token_hash=$1',[hashToken(token)]);await c.query('UPDATE password_resets SET used_at=now() WHERE user_id=$1 AND used_at IS NULL',[rows[0].user_id]);});res.json({ok:true});}));

/** RGPD artigo 20: exportação estruturada dos dados atuais da Lumina. */
accountRoutes.get('/export',auth,h(async(req,res)=>{const id=req.user.id;const one=async(sql,params=[id])=>(await q(sql,params)).rows;const data={
  exportadoEm:new Date().toISOString(),
  perfil:(await one('SELECT id,handle,email,name,bio,palette,stars,created_at FROM users WHERE id=$1'))[0],
  publicacoes:await one('SELECT id,body,media_url,kind,created_at,edited_at FROM posts WHERE author_id=$1'),
  comentarios:await one('SELECT id,post_id,body,created_at,edited_at FROM comments WHERE author_id=$1'),
  reacoes:await one('SELECT post_id,kind,created_at FROM reactions WHERE user_id=$1'),
  momentos:await one('SELECT id,media_url,palette,created_at,expires_at FROM moments WHERE author_id=$1'),
  aSeguir:await one(`SELECT u.handle FROM follows f JOIN users u ON u.id=f.following_id WHERE f.follower_id=$1`),
  seguidores:await one(`SELECT u.handle FROM follows f JOIN users u ON u.id=f.follower_id WHERE f.following_id=$1`),
  bloqueados:await one(`SELECT u.handle,b.created_at FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=$1`),
  momentosVistos:await one('SELECT moment_id,seen_at FROM moment_views WHERE user_id=$1'),
  mensagens:await one(`SELECT id,thread_id,kind,mode,body,created_at,purged_at FROM messages WHERE sender_id=$1`),
  salasCriadas:await one(`SELECT id,name,topic,description,visibility,create_price_cents,entry_price_cents,billing_state,created_at FROM rooms WHERE creator_id=$1`),
  salas:await one(`SELECT r.id,r.name,r.visibility,rm.role,rm.joined_at,rm.paid_entry_at FROM room_members rm JOIN rooms r ON r.id=rm.room_id WHERE rm.user_id=$1`),
  convitesSalas:await one(`SELECT room_id,invited_by,created_at,accepted_at FROM room_invites WHERE user_id=$1`),
  mensagensSalas:await one(`SELECT id,room_id,body,created_at,edited_at,deleted_at FROM room_messages WHERE sender_id=$1`),
  pagamentosSalas:await one(`SELECT room_id,kind,amount_cents,provider,status,created_at,paid_at FROM room_payments WHERE user_id=$1`),
  chamadas:await one(`SELECT id,thread_id,caller_id,callee_id,mode,status,created_at,answered_at,ended_at FROM call_sessions WHERE caller_id=$1 OR callee_id=$1`),
};res.setHeader('content-disposition',`attachment; filename="lumina-${req.user.handle}.json"`);res.json(data);}));

accountRoutes.get('/delete',auth,h(async(req,res)=>{const {rows}=await q('SELECT execute_at FROM deletion_requests WHERE user_id=$1 AND cancelled_at IS NULL',[req.user.id]);res.json(rows[0]?{scheduled:true,executeAt:rows[0].execute_at}:{scheduled:false,executeAt:null});}));
accountRoutes.post('/delete',auth,h(async(req,res)=>{const {rows}=await q(`INSERT INTO deletion_requests (user_id,execute_at) VALUES ($1,now()+interval '30 days') ON CONFLICT (user_id) DO UPDATE SET requested_at=now(),execute_at=now()+interval '30 days',cancelled_at=NULL RETURNING execute_at`,[req.user.id]);res.json({scheduled:true,executeAt:rows[0].execute_at,message:'A conta será apagada dentro de 30 dias. Entra outra vez até lá para cancelar.'});}));
accountRoutes.post('/delete/cancel',auth,h(async(req,res)=>{const {rowCount}=await q('UPDATE deletion_requests SET cancelled_at=now() WHERE user_id=$1 AND cancelled_at IS NULL',[req.user.id]);if(!rowCount)throw notFound('Não havia pedido de apagamento');res.json({cancelled:true});}));
