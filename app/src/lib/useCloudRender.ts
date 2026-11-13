// 云端渲染通用流程：dispatch → 轮询 → 下载 MP4（功能A/B 共用）
import { useEffect, useRef, useState } from 'react';
import type { AnimSpec } from '../../../src/spec/types';
import { renderInfoPrivate } from './info-cloud';
import { dispatchRender, waitForRun, downloadMp4, saveBlob, deleteUpload, uploadAsset } from './github';

export interface RenderState {
  phase: 'idle' | 'uploading' | 'dispatching' | 'waiting' | 'downloading' | 'done' | 'error';
  message: string;
}

const Q4_ENCODE = { crf: 8, imageFormat: 'png', x264Preset: 'slow', pixelFormat: 'yuv444p' };

export function useCloudRender() {
  const [state, setState] = useState<RenderState>({ phase: 'idle', message: '' });

  const [videoUrl,setVideoUrl]=useState(''); const [videoName,setVideoName]=useState('motion.mp4'); const currentUrl=useRef(''); const running=useRef(false); const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);};},[]);
  const clearVideo=()=>{if(currentUrl.current)URL.revokeObjectURL(currentUrl.current);currentUrl.current='';setVideoUrl('');};

  const run = async (opts: {
    spec: AnimSpec;
    imageDataUrl?: string;   // 功能A：需要先把图片传到仓库
    fileName?: string;
    autoDownload?: boolean;
    compatible?: boolean;
    privateInfo?: boolean;
  }) => {
    if(running.current)return; running.current=true; clearVideo();
    let uploadedPath = '';
    try {
      let spec = opts.spec;
      if(opts.privateInfo){
        const result=await renderInfoPrivate(spec,message=>setState({phase:'waiting',message}));
        if(!mounted.current)return;const url=URL.createObjectURL(result.blob);currentUrl.current=url;setVideoUrl(url);setVideoName(opts.fileName??'motion-info.mp4');setState({phase:'done',message:'制作完成，可以预览和下载。'});return;
      }
      if (opts.imageDataUrl) {
        setState({ phase: 'uploading', message: '上传图片素材…' });
        const up = await uploadAsset(opts.imageDataUrl);
        uploadedPath = up.path;
        spec = {
          ...opts.spec,
          elements: opts.spec.elements.map((el) =>
            el.src?.startsWith('data:') ? { ...el, src: up.path } : el,
          ),
        };
      }
      setState({ phase: 'dispatching', message: '提交云端渲染…' });
      const job = {
        composition: 'Spec',
        description: opts.fileName ?? 'app render',
        concurrency: 2,
        stills: [],
        encode: opts.compatible ? {...Q4_ENCODE,pixelFormat:'yuv420p'} : Q4_ENCODE,
        spec,
      };
      const t0 = await dispatchRender(JSON.stringify(job));
      const { runId, conclusion } = await waitForRun(t0, (msg) =>
        setState({ phase: 'waiting', message: msg }),
      );
      if (conclusion !== 'success') throw new Error(`云端渲染失败（${conclusion}），请到 GitHub Actions 查看日志`);
      setState({ phase: 'downloading', message: '下载 MP4…' });
      const { blob, name } = await downloadMp4(runId);
      if(!mounted.current)return;
      const url=URL.createObjectURL(blob.slice(0,blob.size,'video/mp4'));currentUrl.current=url;setVideoUrl(url);setVideoName(opts.fileName??name);
      if(opts.autoDownload!==false)saveBlob(blob,opts.fileName??name);
      setState({phase:'done',message:opts.autoDownload===false?'制作完成，可以预览和下载。':`已下载 ${opts.fileName??name}`});
    } catch (e) {
      setState({ phase: 'error', message: (e as Error).message });
    } finally {
      running.current=false;
      if (uploadedPath) deleteUpload(uploadedPath); // 即用即删，不阻断
    }
  };

  return { ...state, videoUrl, videoName, run, reset: () => {clearVideo();setState({ phase: 'idle', message: '' });} };
}
