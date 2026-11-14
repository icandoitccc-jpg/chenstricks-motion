import JSZip from 'jszip';import {api} from './project-cloud';import {getPat} from './github';
const encode=async(blob:Blob)=>new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(new Error('录音读取失败。'));r.readAsDataURL(blob);});
export async function runRoughCloud(zip:Blob,repoName:string,mode:'analyze'|'cut',progress:(s:string)=>void,signal:AbortSignal):Promise<{zip:JSZip;runUrl:string}>{
 if(!/^[a-zA-Z0-9_-]{1,80}$/.test(repoName)||zip.size>50*1024**2)throw new Error('私有仓库名无效或录音包超过50MB。');
 const user=await api<{login:string}>('/user'),name=user.login+'/'+repoName,repo='/repos/'+name,meta=await api<{private:boolean}>(repo);if(!meta.private)throw new Error('已阻止上传：粗剪只接受私有仓库。');
 if(name!=='icandoitccc-jpg/motion-render-private')throw new Error('当前粗剪通道仅连接已配置的私有渲染仓库。');
 const response=await fetch('./motion-rough.yml');if(!response.ok)throw new Error('粗剪执行流程加载失败。');const workflow=await response.text();
 const input=await api<{sha:string}>(repo+'/git/blobs','POST',{content:await encode(zip),encoding:'base64'});const tree=await api<{sha:string}>(repo+'/git/trees','POST',{tree:[{path:'inputs/job.zip',mode:'100644',type:'blob',sha:input.sha},{path:'.github/workflows/motion-rough.yml',mode:'100644',type:'blob',content:workflow}]});
 const commit=await api<{sha:string}>(repo+'/git/commits','POST',{message:'Motion private audio '+mode,tree:tree.sha,parents:[]});if(signal.aborted)throw new Error('已取消，未启动任务。');
 const branch='rough-audio-'+Date.now()+'-'+crypto.randomUUID().slice(0,8);await api(repo+'/git/refs','POST',{ref:'refs/heads/'+branch,sha:commit.sha});
 const deadline=Date.now()+47*60*1000;while(Date.now()<deadline){if(signal.aborted)throw new Error('已停止等待；云端任务可能仍在运行，可在GitHub任务页取消。');
  const d=await api<{workflow_runs:{id:number;head_sha:string;status:string;conclusion:string|null;html_url:string}[]}>(repo+'/actions/runs?branch='+encodeURIComponent(branch)+'&per_page=10');const run=d.workflow_runs.find(r=>r.head_sha===commit.sha);progress(run?.status==='in_progress'?(mode==='analyze'?'云端识别并查找候选，本机不运行模型…':'云端应用已确认的删除…'):'等待私有任务启动…');
  if(run?.status==='completed'){if(run.conclusion!=='success')throw new Error('粗剪任务未成功：'+run.html_url);const artifacts=await api<{artifacts:{id:number;name:string;expired:boolean}[]}>(repo+`/actions/runs/${run.id}/artifacts`);const art=artifacts.artifacts.find(a=>a.name==='motion-rough-'+mode&&!a.expired);if(!art)throw new Error('粗剪产物尚未找到。');
   const r=await fetch('https://motion-guides.chens-tricks.workers.dev/private-audio-artifact',{method:'POST',signal,headers:{Authorization:'Bearer '+getPat(),'Content-Type':'application/json'},body:JSON.stringify({repo:name,artifactId:art.id})});if(!r.ok){let message='产物读取失败，请稍后重试。';try{message=(await r.json()).error??message;}catch{}throw new Error(message);}return {zip:await JSZip.loadAsync(await r.arrayBuffer()),runUrl:run.html_url};}
  await new Promise(r=>setTimeout(r,6000));
 }throw new Error('粗剪任务等待超时。');
}
