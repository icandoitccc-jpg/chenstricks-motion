import assert from 'node:assert/strict';
const BASE=process.env.MOTION_TEST_BASE??'https://motion-guides.chens-tricks.workers.dev';
async function call(path,key,data){const r=await fetch(BASE+path,{method:'POST',headers:{'Content-Type':'application/json',...(key?{Authorization:'Bearer '+key}:{})},body:JSON.stringify(data??{})});return {status:r.status,data:await r.json()};}
const project={version:1,id:'synthetic-handoff',title:'合成接口测试',audioRevision:0,scriptRevision:1,width:1920,height:1080,fps:30,captions:true,scriptText:'第一句。第二句。第三句。第四句。',draftText:'第一句。第二句。第三句。第四句。',sentences:['第一句。','第二句。','第三句。','第四句。'].map((text,i)=>({id:'S00'+(i+1),text,start:null,end:null})),scenes:[],assets:[]};
const plan={version:1,binding:'script',sentences:[{id:'S001',text:'第一句。第二句。',start:null,end:null},{id:'S002',text:'第三句。',start:null,end:null},{id:'S003',text:'第四句。',start:null,end:null}],assets:[],scenes:[{id:'scene1',title:'合成画面',kind:'info',template:'steps',sentenceIds:['S001','S002','S003'],items:['一','二','三'],leftLabel:'',rightLabel:'',sourceIn:0,motion:'still',focusX:50,focusY:50}]};
let link;
try{
 const created=await call('/handoff',undefined,{project});assert.equal(created.status,200);link=created.data;
 assert.equal((await call('/handoff/read','invalid')).status,401);
 const read=await call('/handoff/read',link.accessKey);assert.equal(read.data.project.scriptText,project.scriptText);assert.equal(read.data.revision,0);assert.equal(read.data.plan,undefined);
 const wrong=await call('/handoff/submit',link.accessKey,{expectedRevision:0,plan:{...plan,sentences:plan.sentences.map((s,i)=>i? s:{...s,text:'错误稿。'})}});assert.equal(wrong.status,400);
 const submitted=await call('/handoff/submit',link.accessKey,{expectedRevision:0,plan});assert.equal(submitted.status,200);assert.equal(submitted.data.revision,1);
 assert.equal((await call('/handoff/submit',link.accessKey,{expectedRevision:0,plan})).status,409);
 assert.deepEqual((await call('/handoff/read',link.ownerKey)).data.plan,plan);
 assert.equal((await call('/handoff/read',link.accessKey)).data.plan,undefined);
 assert.equal((await call('/handoff/revoke',link.accessKey)).status,403);
 const cors=await fetch(BASE+'/handoff',{method:'OPTIONS',headers:{Origin:'https://example.com'}});assert.equal(cors.status,403);
 console.log('PASS: create; scoped access; wrong script rejected; actual parser submission; stale revision rejected; owner retrieval; agent cannot revoke; bad Origin blocked.');
}finally{if(link){assert.equal((await call('/handoff/revoke',link.ownerKey)).status,200);assert.equal((await call('/handoff/read',link.accessKey)).status,401);console.log('PASS: revoke deletes synthetic handoff; both keys invalid.');}}
