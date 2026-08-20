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

test('grupo de videochamada vive no Direct, não cria Sala e mantém signaling dirigido', async () => {
  const owner=await register('group.call.owner');
  const ana=await register('group.call.ana');
  const bruno=await register('group.call.bruno');
  const outsider=await register('group.call.outsider');

  const created=await request('/calls/groups',{
    method:'POST',token:owner.token,
    body:{name:'Amigos próximos',memberIds:[ana.user.id,bruno.user.id]},
  });
  assert.equal(created.response.status,201,JSON.stringify(created.data));
  const groupId=created.data.id;
  assert.equal(created.data.creator_id,owner.user.id);
  assert.equal(created.data.member_count,3);

  const ownerRooms=await request('/rooms',{token:owner.token});
  assert.equal(ownerRooms.response.status,200,JSON.stringify(ownerRooms.data));
  assert.equal(ownerRooms.data.some(room=>room.name==='Amigos próximos'),false,'grupo Direct não pode aparecer em Salas');

  const anaGroups=await request('/calls/groups',{token:ana.token});
  assert.equal(anaGroups.response.status,200,JSON.stringify(anaGroups.data));
  assert.equal(anaGroups.data.some(group=>group.id===groupId),true);

  const outsiderGroups=await request('/calls/groups',{token:outsider.token});
  assert.equal(outsiderGroups.response.status,200,JSON.stringify(outsiderGroups.data));
  assert.equal(outsiderGroups.data.some(group=>group.id===groupId),false);

  const started=await request('/calls',{
    method:'POST',token:owner.token,body:{threadId:`group:${groupId}`,mode:'video'},
  });
  assert.equal(started.response.status,201,JSON.stringify(started.data));
  assert.equal(started.data.group,true);
  assert.equal(started.data.group_id,groupId);
  assert.equal(started.data.room_id,null);
  assert.equal(started.data.group_size,3);
  assert.match(started.data.id,/^g:/);
  assert.equal(started.data.participants.filter(item=>item.status==='invited').length,2);

  const deleteDuringCall=await request(`/calls/groups/${groupId}`,{method:'DELETE',token:owner.token});
  assert.equal(deleteDuringCall.response.status,400,'grupo em chamada não deve desaparecer a meio da sessão');

  const hidden=await request(`/calls/${started.data.id}`,{token:outsider.token});
  assert.equal(hidden.response.status,404);

  const incoming=await request('/calls/incoming',{token:ana.token});
  assert.equal(incoming.response.status,200,JSON.stringify(incoming.data));
  assert.equal(incoming.data.id,started.data.id);
  assert.equal(incoming.data.group,true);
  assert.equal(incoming.data.group_id,groupId);
  assert.equal(incoming.data.name,'Amigos próximos');

  const answered=await request(`/calls/${started.data.id}/answer`,{method:'POST',token:ana.token});
  assert.equal(answered.response.status,200,JSON.stringify(answered.data));
  assert.equal(answered.data.status,'active');
  assert.equal(answered.data.participants.find(item=>item.id===ana.user.id)?.status,'joined');

  const anaRooms=await request('/rooms',{token:ana.token});
  assert.equal(anaRooms.response.status,200,JSON.stringify(anaRooms.data));
  assert.equal(anaRooms.data.some(room=>room.name==='Amigos próximos'),false,'atender chamada não pode criar/aderir a Sala');

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

  const removed=await request(`/calls/groups/${groupId}`,{method:'DELETE',token:owner.token});
  assert.equal(removed.response.status,200,JSON.stringify(removed.data));
  assert.equal(removed.data.deleted,true);

  const afterDelete=await request('/calls/groups',{token:owner.token});
  assert.equal(afterDelete.data.some(group=>group.id===groupId),false);
});
