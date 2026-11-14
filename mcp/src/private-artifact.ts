const ORIGIN='https://icandoitccc-jpg.github.io';
const REPO='icandoitccc-jpg/motion-render-private';
export async function privateArtifact(request:Request):Promise<Response>{
 const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Cache-Control':'no-store','Vary':'Origin'};
 if(request.headers.get('Origin')!==ORIGIN)return new Response('Origin not allowed',{status:403});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='POST')return new Response('Method not allowed',{status:405,headers});
 try{
  const auth=request.headers.get('Authorization')??'';if(!/^Bearer [A-Za-z0-9._~+\/=-]+$/.test(auth))throw new Error('缺少GitHub授权。');
  const body=await request.json() as {repo?:string;artifactId?:number};if(body.repo!==REPO||!Number.isSafeInteger(body.artifactId)||body.artifactId!<=0)throw new Error('无效的私有任务。');
  const gh={'Authorization':auth,'Accept':'application/vnd.github+json','User-Agent':'Motion-private-audio'};
  const base='https://api.github.com/repos/'+REPO;const meta=await fetch(base,{headers:gh});if(!meta.ok)return Response.json({error:'无法访问你的私有仓库。'},{status:meta.status,headers});
  if(!(await meta.json() as {private:boolean}).private)throw new Error('已阻止读取公开仓库。');
  const ar=await fetch(base+'/actions/artifacts/'+body.artifactId,{headers:gh});if(!ar.ok)throw new Error('音频任务产物不存在或无权读取。');
  const artifact=await ar.json() as {name:string;size_in_bytes:number;expired:boolean};if(!['motion-rough-analyze','motion-rough-cut'].includes(artifact.name)||artifact.expired||artifact.size_in_bytes>100*1024**2)throw new Error('不是可读取的粗剪产物。');
  const result=await fetch(base+'/actions/artifacts/'+body.artifactId+'/zip',{headers:gh,redirect:'manual'});
  if(result.status!==302)throw new Error('暂时无法获取音频产物。');
  const url=new URL(result.headers.get('Location')??'');if(url.protocol!=='https:'||!['.blob.core.windows.net','.actions.githubusercontent.com','.githubusercontent.com','.amazonaws.com'].some(s=>url.hostname.endsWith(s)))throw new Error('产物下载地址不受支持。');
  // Do not forward GitHub authorization to signed artifact-storage URLs.
  const data=await fetch(url.href,{redirect:'error'});if(!data.ok)throw new Error('音频产物读取失败。');
  return new Response(data.body,{headers:{...headers,'Content-Type':'application/zip'}});
 }catch(e){return Response.json({error:(e as Error).message},{status:400,headers});}
}
