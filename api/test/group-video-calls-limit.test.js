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
  const data=await response.json().catch(()=>null);
  return {response,data};
}

async function register(i){
  const handle=`group.limit.${i}`;
  const out=await request('/auth/register',{method:'POST',body:{handle,email:`${handle}@example.test`,password:'lumina-test-1234',name:handle,birthDate:'1990-01-01',acceptTerms:true}});
  assert.equal(out.response.status,201,JSON.stringify(out.data));
  return out.data;
}

before(async()=>{
  await migrate();
  const {rows}=await q(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'`);
  if(rows.length){const tables=rows.map(({tablename})=>`"${String(tablename).replaceAll('"','""')}"`).join(', ');await q(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)}
  server=app.listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject)});
  baseUrl=`http://127.0.0.1:${server.address().port}`;
});

after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));await pool.end()});

test('videochamada de grupo limita a sessão a seis participantes',async()=>{
  const users=[];for(let i=0;i<8;i++)users.push(await register(i));
  const owner=users[0];
  const created=await request('/rooms',{method:'POST',token:owner.token,body:{name:'Grupo grande',topic:'Grupo de videochamada',description:'',visibility:'private'}});
  const roomId=created.data.room.id;
  for(const person of users.slice(1)){
    const invite=await request(`/rooms/${roomId}/invite`,{method:'POST',token:owner.token,body:{userId:person.user.id}});
    assert.equal(invite.response.status,201,JSON.stringify(invite.data));
  }
  const call=await request('/calls',{method:'POST',token:owner.token,body:{threadId:`room:${roomId}`,mode:'video'}});
  assert.equal(call.response.status,201,JSON.stringify(call.data));
  assert.equal(call.data.group_size,6);
  assert.equal(call.data.participants.length,6);
  assert.equal(call.data.participants.some(item=>item.id===owner.user.id),true);
});
