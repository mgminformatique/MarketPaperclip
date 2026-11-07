import assert from 'node:assert/strict';
const user='11111111-1111-4111-8111-111111111111',peer='22222222-2222-4222-8222-222222222222',cid='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export function createSocialFixture(mode){
 assert.ok(['messages','notifications','people','anonymous'].includes(mode));
 const checks={send:0,read:0,edit:0,react:0,delete:0,block:0,image:0},profile={id:peer,username:'alice',display_name:'Alice QA',avatar_url:null};
 const rows=[{id:1,conversation_id:cid,sender_id:peer,body:'Hello from Alice',reply_to:null,created_at:'2026-11-06T10:00:00Z',edited_at:null,deleted_at:null,image_url:null,reactions:[]}];
 let blocked=false,next=2,failed=false;const sent=new Map();
 const notices=[{id:cid,kind:'sale',title:'QA agent sold',href:'/studio',amount_cents:4900,created_at:'2026-11-06T10:00:00Z',read_at:null}];
 const initialPath=mode==='notifications'?'/notifications':mode==='people'?'/people':mode==='anonymous'?'/messages':'/messages?conversation='+cid;
 return {initialPath,checks,install(w){w.document.hasFocus=()=>true;w.URL.createObjectURL=()=> 'blob:local-qa';w.URL.revokeObjectURL=()=>{};},fetch(url,options={}){
  const path=url.pathname,method=options.method||'GET',data=typeof options.body==='string'?JSON.parse(options.body):{};
  if(path==='/api/me')return Response.json(mode==='anonymous'?{user:null}:{user:{id:user,email:'qa@example.test'},profile:{username:'qa-member',display_name:'QA Member',bio:'',website:''}});
  if(path==='/api/favorites')return Response.json({ids:[]});
  if(path==='/api/users')return Response.json({users:[profile],more:false});
  if(path==='/api/chat'&&method==='GET')return Response.json({unread:1,conversations:[{id:cid,updated_at:'2026-11-06T10:00:00Z',peer:profile,unread:1,latest:{body:'Hello from Alice'},blocked_by_me:blocked,blocked_by_peer:false}]});
  if(path==='/api/notifications'){
   if(method==='PATCH'){assert.deepEqual(data.ids,[cid]);notices[0].read_at=new Date().toISOString();checks.read++;return Response.json({ok:true});}
   return Response.json({notifications:notices,unread:notices[0].read_at?0:1,more:false});
  }
  if(path==='/api/chat/'+cid+'/messages')return Response.json({messages:rows,more:false});
  if(path==='/api/chat/'+cid+'/images'){checks.image++;return Response.json({image_path:user+'/'+cid+'/qa.png'});}
  if(path==='/api/chat/'+cid){
   if(method==='GET')return Response.json({id:cid,peer:profile,members:[{user_id:peer,last_read_at:'2026-11-06T10:00:00Z',typing_until:null}],blocked_by_me:blocked,blocked_by_peer:false});
   if(data.action==='read'){checks.read++;return Response.json({});}
   if(data.action==='typing')return Response.json({});
   if(data.action==='send'){
    assert.ok(data.client_id);assert.equal(data.sender_id,undefined);checks.send++;
    if(!sent.has(data.client_id)){const row={id:next++,conversation_id:cid,sender_id:user,body:data.body,reply_to:data.reply_to||null,created_at:new Date().toISOString(),edited_at:null,deleted_at:null,image_url:data.image_path?'https://qa.example/photo.png':null,reactions:[]};rows.push(row);sent.set(data.client_id,row);}
    if(!failed){failed=true;return Response.json({error:'QA temporary failure'},{status:503});}return Response.json({id:sent.get(data.client_id).id});
   }
   const row=rows.find(m=>m.id===data.message_id);
   if(data.action==='edit'){row.body=data.body;row.edited_at=new Date().toISOString();checks.edit++;}
   if(data.action==='react'){row.reactions=[{user_id:user,emoji:data.emoji}];checks.react++;}
   if(data.action==='delete'){row.body='';row.deleted_at=new Date().toISOString();row.image_url=null;checks.delete++;}
   if(data.action==='block'||data.action==='unblock'){blocked=data.action==='block';checks.block++;}
   return Response.json({});
  }
 }};
}
export async function checkSocialClient({w,fixture,mode,until,click,locale}){
 const doc=w.document,checks=fixture.checks;
 const set=(el,value)=>{assert.ok(el);const proto=el.tagName==='TEXTAREA'?w.HTMLTextAreaElement.prototype:w.HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);el.dispatchEvent(new w.Event('input',{bubbles:true}));};
 const submit=()=>doc.querySelector('.chat-composer').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 if(mode==='anonymous'){await until(()=>doc.querySelector('.empty-state button,.empty button'),'anonymous sign-in');assert.equal(doc.querySelector('.chat-composer'),null);console.log('PASS anonymous chat requires sign-in');return;}
 if(mode==='people'){await until(()=>doc.querySelector('.member-card'),'public member results');assert.ok(doc.querySelector('.member-card').textContent.includes('@alice'));assert.ok(doc.querySelector('.member-card a[href*="/messages?to=alice"]'));set(doc.querySelector('#global-search'),'@alice');await until(()=>doc.querySelector('.global-search .member-suggestions')?.textContent.includes('@alice'),'global @handle suggestions');doc.querySelector('.global-search').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await until(()=>w.location.pathname==='/people'&&new URL(w.location.href).searchParams.get('q')==='@alice','global @handle search destination');console.log('PASS @handle discovery and contact ('+locale+')');return;}
 if(mode==='notifications'){await until(()=>doc.querySelector('.notification-list .unread'),'sale notification');assert.ok(doc.querySelector('.notification-list').textContent.includes('QA agent sold'));click(doc.querySelector('.social-heading button'));await until(()=>checks.read===1&&!doc.querySelector('.notification-list .unread'),'read acknowledgement');console.log('PASS sale notification and read badge ('+locale+')');return;}
 await until(()=>doc.querySelector('.chat-bubble')?.textContent.includes('Hello from Alice'),'private conversation');
 assert.ok(doc.querySelector('.chat-room-header').textContent.includes('@alice'));
 const input=()=>doc.querySelector('.chat-composer textarea');
 set(input(),'Message with retry');submit();await until(()=>checks.send===1&&doc.querySelector('.chat-room [role="alert"]'),'send failure keeps draft');assert.equal(input().value,'Message with retry');
 submit();await until(()=>checks.send===2&&input().value===''&&doc.querySelectorAll('.chat-message.own').length===1,'safe retry without duplicate');
 click(doc.querySelector('.chat-message.own .chat-message-actions button:nth-child(3)'));await until(()=>doc.querySelector('.chat-composer-context'),'edit context');set(input(),'Edited QA message');submit();await until(()=>checks.edit===1&&doc.querySelector('.chat-message.own').textContent.includes('Edited QA message'),'persist edit');
 click(doc.querySelector('.chat-message:not(.own) .chat-message-actions button:nth-child(2)'));await until(()=>doc.querySelector('.chat-message .emoji-picker'),'reaction picker');click(doc.querySelector('.chat-message .emoji-picker button'));await until(()=>checks.react===1&&doc.querySelector('.chat-reactions'),'reaction saved');
 click(doc.querySelector('.chat-message:not(.own) .chat-message-actions button:first-child'));await until(()=>doc.querySelector('.chat-composer-context'),'reply context');set(input(),'A reply');submit();await until(()=>checks.send===3&&doc.querySelector('.chat-message.own blockquote'),'quoted reply');
 const fileInput=doc.querySelector('.chat-composer input[type=file]');Object.defineProperty(fileInput,'files',{configurable:true,value:[new w.File(['photo'],'qa.png',{type:'image/png'})]});fileInput.dispatchEvent(new w.Event('change',{bubbles:true}));await until(()=>checks.image===1&&doc.querySelector('.chat-attachment'),'photo upload');submit();await until(()=>checks.send===4&&doc.querySelector('.chat-message.own img'),'photo message');
 click(doc.querySelector('.chat-message.own .chat-message-actions button:nth-child(4)'));await until(()=>doc.querySelector('.delete-confirm'),'deletion confirmation');click(doc.querySelector('.delete-confirm button'));await until(()=>checks.delete===1&&doc.querySelector('.chat-message.own em'),'deleted message');
 click(doc.querySelector('.block-button'));await until(()=>checks.block===1&&input().disabled,'blocked conversation');click(doc.querySelector('.block-button'));await until(()=>checks.block===2&&!input().disabled,'unblocked conversation');
 assert.ok(checks.read>0);console.log('PASS compiled chat: safe retry, edit, reply, reaction, photo, delete, block, read ('+locale+'; isolated fixtures)');
}
