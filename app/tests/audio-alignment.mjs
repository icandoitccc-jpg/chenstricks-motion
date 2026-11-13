import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createRequire} from 'node:module';
const dir=await mkdtemp(path.join(os.tmpdir(),'motion-alignment-')),require=createRequire(import.meta.url);
try{
 for(const name of ['project','audio-alignment','workflow','scene-board','project-render'])await build({entryPoints:[`src/lib/${name}.ts`],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,name+'.cjs'),logLevel:'silent'});
 const pmod=require(path.join(dir,'project.cjs')),a=require(path.join(dir,'audio-alignment.cjs')),w=require(path.join(dir,'workflow.cjs')),b=require(path.join(dir,'scene-board.cjs')),render=require(path.join(dir,'project-render.cjs'));
 const {newProject,newScene,splitScript,parseProject,compileScenes,validateProject,captionSentences}=pmod;
 const raw='第一句\n。\n第二句\n！';assert.equal(splitScript(raw).map(s=>s.text).join(''),raw.replace(/\s/g,''));
 let p=newProject();p.assets=[{id:'voice',kind:'audio',name:'test.wav',mime:'audio/wav',size:1,duration:12}];p.audioAssetId='voice';p.audioRevision=2;
 p.sentences=splitScript('完整口播稿约四千字。\n我先问一个问题然后继续追问为什么。\n普通程序按照固定规则自动执行任务。');p.scenes=p.sentences.map((s,i)=>({...newScene([s.id]),id:'SC'+i,title:'画面'+i,items:['重点'],recordingInstructions:'这是补录动作',fallback:'改为明确示意',sourceStatus:'待补'}));
 const cues=[{id:'T1',text:'嗯我先问一个问题啊',start:1,end:3},{id:'T2',text:'然后继续追问为什么',start:3,end:5},{id:'T3',text:'普通程序按照固定规则自动执行任务',start:6,end:10}];
 const rows=a.suggestAudioSync(p,cues);assert(rows[0].review);assert.equal(rows[0].start,null);assert(rows[1].coverage>.85);assert.equal(rows[1].start,1);assert.equal(rows[1].end,5);assert.equal(rows[2].start,6);
 assert.throws(()=>a.applyAudioSync(p,rows,cues),/确认/);
 rows[0]={...rows[0],skip:true,review:false};rows[1].review=false;rows[2].review=false;
 const synced=a.applyAudioSync(p,rows,cues);assert.equal(synced.sentences.map(s=>s.text).join(''),p.sentences.map(s=>s.text).join(''));assert.equal(synced.scenes[0].id,p.scenes[0].id);assert.equal(synced.sentences[0].omitted,true);assert.equal(w.hasTiming(synced),true);assert.deepEqual(compileScenes(synced).map(s=>[s.start,s.end]),[[1,5],[6,10]]);
 const restored=parseProject(JSON.stringify(synced));assert.equal(restored.scenes[1].recordingInstructions,'这是补录动作');assert(restored.sentences[0].omitted);assert.equal(captionSentences(restored)[0].text,cues[0].text);
 const files=new Map([['voice',new Blob(['x'])]]);assert.equal(validateProject(restored,files).filter(x=>x.level==='error').length,0);assert.equal(b.sceneReadiness(restored,'SC0',files).label,'未朗读，已跳过');
 const segment=b.segmentProject(restored,'SC2');assert.equal(segment.start,6);assert.equal(segment.duration,4);assert.deepEqual(segment.project.transcript.cues.map(c=>[c.start,c.end]),[[0,4]]);
 const html=render.projectHtml(restored,{voice:'audio.wav'},true);assert(html.includes('嗯我先问一个问题啊'));assert(!html.includes('完整口播稿约四千字</span>'));
 const changed={...restored,audioRevision:3};assert.notEqual(captionSentences(changed)[0].text,cues[0].text);
 assert.throws(()=>a.suggestAudioSync(p,[{...cues[0],end:30}]),/超过/);assert.throws(()=>a.applyAudioSync(p,rows.map(r=>({...r,skip:true})),cues),/至少/);
 const unrelated=a.suggestAudioSync(p,[{id:'x',text:'今天下雨准备散步回家',start:1,end:10}]);assert(unrelated.every(r=>r.review));
 const added=a.suggestAudioSync(p,[...cues.slice(0,2),{id:'extra',text:'这里是一整段原稿完全没有的新内容需要新的画面',start:5,end:6},cues[2]]);assert(added[1].review);assert(added[1].reason.includes('新增内容'));
 const crossing=a.suggestAudioSync(p,[{id:'x',text:'我先问一个问题然后继续追问为什么普通程序按照固定规则自动执行任务',start:1,end:10}]);assert(crossing[1].review&&crossing[2].review);
 console.log('PASS: standalone punctuation; fillers and different subtitle boundaries; unrelated/missing text review; no guessed times; explicit nonspoken skip; full source preserved; scene bindings; actual captions; audio revision guard; segment rebasing; notes roundtrip; invalid subtitle times blocked.');
}finally{await rm(dir,{recursive:true,force:true});}
