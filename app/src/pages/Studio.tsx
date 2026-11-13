import { suggestAudioSync, applyAudioSync, type SyncRow } from '../lib/audio-alignment';
import { AudioSyncReview } from '../components/AudioSyncReview';
import { AgentHandoff } from '../components/AgentHandoff';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileScenes, formatTime, newProject, newScene, parseProductionPlan, pendingAsset, parseSrt, uid, validateProject, type Project, type Scene, type Sentence } from '../lib/project';
import { loadProject, saveProject, mediaMetadata, projectZip } from '../lib/project-files';
import { projectHtml } from '../lib/project-render';
import { renderProjectCloud } from '../lib/project-cloud';
import { saveBlob } from '../lib/github';
import { SceneEditor } from '../components/SceneEditor';
import { FileDrop } from '../components/FileDrop';
import { SceneBoard } from '../components/SceneBoard';
import { orderedScenes, sceneReadiness, segmentProject, sceneSignature } from '../lib/scene-board';
import { steps, stepLabels, prepareWorkflow, resumeStep, canOpenStep, hasDraft, hasPlan, hasTiming, confirmDraft, type ProjectStep } from '../lib/workflow';
import { readScriptFile } from '../lib/script-file';
import '../studio.css';

export const Studio: React.FC<{projectId: string}> = ({projectId}) => {
  const [project, setProject] = useState<Project>(newProject);
  const [files, setFiles] = useState<Map<string,Blob>>(new Map());
  const [ready, setReady] = useState(false); const [tab, setTab] = useState<ProjectStep>('draft');
  const [syncDraft,setSyncDraft]=useState<{rows:SyncRow[];cues:Sentence[];base:string}|null>(null);
  const syncBase=(p:Project)=>JSON.stringify([p.id,p.audioRevision,p.scriptRevision,p.sentences,p.scenes]);
  const [selected, setSelected] = useState('');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState(''); const [saveStatus, setSaveStatus] = useState('正在读取本机项目…');
  const [busy, setBusy] = useState(false); const [cloudRepo, setCloudRepo] = useState('motion-render-private');
  const [cloudConsent, setCloudConsent] = useState(false); const [cloudLink, setCloudLink] = useState('');
  const [cacheMedia, setCacheMedia] = useState(false);
  const [outputs, setOutputs] = useState<Record<string, { url: string; blob: Blob; signature: string; runUrl: string }>>({});
  const outputRef = useRef(outputs); outputRef.current = outputs;
  const [renderingIds, setRenderingIds] = useState<string[]>([]);
  const previewQueue = useRef<string[]>([]); const previewEnd = useRef<number | null>(null);
  const filesRef = useRef(files); filesRef.current = files;
  const clearOutputs = () => { for (const v of Object.values(outputRef.current)) URL.revokeObjectURL(v.url); setOutputs({}); setCloudLink(''); };
  useEffect(() => () => { for (const v of Object.values(outputRef.current)) URL.revokeObjectURL(v.url); }, []);
  const audio = useRef<HTMLAudioElement>(null); const frame = useRef<HTMLIFrameElement>(null); const abort = useRef<AbortController | null>(null);
  const projectRef = useRef(project); projectRef.current = project;
  const cacheRef = useRef(cacheMedia); cacheRef.current = cacheMedia;
  const loaded = useRef(false);
  useEffect(() => { let live = true; loadProject(projectId).then(d => {
    if (!live) return;
    if (!d) { setNotice('找不到这个项目，请返回项目列表。'); return; }
    const p = prepareWorkflow(d.project); p.currentStep = resumeStep(p);
    projectRef.current = p; filesRef.current = new Map(d.files); cacheRef.current = d.cacheMedia ?? false;
    setProject(p); setFiles(filesRef.current); setCacheMedia(cacheRef.current); setTab(p.currentStep); loaded.current = true;
    setCloudLink(localStorage.getItem('motion.lastRun.' + p.id) ?? ''); setSaveStatus('已保存'); setReady(true);
  }).catch(e => { if (live) setNotice((e as Error).message); });
    return () => { live = false; audio.current?.pause(); abort.current?.abort(); if (loaded.current) void saveProject(projectRef.current, filesRef.current, cacheRef.current).catch(()=>{}); };
  }, [projectId]);
  useEffect(() => { if (!ready) return; let live = true; setSaveStatus('正在保存…');
    saveProject(project, files, cacheMedia).then(()=>{if(live)setSaveStatus('已保存');}).catch(e=>{if(live)setSaveStatus((e as Error).message);});
    return ()=>{live=false;};
  }, [project, files, ready, cacheMedia]);
  const goStep = async (step: ProjectStep) => {
    if (!canOpenStep(projectRef.current, step)) return;
    audio.current?.pause(); previewEnd.current = null; previewQueue.current = [];
    const next = { ...projectRef.current, currentStep: step }; projectRef.current = next;
    await saveProject(next, filesRef.current, cacheRef.current); setProject(next); setTab(step);
  };
  const leave = async (path: string) => { audio.current?.pause(); await saveProject(projectRef.current, filesRef.current, cacheRef.current); window.location.hash = path; };
  const urls = useMemo(() => Object.fromEntries([...files].map(([id, f]) => [id, URL.createObjectURL(f)])), [files]);
  useEffect(() => () => Object.values(urls).forEach(URL.revokeObjectURL), [urls]);
  const html = useMemo(() => projectHtml(project, urls, true), [project, urls]);
  const timed = useMemo(() => compileScenes(project), [project]);
  const issues = useMemo(() => validateProject(project, files), [project, files]);
  const errors = issues.filter(i => i.level === 'error');
  const audioMeta = project.assets.find(a => a.id === project.audioAssetId); const duration = audioMeta?.duration ?? Math.max(0, ...timed.map(s => s.end));
  const scene = project.scenes.find(s => s.id === selected);
  useEffect(() => { frame.current?.contentWindow?.postMessage({type:'motion-media',files:[...files].filter(([id])=>project.assets.some(a=>a.id===id&&a.kind!=='audio'))},'*'); }, [files, project.assets, html, tab]);
  const notifyFrame = useCallback((t: number, isPlaying: boolean) => frame.current?.contentWindow?.postMessage({ type: 'motion-preview', time: t, playing: isPlaying }, '*'), []);
  useEffect(() => { notifyFrame(time, playing); }, [time, playing, html, notifyFrame]);
  useEffect(() => { if (!playing) return; let id = 0, previous = 0; const tick = (now: number) => { if (now - previous > 100) { notifyFrame(audio.current?.currentTime ?? 0, true); previous = now; } id = requestAnimationFrame(tick); }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, [playing, notifyFrame]);
  const update = (patch: Partial<Project>) => { const next = { ...projectRef.current, ...patch }; projectRef.current = next; setProject(next); };
  const seek = (t: number) => { const value = Math.max(0, Math.min(duration, t)); if (audio.current) audio.current.currentTime = value; setTime(value); };
  const attempt = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setNotice(''); try { await fn(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } };
  const addFiles = async (list: FileList | File[] | null, narration = false) => {
    if (!list) return;
    await attempt(async () => {
      let next = projectRef.current; const nextFiles = new Map(files);
      for (const f of Array.from(list)) {
        const meta = await mediaMetadata(f); if (narration && meta.kind !== 'audio') throw new Error('录音入口只接受音频。');
        if (!narration && meta.kind === 'audio') throw new Error('请从录音入口导入音频，素材入口接受图片和录屏。');
        const existing = pendingAsset(next, f.name, f.size, meta.kind, nextFiles);
        const id = existing?.id ?? uid('asset');
        if (narration && next.audioAssetId && next.audioAssetId !== id) nextFiles.delete(next.audioAssetId);
        if ([...nextFiles.values()].reduce((sum, blob) => sum + blob.size, 0) + f.size > 100 * 1024 ** 2) throw new Error('首版项目素材总量限100MB，建议先做短片段。');
        nextFiles.set(id, f); next = { ...next, assets: [...next.assets.filter(a => a.id !== id), { id, ...meta }] };
        if (narration) {
          setSyncDraft(null);
          const changed = next.audioAssetId && next.audioAssetId !== id;
          if (changed) { const old = next.audioAssetId; nextFiles.delete(old!); next = { ...next, assets: next.assets.filter(a => a.id !== old), sentences: next.sentences.map(s => ({ ...s, start: null, end: null })) }; }
          next = { ...next, audioAssetId: id, audioRevision: existing ? next.audioRevision : next.audioRevision + 1 };
          audio.current?.pause(); setTime(0); setPlaying(false);
          setNotice(changed ? '已更换录音，旧句子时间已清空；画面绑定保留，请重新对齐。' : '录音已添加。接下来确认各段与录音同步。');
        }
      }
      setProject(next); setFiles(nextFiles);
    });
  };
  const sentenceChange = (id: string, patch: Partial<Sentence>) => setProject(p => ({ ...p, sentences: p.sentences.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const sceneChange = (patch: Partial<Scene>) => setProject(p => ({ ...p, scenes: p.scenes.map(s => s.id === selected ? { ...s, ...patch } : s) }));
  const addScene = () => { const used = new Set(project.scenes.flatMap(s => s.sentenceIds)); const first = project.sentences.find(s => !used.has(s.id)); const sc = newScene(first ? [first.id] : []); update({ scenes: [...project.scenes, sc] }); setSelected(sc.id); };
  const readFile = (fn: (file: File) => Promise<void>) => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attempt(() => fn(f)); };
  const importSubtitles = async (f: File) => {
    const sentences = parseSrt(await f.text());
    if (project.sentences.length) {
      const normalize = (s: string) => s.replace(/[\s，。！？、；：,.!?;:“”「」\u200b]/g, '');
      if (sentences.length !== project.sentences.length || sentences.some((s,i)=>normalize(s.text)!==normalize(project.sentences[i].text))) {setSyncDraft({rows:suggestAudioSync(project,sentences),cues:sentences,base:syncBase(project)});setNotice('已按实际字幕生成画面时间建议，请核对后采用。');return;}
      const duration=project.assets.find(a=>a.id===project.audioAssetId)?.duration??Infinity;if(sentences.some(s=>s.end!>duration+.05))throw new Error('字幕超过当前录音长度。');setSyncDraft(null);update({ sentences: project.sentences.map((s,i)=>({ ...s, omitted:false, start: sentences[i].start, end: sentences[i].end })),transcript:{audioRevision:project.audioRevision,cues:sentences} });
    } else update({ sentences, scenes: [] });
    setNotice(`已导入${sentences.length}句实际时间，保留画面绑定。请试听核对。`);
  };
  const exportZip = async (render: boolean) => { const blob = await projectZip(project, files, render); saveBlob(blob, `${render ? 'motion-render' : 'motion-project'}.zip`); setNotice(render ? '已下载渲染包；没有在本机运行渲染。' : '已下载含素材的项目包，换电脑也可以继续。'); };
  const signature = (id: string) => id === 'full' ? JSON.stringify([project, [...files].map(([id,f])=>[id,f.size,(f as File).lastModified])]) : sceneSignature(project, id, files);
  const validOutputs = useMemo(() => Object.fromEntries(Object.entries(outputs).filter(([id, value]) => (id === 'full' || project.scenes.some(s=>s.id===id)) && value.signature === signature(id))), [outputs, project, files]);
  const startPreview = (ids: string[]) => {
    const usable = ids.filter(id => sceneReadiness(project, id, files).ready);
    if (!usable.length) { setNotice('这些段落需要先补齐时间或素材。'); return; }
    previewQueue.current = usable.slice(1); const id = usable[0]; const t = timed.find(s => s.id === id)!;
    setSelected(id); previewEnd.current = t.end; seek(t.start); audio.current?.play().catch(() => setNotice('请点击录音播放按钮开始预览。'));
  };
  const checkPreviewEnd = (value: number) => {
    if (previewEnd.current === null || value < previewEnd.current - .03) { setTime(value); return; }
    const next = previewQueue.current.shift();
    if (next) { const t = timed.find(s=>s.id === next)!; setSelected(next); previewEnd.current = t.end; seek(t.start); }
    else { audio.current?.pause(); const end = previewEnd.current; previewEnd.current = null; seek(end); setPlaying(false); }
  };
  const renderIds = async (ids: string[]) => {
    if (!cloudConsent) { setNotice('请先在完整视频步骤的云端制作设置中确认私有仓库与免费用量。'); return; }
    if (ids.length > 5) { setNotice('一次最多生成5段，避免不必要的云端消耗。请逐段制作，或先连续预览后直接生成完整视频。'); return; }
    if (!window.confirm(`将提交${ids.length}个云端渲染任务，逐个执行，使用 GitHub Actions 用量；不调用付费 AI。是否继续？`)) return;
    const controller = new AbortController(); abort.current = controller; setRenderingIds(ids); audio.current?.pause();
    try { for (const id of ids) {
      if (controller.signal.aborted) break;
      const isFull = id === 'full';
      const r = isFull ? undefined : sceneReadiness(project, id, files);
      if (isFull ? errors.length > 0 : !r?.ready) throw new Error('制作条件已变化，请先处理缺项。');
      const part = isFull ? undefined : segmentProject(project, id);
      const p = part?.project ?? project; const fingerprint = signature(id);
      const blob = await projectZip(p, files, true, part && { start: part.start, duration: part.duration });
      const result = await renderProjectCloud(blob, cloudRepo, message => setNotice(`${isFull ? '完整视频' : p.scenes[0].title}：${message}`), controller.signal);
      const url = URL.createObjectURL(result.blob);
      setOutputs(previous => { if (previous[id]) URL.revokeObjectURL(previous[id].url); return { ...previous, [id]: { ...result, url, signature: fingerprint } }; });
      setCloudLink(result.runUrl); localStorage.setItem('motion.lastRun.' + project.id, result.runUrl);
    } setNotice('云端制作完成。视频可在本页观看；只在点击下载时保存文件，不写入浏览器项目缓存。');
    } finally { setRenderingIds([]); abort.current = null; }
  };
  const uploadDraft = async (f: File) => { const text = await readScriptFile(f); update({ draftText: text, scriptFileName: f.name }); };
  const saveDraft = async () => {
    if (project.scenes.length && project.draftText?.trim() !== project.scriptText && !window.confirm('修改终稿后，需要重新安排画面和同步录音。继续保存？')) return;
    const next = confirmDraft(project, project.draftText ?? ''); setProject(next); projectRef.current = next; clearOutputs();
    await saveProject(next, files, cacheMedia); setNotice('终稿已保存。');
  };
  const importPlan = async (f: File) => {
    if(project.scenes.length && !window.confirm('替换当前画面安排？')) return;
    const next = parseProductionPlan(await f.text(), project); next.currentStep = 'plan';
    setProject(next); projectRef.current = next; clearOutputs(); setSelected('');
    await saveProject(next, files, cacheMedia); setNotice('画面安排已导入。');
  };
  const stepIndex = steps.indexOf(tab);
  return <div className="studio project-workspace">
    <a className="back-link" href="#/projects" onClick={e=>{e.preventDefault();void attempt(()=>leave('#/projects'));}}>← 返回项目列表</a>
    <header className="studio-header"><h1>{ready ? project.title : '读取项目'}</h1><div className="studio-header-actions"><span className="project-save-status" role="status">{saveStatus}</span>
    <details className="project-options"><summary>项目选项</summary><div className="project-options-panel"><label>项目名称<input aria-label="项目名称" value={project.title} onChange={e=>update({title:e.target.value})}/></label><button disabled={busy} onClick={()=>void attempt(()=>exportZip(false))}>下载项目备份</button><label className="studio-checkbox"><input type="checkbox" checked={cacheMedia} onChange={e=>setCacheMedia(e.target.checked)}/>保留原始素材供下次编辑</label><button onClick={()=>{setCacheMedia(false);setNotice('已关闭素材缓存。');}}>清除素材缓存</button><a href="#/help">查看存储说明</a></div></details></div></header>
    {notice && <div className="studio-notice" role="status">{notice}</div>}
    {ready && <>
    <nav className="project-steps" aria-label="制作步骤">{steps.map((step,i)=><button disabled={busy || !canOpenStep(project,step)} key={step} aria-current={tab===step?'step':undefined} onClick={()=>void attempt(()=>goStep(step))}><span>{i+1}</span>{stepLabels[step]}</button>)}</nav>
    <fieldset disabled={busy} className="studio-working-fields">
    {tab==='draft' && <section className="draft-step"><div className="studio-section-heading"><h2>最终稿</h2><FileDrop label=".pdf" accept=".pdf,.docx,.txt,.md" disabled={busy} onFiles={files=>attempt(()=>uploadDraft(files[0]))}><label className="studio-file-button">{project.scriptText?'更换稿件':'上传终稿'}<input type="file" accept=".pdf,.docx,.txt,.md" onChange={readFile(uploadDraft)}/></label></FileDrop></div>
      {project.scriptFileName && <p className="draft-filename">{project.scriptFileName}</p>}
      <textarea aria-label="最终稿" rows={18} value={project.draftText??''} onChange={e=>update({draftText:e.target.value})}/>
      <div className="draft-footer"><span>{hasDraft(project)?'终稿已保存':'终稿修改中'}</span><button disabled={!project.draftText?.trim() || hasDraft(project)} onClick={()=>void attempt(saveDraft)}>保存终稿</button></div>
    </section>}
    {tab==='plan' && <section><AgentHandoff key={project.id} project={project} onApply={async next=>{clearOutputs();projectRef.current=next;setProject(next);setSelected(next.scenes[0]?.id??'');await saveProject(next,filesRef.current,cacheRef.current);}}/><div className="studio-section-heading"><h2>画面安排</h2><details className="plan-file-import"><summary>从文件导入制作总表</summary><div className="studio-actions"><FileDrop label=".json" accept=".json" disabled={busy} onFiles={files=>attempt(()=>importPlan(files[0]))}><label className="studio-file-button prominent">导入制作总表<input type="file" accept=".json" onChange={readFile(importPlan)}/></label></FileDrop></div></details></div>
      {!project.scenes.length && <div className="step-empty"><p>还没有画面安排。</p><a href="#/help">如何准备制作总表？</a></div>}
      {!!project.scenes.length && <SceneBoard project={project} files={files} selected={selected} busy={busy} planning generated={new Set()} onSelect={setSelected} onBatch={()=>{}} onRender={()=>{}}/>}
      {scene && <details className="scene-edit-options"><summary>修改这一段的画面安排</summary><SceneEditor project={project} scene={scene} onChange={sceneChange} onDelete={()=>{update({scenes:project.scenes.filter(s=>s.id!==selected)});setSelected('');}} onDuplicate={()=>{const copy={...scene,id:uid('scene'),sentenceIds:[]};update({scenes:[...project.scenes,copy]});setSelected(copy.id);}}/></details>}
    </section>}
    {tab==='audio' && <section className="audio-step"><h2>录音</h2><FileDrop label="audio/*" accept="audio/*" disabled={busy} onFiles={files=>addFiles(files,true)}><label className="studio-file-button prominent">{audioMeta?'更换录音':'上传录音'}<input type="file" accept="audio/*" onChange={e=>{void addFiles(e.target.files,true);e.target.value='';}}/></label></FileDrop>
      {audioMeta && <><p className="draft-filename">{audioMeta.name} · {formatTime(audioMeta.duration??0)}</p><audio ref={audio} controls preload="metadata" src={urls[project.audioAssetId!]} onTimeUpdate={e=>setTime(e.currentTarget.currentTime)}/>
      {!files.has(project.audioAssetId!) && <p role="status">请重新连接这份录音文件。</p>}
      <div className="sync-status"><strong>{hasTiming(project)?'录音时间已匹配':'录音已添加，等待同步'}</strong><FileDrop label=".srt" accept=".srt,.vtt" disabled={busy} onFiles={files=>attempt(()=>importSubtitles(files[0]))}><label className="studio-file-button">导入同步字幕<input type="file" accept=".srt,.vtt" onChange={readFile(importSubtitles)}/></label></FileDrop></div>
      {!hasTiming(project) && <p className="step-help">导入这份最终录音的时间字幕，系统会按内容匹配画面。允许语气词和不同分句；差异较大的地方需试听确认。目前不直接识别音频。</p>}
      {syncDraft&&<AudioSyncReview key={syncDraft.base+JSON.stringify(syncDraft.cues)} initial={syncDraft.rows} onCancel={()=>setSyncDraft(null)} onListen={t=>{if(audio.current){audio.current.currentTime=t;void audio.current.play();}}} onApply={rows=>void attempt(async()=>{if(syncBase(projectRef.current)!==syncDraft.base)throw new Error('项目或录音已有修改，请重新导入这份录音的字幕。');const next=applyAudioSync(projectRef.current,rows,syncDraft.cues);projectRef.current=next;setProject(next);setSyncDraft(null);clearOutputs();await saveProject(next,filesRef.current,cacheRef.current);setNotice('画面时间已采用，字幕使用实际口播文字，原终稿保持不变。');})}/>}
      <details><summary>调整各句与录音的位置</summary><div className="studio-transcript">{project.sentences.map(s=><div className="studio-sentence" key={s.id}><div className="studio-sentence-id">{s.id}</div><p>{s.text}</p><div className="studio-time-fields"><label>开始（秒）<input aria-label={`${s.id}开始`} type="number" min="0" step=".01" value={s.start??''} onChange={e=>sentenceChange(s.id,{start:e.target.value===''?null:Number(e.target.value)})}/></label><button disabled={!files.has(project.audioAssetId!)} onClick={()=>sentenceChange(s.id,{start:Number(time.toFixed(2))})}>用当前播放位置</button><label>结束（秒）<input aria-label={`${s.id}结束`} type="number" min="0" step=".01" value={s.end??''} onChange={e=>sentenceChange(s.id,{end:e.target.value===''?null:Number(e.target.value)})}/></label><button disabled={!files.has(project.audioAssetId!)} onClick={()=>sentenceChange(s.id,{end:Number(time.toFixed(2))})}>用当前播放位置</button></div></div>)}</div></details>
      </>}
    </section>}
    {tab==='scenes' && <>
      <SceneBoard project={project} files={files} selected={selected} busy={busy} generated={new Set(Object.keys(validOutputs))} onSelect={id=>{setSelected(id);if(sceneReadiness(project,id,files).ready)startPreview([id]);}} onBatch={()=>startPreview(orderedScenes(project).map(s=>s.id))} onRender={ids=>void attempt(()=>renderIds(ids))}/>
      <section className="studio-section"><div className="studio-section-heading"><h2>图片与录屏</h2><FileDrop label="image/png" accept="image/png,image/jpeg,image/webp,video/*" multiple disabled={busy} onFiles={files=>addFiles(files)}><label className="studio-file-button">添加素材<input type="file" multiple accept="image/png,image/jpeg,image/webp,video/*" onChange={e=>{void addFiles(e.target.files);e.target.value='';}}/></label></FileDrop></div><ul className="studio-assets">{project.assets.filter(a=>a.kind!=='audio').map(a=><li key={a.id}><span>{a.kind==='video'?'录屏':'图片'}</span><div><strong>{a.name}</strong><small>{files.has(a.id)?'已连接':'待添加同名文件'}</small></div><button onClick={()=>{update({assets:project.assets.filter(x=>x.id!==a.id)});setFiles(f=>{const n=new Map(f);n.delete(a.id);return n;});}}>移除</button></li>)}</ul></section>
      {scene && <details className="scene-edit-options"><summary>修改当前画面</summary><SceneEditor project={project} scene={scene} onChange={sceneChange} onDelete={()=>{update({scenes:project.scenes.filter(s=>s.id!==selected)});setSelected('');}} onDuplicate={addScene}/></details>}
    </>}
    {(tab==='scenes'||tab==='export') && <aside className="studio-preview-pane project-preview"><h2>{tab==='scenes'?'分段预览':'完整视频预览'}</h2><div className="studio-preview" style={{aspectRatio:`${project.width}/${project.height}`}}><iframe ref={frame} title="口播画面预览" sandbox="allow-scripts" srcDoc={html} onLoad={()=>{frame.current?.contentWindow?.postMessage({type:'motion-media',files:[...files].filter(([id])=>project.assets.some(a=>a.id===id&&a.kind!=='audio'))},'*');notifyFrame(time,playing);}}/></div><div className="studio-playhead"><strong>{formatTime(time)}</strong><span>/ {formatTime(duration)}</span></div><input className="studio-scrubber" aria-label="预览时间" type="range" min="0" max={duration||1} step=".05" value={Math.min(time,duration||1)} onChange={e=>{previewEnd.current=null;previewQueue.current=[];seek(Number(e.target.value));}}/><audio ref={audio} controls preload="metadata" src={project.audioAssetId?urls[project.audioAssetId]:undefined} onTimeUpdate={e=>checkPreviewEnd(e.currentTarget.currentTime)} onPlay={()=>setPlaying(true)} onPause={()=>{setPlaying(false);setTime(audio.current?.currentTime??0);}} onEnded={()=>setPlaying(false)}/>
      {selected && validOutputs[selected] && <section className="studio-output"><h3>本段成片</h3><video controls src={validOutputs[selected].url}/><button onClick={()=>saveBlob(validOutputs[selected].blob,'motion-segment.mp4')}>下载本段视频</button></section>}
      {validOutputs.full && <section className="studio-output"><h3>完整视频</h3><video controls src={validOutputs.full.url}/><button onClick={()=>saveBlob(validOutputs.full.blob,'motion.mp4')}>下载完整视频</button></section>}
    </aside>}
    {tab==='export' && <section className="export-step"><div className="studio-fields"><label>画幅<select value={project.width} onChange={e=>update(e.target.value==='1920'?{width:1920,height:1080}:{width:1080,height:1920})}><option value="1920">横屏 16:9</option><option value="1080">竖屏 9:16</option></select></label><label className="studio-checkbox"><input type="checkbox" checked={project.captions} onChange={e=>update({captions:e.target.checked})}/>显示字幕</label></div>
      {!!errors.length && <div className="studio-notice"><strong>生成前还需要处理</strong><ul>{errors.slice(0,8).map((e,i)=><li key={i}>{e.message}</li>)}</ul></div>}
      <details><summary>云端制作设置</summary><label>私有渲染仓库<input value={cloudRepo} onChange={e=>setCloudRepo(e.target.value)}/></label><label className="studio-checkbox"><input type="checkbox" checked={cloudConsent} onChange={e=>setCloudConsent(e.target.checked)}/>允许上传到我的私有仓库，仅使用免费用量</label><a href="#/help">查看云端制作说明</a></details>
      <button className="primary" disabled={errors.length>0} onClick={()=>void attempt(()=>renderIds(['full']))}>生成完整视频</button>
      {cloudLink && <p><a target="_blank" rel="noreferrer" href={cloudLink}>查看最近制作任务</a></p>}
    </section>}
    </fieldset>
    <footer className="project-step-footer"><button disabled={busy} onClick={()=>void attempt(()=>stepIndex>0?goStep(steps[stepIndex-1]):leave('#/projects'))}>{stepIndex>0?'← 上一步':'← 返回项目列表'}</button>
      {stepIndex<steps.length-1 && <button className="primary" disabled={busy||!canOpenStep(project,steps[stepIndex+1])} onClick={()=>void attempt(()=>goStep(steps[stepIndex+1]))}>下一步：{stepLabels[steps[stepIndex+1]]} →</button>}
    </footer>
    </>}
    {busy && abort.current && <div className="studio-notice">云端制作中<button onClick={()=>abort.current?.abort()}>停止等待及后续队列</button></div>}
  </div>;
};
