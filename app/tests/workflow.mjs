import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const dir=await mkdtemp(path.join(os.tmpdir(),'motion-workflow-'));const require=createRequire(import.meta.url);
try {
 for(const name of ['workflow','project'])await build({entryPoints:[`src/lib/${name}.ts`],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,name+'.cjs')});
 const w=require(path.join(dir,'workflow.cjs')),m=require(path.join(dir,'project.cjs'));
 let p=w.confirmDraft(m.newProject(),'第一句话。\n第二句话。');assert.equal(w.hasDraft(p),true);assert.equal(p.currentStep,'draft');assert.equal(p.assets.length,0);assert(w.canOpenStep(p,'plan'));assert(!w.canOpenStep(p,'audio'));
 p=m.parseProject(JSON.stringify(p));assert.equal(p.scriptText,'第一句话。\n第二句话。');assert.equal(w.resumeStep(p),'draft');
 const table={version:1,projectId:p.id,audioRevision:p.audioRevision,scriptRevision:p.scriptRevision,sentences:p.sentences,scenes:[{...m.newScene(p.sentences.map(s=>s.id)),id:'scene-one',title:'两句话',items:['第一点','第二点']}],assets:[]};
 p=m.parseProductionPlan(JSON.stringify(table),p);assert(w.hasPlan(p));assert(w.canOpenStep(p,'audio'));p.currentStep='plan';assert.equal(w.resumeStep(m.parseProject(JSON.stringify(p))),'plan');
 assert.throws(()=>m.parseProductionPlan(JSON.stringify({...table,scriptRevision:99}),p));
 assert.throws(()=>m.parseProductionPlan(JSON.stringify({...table,sentences:p.sentences.map((s,i)=>i?{...s,text:'悄悄改稿。'}:s)}),p));
 const draftEdit={...p,draftText:'不同终稿。'};assert(!w.hasDraft(draftEdit));assert(!w.canOpenStep(draftEdit,'scenes'));assert(m.validateProject(draftEdit).some(i=>i.message.includes('终稿')));
 const changed=w.confirmDraft(draftEdit,draftEdit.draftText);assert.equal(changed.scriptRevision,2);assert.equal(changed.scenes.length,0);assert.equal(changed.sentences[0].start,null);
 const legacy=m.newProject();legacy.sentences=m.parseSrt('1\n00:00:00,000 --> 00:00:02,000\n一句话');legacy.scenes=[m.newScene(['S001'])];legacy.assets=[{id:'audio',name:'x.mp3',kind:'audio',size:1,mime:'audio/mpeg',duration:2}];legacy.audioAssetId='audio';const migrated=w.prepareWorkflow(legacy);assert.equal(migrated.sentences[0].id,'S001');assert.equal(migrated.sentences[0].end,2);assert(w.hasTiming(migrated));assert.equal(w.resumeStep(migrated),'scenes');
 console.log('PASS: draft-only project; stage prerequisites; persisted resume step; terminal-script revision guard; script integrity; edit invalidation; project roundtrip; legacy timing preserved.');
}finally{await rm(dir,{recursive:true,force:true});}
