import JSZip from 'jszip';
import type { AnimSpec } from '../../../src/spec/types';
import { api } from './project-cloud';
import { getPat } from './github';

export const infoRenderWorkflow = `name: Motion information render
on:
  push:
    paths: ['info-input/*.json']
permissions:
  contents: read
jobs:
  render:
    runs-on: ubuntu-24.04
    timeout-minutes: 12
    steps:
      - uses: actions/checkout@v4
        with:
          path: input
      - uses: actions/checkout@v4
        with:
          repository: icandoitccc-jpg/chenstricks-motion
          ref: 41d70f535c1d0a00040f2759b6e7b92cce0c49d8
          path: renderer
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Prepare private information plan
        run: |
          cp input/info-input/current.json renderer/jobs/info-private.json
      - name: Install renderer
        working-directory: renderer
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y ffmpeg
          npm ci --ignore-scripts --no-audit --no-fund
          npx remotion browser ensure
      - name: Render MP4 (no AI calls)
        working-directory: renderer
        env:
          JOB: info-private
        run: |
          node scripts/render.mjs
          ffmpeg -v error -i out/info-private/info-private.mp4 -f null -
      - uses: actions/upload-artifact@v4
        with:
          name: motion-info-video
          path: renderer/out/info-private
          retention-days: 1
`;
const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s),b=>String.fromCharCode(b)).join(''));
export async function renderInfoPrivate(spec: AnimSpec, progress: (message: string)=>void) {
  const repoName=localStorage.getItem('motion.privateRenderRepo')||'motion-render-private';
  if(!/^[a-zA-Z0-9_-]{1,80}$/.test(repoName))throw new Error('私有渲染仓库名无效。');
  progress('检查私有渲染仓库…');const user=await api<{login:string}>('/user');const repo=`/repos/${user.login}/${repoName}`;
  const meta=await api<{private:boolean;default_branch:string}>(repo);
  if(!meta.private)throw new Error('已阻止上传：图解文案只能提交到私有仓库。');
  const branch=meta.default_branch;const workflow=`${repo}/contents/.github/workflows/motion-info.yml`;
  let current:{sha:string;content:string}|undefined;
  try{current=await api(workflow);}catch(e){if(!(e as Error).message.includes('404'))throw e;}
  if(!current||atob(current.content.replace(/\s/g,''))!==infoRenderWorkflow)await api(workflow,'PUT',{message:'chore: install private information renderer',content:b64(infoRenderWorkflow),sha:current?.sha,branch});
  const path=`${repo}/contents/info-input/current.json`;let previous:{sha:string}|undefined;
  try{previous=await api(path);}catch(e){if(!(e as Error).message.includes('404'))throw e;}
  const job={composition:'Spec',concurrency:1,description:'Motion information animation',runNonce:crypto.randomUUID(),stills:[0,Math.floor(spec.meta.durationInFrames/2),spec.meta.durationInFrames-1],encode:{crf:8,imageFormat:'png',x264Preset:'slow',pixelFormat:'yuv420p'},spec};
  const result=await api<{commit:{sha:string}}>(path,'PUT',{message:'render: private information animation',content:b64(JSON.stringify(job)),sha:previous?.sha,branch});
  const deadline=Date.now()+13*60*1000;const actions=`https://github.com/${user.login}/${repoName}/actions`;
  while(Date.now()<deadline){
    const data=await api<{workflow_runs:{id:number;head_sha:string;status:string;conclusion:string;html_url:string}[]}>(`${repo}/actions/runs?per_page=15`);
    const run=data.workflow_runs.find(r=>r.head_sha===result.commit.sha);
    progress(run?.status==='in_progress'?'云端制作中，本机不渲染…':'等待云端任务启动…');
    if(run?.status==='completed'){
      if(run.conclusion!=='success')throw new Error(`云端制作未成功，请查看：${run.html_url}`);
      const data=await api<{artifacts:{id:number;name:string;expired:boolean}[]}>(`${repo}/actions/runs/${run.id}/artifacts`);const art=data.artifacts.find(a=>a.name==='motion-info-video'&&!a.expired);
      if(!art)throw new Error(`未找到成片，请查看：${run.html_url}`);
      progress('读取成片用于页面播放…');
      const response=await fetch(`https://api.github.com${repo}/actions/artifacts/${art.id}/zip`,{headers:{Authorization:`Bearer ${getPat()}`,Accept:'application/vnd.github+json'}});
      if(!response.ok)throw new Error(`浏览器读取成片失败，可从任务页下载：${run.html_url}`);
      const zip=await JSZip.loadAsync(await response.arrayBuffer());const file=Object.values(zip.files).find(f=>f.name.endsWith('.mp4'));
      if(!file)throw new Error('产物没有MP4文件。');const blob=await file.async('blob');return {blob:blob.slice(0,blob.size,'video/mp4'),runUrl:run.html_url};
    }
    await new Promise(resolve=>setTimeout(resolve,10000));
  }
  throw new Error(`等待超时，请查看任务：${actions}`);
}
