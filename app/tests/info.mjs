import {build} from 'esbuild';import assert from 'node:assert/strict';import {mkdtemp,rm,writeFile} from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),dir=await mkdtemp(path.join(os.tmpdir(),'motion-info-'));
try{
 for(const [name,entry]of [['plan','src/lib/info-plan.ts'],['layout','src/lib/layout.ts'],['compile','../src/spec/compile.ts']])await build({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,name+'.cjs')});
 const {validateInfoPlan,parseInfoPlan}=require(path.join(dir,'plan.cjs')),{layoutDirectorOutput}=require(path.join(dir,'layout.cjs')),{compileSpec}=require(path.join(dir,'compile.cjs'));
 const base={title:'测试图解',meaning:'仅测试',conclusion:'明确结论',center:'中心',items:['内容一','内容二','内容三','内容四'],steps:['第一步','第二步','第三步','第四步','第五步'],left:{label:'之前',steps:['一步','二步','三步','四步']},right:{label:'之后',steps:['一步','二步','三步','四步']}};
 for(const type of ['Comparison','Flow','Progression','Divergence','Convergence','Focus']){
  const p=validateInfoPlan({...base,primaryStructure:type});const spec=layoutDirectorOutput(p),compiled=compileSpec(spec);
  assert(spec.elements.length>0);assert(compiled.actions.every(a=>(a.at??0)+(a.duration??0)<=spec.meta.durationInFrames));
  for(const e of spec.elements){assert(Number.isFinite(e.x)&&Number.isFinite(e.y));assert(e.x>=0&&e.y>=0);if(e.w)assert(e.w>0&&e.x+e.w<=1921);}
  if(type==='Focus'){const item=spec.elements.find(e=>e.id==='i3'),cc=spec.elements.find(e=>e.id==='cc');assert(item.y+60<cc.y);}
 }
 for(const invalid of [null,[],{primaryStructure:'unknown'},{primaryStructure:'Flow',steps:'bad'},{primaryStructure:'Comparison',left:{label:'a',steps:[]},right:{label:'b',steps:['x']}},{primaryStructure:'Focus',title:'x',items:[{}]},{primaryStructure:'Focus',title:'x',beats:['bad']}])assert.throws(()=>validateInfoPlan(invalid));
 assert.throws(()=>parseInfoPlan('{'));assert.throws(()=>parseInfoPlan('x'.repeat(64001)));
 const spec=layoutDirectorOutput(validateInfoPlan({primaryStructure:'Focus',title:'图解导出测试',items:['程序排版','程序动画'],conclusion:'输出完成'}));
 if(process.env.MOTION_INFO_JOB_OUT)await writeFile(process.env.MOTION_INFO_JOB_OUT,JSON.stringify({composition:'Spec',description:'8-second information animation check; no AI calls',concurrency:1,stills:[0,120,239],encode:{crf:8,imageFormat:'png',x264Preset:'slow',pixelFormat:'yuv420p'},spec}));
 console.log('PASS: six structures compile; bad imports rejected; canvas bounds; Focus item/conclusion separation; all animations fit video duration.');
}finally{await rm(dir,{recursive:true,force:true});}
