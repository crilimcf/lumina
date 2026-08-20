import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import app from '../src/server.js';
import { migrate, pool, q } from '../src/db.js';

let server;
let baseUrl;

async function request(path, { method='GET', token, body }={}) {
  const headers={};
  if(token)headers.authorization=`Bearer ${token}`;
  if(body!==undefined)headers['content-type']='application/json';
  const response=await fetch(`${baseUrl}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let data=null;
  if(text){try{data=JSON.parse(text)}catch{data=text}}
  return {response,data};
}

async function register(handle){
  const out=await request('/auth/register',{
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
  assert.equal(out.response.status,201,JSON.stringify(out.data));
  return out.data;
}

before(async()=>{
  await migrate();
  const {rows}=await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if(rows.length){
    const tables=rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ');
    await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`);
  }
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{
  if(server)await new Promise(resolve=>server.close(resolve));
  await pool.end();
});

test('grupo de videochamada vive no Direct e não cria uma Sala',async()=>{
  const owner=await register('direct.group.owner');
  const ana=await register('direct.group.ana');
  const outsider=await register('direct.group.outsider');

  const created=await request('/calls/groups',{
    method:'POST',
    token:owner.token,
    body:{name:'Amigos vídeo',memberIds:[ana.user.id]},
  });
  assert.equal(created.response.status,201,JSON.stringify(created.data));
  assert.equal(created.data.name,'Amigos vídeo');
  assert.equal(created.data.creator_id,owner.user.id);
  assert.equal(created.data.member_count,2);
  const groupId=created.data.id;

  const ownerRooms=await request('/rooms',{token:owner.token});
  assert.equal(ownerRooms.response.status,200,JSON.stringify(ownerRooms.data));
  assert.equal(ownerRooms.data.some(room=>room.name==='Amigos vídeo'),false,'grupo de videochamada não pode aparecer em Salas');

  const ownerGroups=await request('/calls/groups',{token:owner.token});
  assert.equal(ownerGroups.response.status,200,JSON.stringify(ownerGroups.data));
  assert.equal(ownerGroups.data.some(group=>group.id===groupId),true);

  const anaGroups=await request('/calls/groups',{token:ana.token});
  assert.equal(anaGroups.response.status,200,JSON.stringify(anaGroups.data));
  assert.equal(anaGroups.data.some(group=>group.id===groupId),true);

  const outsiderGroups=await request('/calls/groups',{token:outsider.token});
  assert.equal(outsiderGroups.response.status,200,JSON.stringify(outsiderGroups.data));
  assert.equal(outsiderGroups.data.some(group=>group.id===groupId),false);

  const started=await request('/calls',{
    method:'POST',
    token:owner.token,
    body:{threadId:`group:${groupId}`,mode:'video'},
  });
  assert.equal(started.response.status,201,JSON.stringify(started.data));
  assert.equal(started.data.group,true);
  assert.equal(started.data.group_id,groupId);
  assert.equal(started.data.room_id,null);
  assert.equal(started.data.group_size,2);

  const hidden=await request(`/calls/${started.data.id}`,{token:outsider.token});
  assert.equal(hidden.response.status,404);

  const deletingActive=await request(`/calls/groups/${groupId}`,{method:'DELETE',token:owner.token});
  assert.equal(deletingActive.response.status,400);
  assert.equal(deletingActive.data.code,'group_call_active');

  const ended=await request(`/calls/${started.data.id}/end`,{method:'POST',token:owner.token});
  assert.equal(ended.response.status,200,JSON.stringify(ended.data));

  const removed=await request(`/calls/groups/${groupId}`,{method:'DELETE',token:owner.token});
  assert.equal(removed.response.status,200,JSON.stringify(removed.data));
  assert.deepEqual(removed.data,{deleted:true});

  const groupsAfter=await request('/calls/groups',{token:owner.token});
  assert.equal(groupsAfter.data.some(group=>group.id===groupId),false);
});
