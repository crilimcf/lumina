import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method = 'GET', token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  return { response, data };
}

async function register(handle) {
  const out = await request('/auth/register', {
    method:'POST',
    body:{
      handle,
      email:`${handle.replaceAll('.', '-')}@example.test`,
      password:'lumina-test-1234',
      name:handle,
      birthDate:'1990-01-01',
      acceptTerms:true,
    },
  });
  assert.equal(out.response.status, 201, JSON.stringify(out.data));
  return out.data;
}

before(async () => {
  await migrate();
  const { rows } = await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if (rows.length) {
    const tables = rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server = app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('grupo privado inicia videochamada multipessoa com signaling dirigido', async () => {
  const owner=await register('group.call.owner');
  const ana=await register('group.call.ana');
  const bruno=await register('group.call.bruno');
  const outsider=await register('group.call.outsider');

  const room=await request('/rooms',{
    method:'POST',token:owner.token,
    body:{name:'Amigos próximos',topic:'Grupo de videochamada',description:'',visibility:'private'},
  });
  assert.equal(room.response.status,201,JSON.stringify(room.data));
  const roomId=room.data.room.id;

  for(const person of [ana,bruno]){
    const invite=await request(`/rooms/${roomId}/invite`,{method:'POST',token:owner.token,body:{userId:person.user.id}});
    assert.equal(invite.response.status,201,JSON.stringify(invite.data));
  }

  const started=await request('/calls',{
    method:'POST',token:owner.token,body:{threadId:`room:${roomId}`,mode:'video'},
  });
  assert.equal(started.response.status,201,JSON.stringify(started.data));
  assert.equal(started.data.group,true);
  assert.equal(started.data.group_size,3);
  assert.match(started.data.id,/^g:/);
  assert.equal(started.data.participants.filter(item=>item.status==='invited').length,2);

  const hidden=await request(`/calls/${started.data.id}`,{token:outsider.token});
  assert.equal(hidden.response.status,404);

  const incoming=await request('/calls/incoming',{token:ana.token});
  assert.equal(incoming.response.status,200,JSON.stringify(incoming.data));
  assert.equal(incoming.data.id,started.data.id);
  assert.equal(incoming.data.group,true);
  assert.equal(incoming.data.name,'Amigos próximos');

  const answered=await request(`/calls/${started.data.id}/answer`,{method:'POST',token:ana.token});
  assert.equal(answered.response.status,200,JSON.stringify(answered.data));
  assert.equal(answered.data.status,'active');
  assert.equal(answered.data.participants.find(item=>item.id===ana.user.id)?.status,'joined');

  const ownerSync=await request(`/calls/${started.data.id}/sync?after=0`,{token:owner.token});
  assert.equal(ownerSync.response.status,200,JSON.stringify(ownerSync.data));
  assert.equal(ownerSync.data.group,true);
  assert.equal(ownerSync.data.participants.find(item=>item.id===ana.user.id)?.status,'joined');

  const offer=await request(`/calls/${started.data.id}/signals`,{
    method:'POST',token:owner.token,
    body:{kind:'offer',payload:{to:ana.user.id,data:{type:'offer',sdp:'test-sdp'}}},
  });
  assert.equal(offer.response.status,201,JSON.stringify(offer.data));

  const anaSync=await request(`/calls/${started.data.id}/sync?after=0`,{token:ana.token});
  assert.equal(anaSync.response.status,200,JSON.stringify(anaSync.data));
  const received=anaSync.data.signals.find(item=>item.kind==='offer');
  assert.equal(received.sender_id,owner.user.id);
  assert.deepEqual(received.payload,{type:'offer',sdp:'test-sdp'});

  const ownerLeaves=await request(`/calls/${started.data.id}/end`,{method:'POST',token:owner.token});
  assert.equal(ownerLeaves.response.status,200);
  const stillActive=await request(`/calls/${started.data.id}/sync?after=0`,{token:ana.token});
  assert.equal(stillActive.data.status,'active','a chamada deve continuar para quem ficou');

  await request(`/calls/${started.data.id}/end`,{method:'POST',token:ana.token});
  const ended=await request(`/calls/${started.data.id}/sync?after=0`,{token:ana.token});
  assert.equal(ended.data.status,'ended');
});
