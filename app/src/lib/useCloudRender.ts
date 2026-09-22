// 云端渲染通用流程：dispatch → 轮询 → 下载 MP4（功能A/B 共用）
import { useState } from 'react';
import type { AnimSpec } from '../../../src/spec/types';
import { dispatchRender, waitForRun, downloadMp4, saveBlob, deleteUpload, uploadAsset } from './github';

export interface RenderState {
  phase: 'idle' | 'uploading' | 'dispatching' | 'waiting' | 'downloading' | 'done' | 'error';
  message: string;
}

const Q4_ENCODE = { crf: 8, imageFormat: 'png', x264Preset: 'slow', pixelFormat: 'yuv444p' };

export function useCloudRender() {
  const [state, setState] = useState<RenderState>({ phase: 'idle', message: '' });

  const run = async (opts: {
    spec: AnimSpec;
    imageDataUrl?: string;   // 功能A：需要先把图片传到仓库
    fileName?: string;
  }) => {
    let uploadedPath = '';
    try {
      let spec = opts.spec;
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
        encode: Q4_ENCODE,
        spec,
      };
      const t0 = await dispatchRender(JSON.stringify(job));
      const { runId, conclusion } = await waitForRun(t0, (msg) =>
        setState({ phase: 'waiting', message: msg }),
      );
      if (conclusion !== 'success') throw new Error(`云端渲染失败（${conclusion}），请到 GitHub Actions 查看日志`);
      setState({ phase: 'downloading', message: '下载 MP4…' });
      const { blob, name } = await downloadMp4(runId);
      saveBlob(blob, opts.fileName ?? name);
      setState({ phase: 'done', message: `✓ 已下载 ${opts.fileName ?? name}（云端素材已自动清理）` });
    } catch (e) {
      setState({ phase: 'error', message: (e as Error).message });
    } finally {
      if (uploadedPath) deleteUpload(uploadedPath); // 即用即删，不阻断
    }
  };

  return { ...state, run, reset: () => setState({ phase: 'idle', message: '' }) };
}
