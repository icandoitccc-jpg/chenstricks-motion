// Use the product's parser, so external Agent checks cannot drift from Motion.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'app/package.json'));
const args=process.argv.slice(2),option=n=>args[args.indexOf(n)+1];
let dir;
try {
 if(!args.includes('--script')||!args.includes('--plan'))throw new Error('用法：node scripts/validate-production-plan.mjs --script 最终稿.txt --plan 总表.json');
 const script=fs.readFileSync(option('--script'),'utf8').trim(),raw=fs.readFileSync(option('--plan'),'utf8'),table=JSON.parse(raw);
 if(table.binding!=='script')throw new Error('本校验器接受不含内部项目编号的binding:script总表。');
 const {build}=require('esbuild');dir=fs.mkdtempSync(path.join(os.tmpdir(),'motion-plan-check-'));
 await build({entryPoints:[path.join(root,'app/src/lib/project.ts')],bundle:true,platform:'node',format:'cjs',outfile:path.join(dir,'project.cjs'),logLevel:'silent'});
 const m=require(path.join(dir,'project.cjs'));
 const current={...m.newProject(),scriptText:script,draftText:script,scriptRevision:1,sentences:m.splitScript(script)};
 const project=m.parseProductionPlan(raw,current);
 const counts=Object.fromEntries(['info','image','video'].map(k=>[k,project.scenes.filter(s=>s.kind===k).length]));
 console.log(JSON.stringify({passed:true,scope:'仅校验总表导入；未验证素材存在、音频对齐或渲染',sentences:project.sentences.length,scenes:project.scenes.length,counts,mediaDeclared:project.assets.length,mediaExistence:'未核验'},null,2));
} catch(e){console.error(JSON.stringify({passed:false,error:e.message}));process.exitCode=1;}
finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});}
