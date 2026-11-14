import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';import path from 'node:path';
const dir=await mkdtemp(path.join(os.tmpdir(),'motion-rough-'));const require=createRequire(import.meta.url);
try{
 await build({entryPoints:['src/lib/project.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'project.cjs'),logLevel:'silent'});
 await build({entryPoints:['src/lib/rough-cut.ts'],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'rough.cjs'),logLevel:'silent'});
 const {parseRoughAnalysis,roughIntervals,selectionSignature}=require(path.join(dir,'rough.cjs'));const {newProject,parseProject}=require(path.join(dir,'project.cjs'));
 const a={version:1,audioSha256:'a'.repeat(64),duration:12,cues:[{text:'实际录音内容',start:0,end:2}],candidates:[{id:'p1',kind:'pause',start:2,end:5,reason:'长停顿',selected:false},{id:'p2',kind:'pause',start:4,end:7,reason:'长停顿',selected:false}],scope:'test'};
 assert.equal(parseRoughAnalysis(a),a);assert.deepEqual(roughIntervals(a,[]),[]);assert.deepEqual(roughIntervals(a,['p1','p2']),[[2,7]]);
 assert.throws(()=>roughIntervals(a,['p1','p1']));assert.throws(()=>roughIntervals(a,['unknown']));assert.equal(selectionSignature(['p1','p2']),selectionSignature(['p2','p1']));
 assert.throws(()=>parseRoughAnalysis({...a,candidates:[{...a.candidates[0],end:99}]}));assert.throws(()=>parseRoughAnalysis({...a,candidates:[{...a.candidates[0],comparisonStart:99}]}));assert.throws(()=>parseRoughAnalysis({...a,cues:[{text:'x',start:2,end:1}]}));
 const p=newProject();p.assets=[{id:'original',kind:'audio',name:'录音.m4a',mime:'audio/mp4',size:10,duration:12}];p.audioAssetId='original';p.roughCut={sourceAssetId:'original',analysis:a,selectedIds:['p1']};const saved=parseProject(JSON.stringify(p));assert.equal(saved.audioAssetId,'original');assert.deepEqual(saved.roughCut.selectedIds,['p1']);assert.equal(saved.roughCut.analysis.candidates[0].selected,false);
 console.log('PASS rough-cut: explicit selection, overlap merge, invalid IDs/ranges rejected, stable decision signature, project roundtrip preserves original audio.');
}finally{await rm(dir,{recursive:true,force:true});}
