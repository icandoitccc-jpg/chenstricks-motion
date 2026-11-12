import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileScenes, formatTime, newProject, newScene, parseProductionPlan, pendingAsset, parseSrt, splitScript, uid, validateProject, type Project, type Scene, type Sentence } from '../lib/project';
import { loadProject, saveProject, listProjects, deleteProject, type ProjectEntry, mediaMetadata, planningPacket, projectZip, readProjectZip } from '../lib/project-files';
import { projectHtml } from '../lib/project-render';
import { renderProjectCloud } from '../lib/project-cloud';
import { saveBlob } from '../lib/github';
import { SceneEditor } from '../components/SceneEditor';
import { SceneBoard } from '../components/SceneBoard';
import { orderedScenes, sceneReadiness, segmentProject, sceneSignature } from '../lib/scene-board';
import '../studio.css';

type Tab = 'inputs' | 'plan' | 'scenes' | 'export';
const labels: Record<Tab,string> = { inputs: '1 · 稿子与录音', plan: '2 · 制作总表', scenes: '3 · 分段画面', export: '4 · 完整视频' };
export const Studio: React.FC = () => {
  const [project, setProject] = useState<Project>(newProject);
  const [files, setFiles] = useState<Map<string,Blob>>(new Map());
  const [ready, setReady] = useState(false); const [tab, setTab] = useState<Tab>('inputs');
  const [selected, setSelected] = useState(''); const [script, setScript] = useState('');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState(''); const [saveStatus, setSaveStatus] = useState('正在读取本机项目…');
  const [busy, setBusy] = useState(false); const [cloudRepo, setCloudRepo] = useState('motion-render-private');
  const [cloudConsent, setCloudConsent] = useState(false); const [cloudLink, setCloudLink] = useState('');
  const [catalog, setCatalog] = useState<ProjectEntry[]>([]); const [showProjects, setShowProjects] = useState(true);
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
  useEffect(() => { let live = true; loadProject().then(async d => { if (!live) return; if (d) { setProject(d.project); setFiles(new Map(d.files)); setCacheMedia(d.cacheMedia ?? false); setCloudLink(localStorage.getItem('motion.lastRun.' + d.project.id) ?? ''); } setCatalog(await listProjects()); setSaveStatus(d ? '已恢复项目' : '新项目'); }).catch(e => { if (live) setNotice((e as Error).message); }).finally(() => { if (live) setReady(true); }); return () => { live = false; abort.current?.abort(); }; }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => { saveProject(project, files, cacheMedia).then(async () => { setSaveStatus(cacheMedia ? '项目及原始素材保存在此浏览器' : '项目已保存；媒体不写入本地存储'); setCatalog(await listProjects()); }).catch(e => setSaveStatus((e as Error).message)); }, 800); return () => clearTimeout(timer); }, [project, files, ready, cacheMedia]);
  const activateProject = async (id?: string) => {
    setReady(false); audio.current?.pause(); previewEnd.current = null; previewQueue.current = [];
    try {
      await saveProject(projectRef.current, filesRef.current, cacheMedia);
      const data = id ? await loadProject(id) : undefined;
      if (id && !data) throw new Error('项目已不存在。');
      setProject(data?.project ?? newProject()); setFiles(new Map(data?.files ?? [])); setCacheMedia(data?.cacheMedia ?? false);
      clearOutputs(); setTime(0); setPlaying(false); setScript(''); setSelected(''); setTab('inputs'); setShowProjects(false); setNotice('');
      setCloudLink(id ? localStorage.getItem('motion.lastRun.' + id) ?? '' : '');
      setCatalog(await listProjects());
    } finally { setReady(true); }
  };
  const urls = useMemo(() => Object.fromEntries([...files].map(([id, f]) => [id, URL.createObjectURL(f)])), [files]);
  useEffect(() => () => Object.values(urls).forEach(URL.revokeObjectURL), [urls]);
  const html = useMemo(() => projectHtml(project, urls, true), [project, urls]);
  const timed = useMemo(() => compileScenes(project), [project]);
  const issues = useMemo(() => validateProject(project, files), [project, files]);
  const errors = issues.filter(i => i.level === 'error');
  const audioMeta = project.assets.find(a => a.id === project.audioAssetId); const duration = audioMeta?.duration ?? Math.max(0, ...timed.map(s => s.end));
  const scene = project.scenes.find(s => s.id === selected);
  const notifyFrame = useCallback((t: number, isPlaying: boolean) => frame.current?.contentWindow?.postMessage({ type: 'motion-preview', time: t, playing: isPlaying }, '*'), []);
  useEffect(() => { notifyFrame(time, playing); }, [time, playing, html, notifyFrame]);
  useEffect(() => { if (!playing) return; let id = 0, previous = 0; const tick = (now: number) => { if (now - previous > 100) { notifyFrame(audio.current?.currentTime ?? 0, true); previous = now; } id = requestAnimationFrame(tick); }; id = requestAnimationFrame(tick); return () => cancelAnimationFrame(id); }, [playing, notifyFrame]);
  const update = (patch: Partial<Project>) => setProject(p => ({ ...p, ...patch }));
  const seek = (t: number) => { const value = Math.max(0, Math.min(duration, t)); if (audio.current) audio.current.currentTime = value; setTime(value); };
  const attempt = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setNotice(''); try { await fn(); } catch (e) { setNotice((e as Error).message); } finally { setBusy(false); } };
  const addFiles = async (list: FileList | null, narration = false) => {
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
          const changed = next.audioAssetId && next.audioAssetId !== id;
          if (changed) { const old = next.audioAssetId; nextFiles.delete(old!); next = { ...next, assets: next.assets.filter(a => a.id !== old), sentences: next.sentences.map(s => ({ ...s, start: null, end: null })) }; }
          next = { ...next, audioAssetId: id, audioRevision: existing ? next.audioRevision : next.audioRevision + 1 };
          audio.current?.pause(); setTime(0); setPlaying(false);
          setNotice(changed ? '已更换录音，旧句子时间已清空；画面绑定保留，请重新对齐。' : '录音已导入。下一步导入制作总表；若缺实际时间，再补充时间字幕或手工标记。');
        }
      }
      setProject(next); setFiles(nextFiles);
    });
  };
  const sentenceChange = (id: string, patch: Partial<Sentence>) => setProject(p => ({ ...p, sentences: p.sentences.map(s => s.id === id ? { ...s, ...patch } : s) }));
  const sceneChange = (patch: Partial<Scene>) => setProject(p => ({ ...p, scenes: p.scenes.map(s => s.id === selected ? { ...s, ...patch } : s) }));
  const addScene = () => { const used = new Set(project.scenes.flatMap(s => s.sentenceIds)); const first = project.sentences.find(s => !used.has(s.id)); const sc = newScene(first ? [first.id] : []); update({ scenes: [...project.scenes, sc] }); setSelected(sc.id); };
  const downloadText = (text: string, name: string) => saveBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), name);
  const readFile = (fn: (file: File) => Promise<void>) => (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void attempt(() => fn(f)); };
  const importSubtitles = async (f: File) => {
    const sentences = parseSrt(await f.text());
    if (project.sentences.length) {
      const normalize = (s: string) => s.replace(/[\s，。！？、；：,.!?;:“”「」\u200b]/g, '');
      if (sentences.length !== project.sentences.length || sentences.some((s,i)=>normalize(s.text)!==normalize(project.sentences[i].text))) throw new Error('字幕分句或文字与终稿不一致，未覆盖总表。请提供同样分句的实际时间，或手工标记；当前不自动对齐。');
      update({ sentences: project.sentences.map((s,i)=>({ ...s, start: sentences[i].start, end: sentences[i].end })) });
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
    if (!cloudConsent) { setTab('export'); setNotice('先在完整视频页确认私有仓库与免费额度，再回来生成分段。'); return; }
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
  return <div className="studio">
    <header className="studio-header"><div><h1>视频制作</h1><p>录音定时长，总表定画面，Motion按表执行。</p></div><div className="studio-header-actions"><span className="studio-hint" role="status">{saveStatus}</span><button disabled={busy || !ready} onClick={() => { setShowProjects(v=>!v); }}>我的项目</button><label className="studio-file-button">导入项目包<input disabled={busy} type="file" accept=".zip" onChange={readFile(async f => { const d = await readProjectZip(f); audio.current?.pause(); setProject(d.project); setFiles(new Map(d.files)); setTime(0); setPlaying(false); setSelected(''); setCacheMedia(false); clearOutputs(); previewEnd.current = null; previewQueue.current = []; setShowProjects(false); setNotice('项目已打开。'); })} /></label><button disabled={busy || !ready} onClick={() => void attempt(() => activateProject())}>新建视频项目</button></div></header>
    {showProjects && <section className="studio-projects" aria-label="我的视频项目"><h2>我的视频项目</h2><p className="studio-hint">每篇稿子一个项目。清单和总表保存在此浏览器，不是云端同步；默认不缓存录音和素材，重新打开需连接原文件。成片不永久保存在本机。</p><div className="studio-project-grid">{catalog.map(entry => <article key={entry.project.id}><strong>{entry.project.title}</strong><small>{entry.project.scenes.length} 段 · {entry.project.sentences.length} 句</small><small>{entry.cacheMedia ? '含本机素材缓存' : '只保存总表与设置'}</small><div className="studio-actions"><button disabled={busy} onClick={() => void attempt(()=>activateProject(entry.project.id))}>打开</button><button disabled={busy} onClick={() => void attempt(async()=>{ if (!window.confirm('删除此项目和本机素材缓存？云端渲染历史不受影响。')) return; await deleteProject(entry.project.id); localStorage.removeItem('motion.lastRun.' + entry.project.id); if(entry.project.id===project.id) { setReady(false); setProject(newProject()); setFiles(new Map()); clearOutputs(); setSelected(''); setTime(0); audio.current?.pause(); setReady(true); } setCatalog(await listProjects()); })}>删除</button></div></article>)}</div><label className="studio-checkbox"><input type="checkbox" checked={cacheMedia} disabled={busy} onChange={e=>setCacheMedia(e.target.checked)}/>在此浏览器缓存当前项目原始素材（可选，占用本地空间）</label><button disabled={busy} onClick={()=>void attempt(async()=>{ setCacheMedia(false); await saveProject(project, files, false); setCatalog(await listProjects()); setNotice('已移除当前项目的本地素材缓存；当前页面仍可使用内存中的文件。'); })}>清除当前项目素材缓存</button></section>}
    <div className="studio-flow-note"><strong>录音 → 制作总表 → 准备画面 → 预览与导出</strong><p>先规划画面，再绑定录音实际时间。60秒图解云端成片已验证；自动对齐、素材接口和长片仍待验证。</p></div>
    <input className="studio-project-title" aria-label="项目名称" value={project.title} onChange={e => update({ title: e.target.value })} />
    <div className="studio-tabs" role="tablist" aria-label="制作步骤">{(Object.keys(labels) as Tab[]).map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{labels[t]}</button>)}</div>
    {notice && <div className="studio-notice" role="status">{notice}</div>}
    {tab === 'scenes' && <SceneBoard project={project} files={files} selected={selected} busy={busy} generated={new Set(Object.keys(validOutputs))} onSelect={id=>{ setSelected(id); if(sceneReadiness(project,id,files).ready) startPreview([id]); }} onBatch={()=>startPreview(orderedScenes(project).map(s=>s.id))} onRender={ids=>void attempt(()=>renderIds(ids))}/>}
    <fieldset disabled={busy || !ready} className="studio-working-fields"><div className="studio-workspace"><div className="studio-editing">
    {tab === 'inputs' && <>
      <section className="studio-section"><h2>最终录音</h2><p>录音就是你根据最终稿录好的音频。读取真实时长后，用它对齐制作总表。目前不自动转写，单文件最大40MB。</p><label className="studio-file-button prominent">{audioMeta ? '更换录音' : '导入录音'}<input type="file" accept="audio/*" disabled={busy} onChange={e => { void addFiles(e.target.files, true); e.target.value = ''; }} /></label>{audioMeta && <span className="studio-file-name">{audioMeta.name} · {formatTime(audioMeta.duration ?? 0)}</span>}</section>
      <button className="primary studio-next" disabled={!audioMeta} onClick={() => setTab('plan')}>下一步：导入制作总表 →</button>
      <details open><summary>最终稿与录音实际时间</summary><section className="studio-section"><div className="studio-section-heading"><h2>原文与实际时间</h2><label className="studio-file-button">导入带时间的字幕文件<input disabled={busy} type="file" accept=".srt,.vtt" onChange={readFile(importSubtitles)} /></label></div><p>SRT / VTT是字幕文件格式，包含每句开始和结束的时间。已有完整制作总表时不用重复填写。缺少实测时间时，可导入字幕或在这里听录音标记；目前不自动转写，不按字数估算。</p>
      {!project.sentences.length && <><textarea rows={6} aria-label="口播稿" placeholder="粘贴最终口播稿…" value={script} onChange={e => setScript(e.target.value)} /><button disabled={!script.trim()} onClick={() => update({ sentences: splitScript(script) })}>按句子整理</button></>}
      <div className="studio-transcript">{project.sentences.map(s => <div className="studio-sentence" key={s.id}><div className="studio-sentence-id"><button title="跳到此句" onClick={() => s.start !== null && seek(s.start)}>{s.id}</button></div><textarea aria-label={`${s.id}文字`} rows={2} value={s.text} onChange={e => sentenceChange(s.id, { text: e.target.value })} /><div className="studio-time-fields"><label>开始（秒）<input aria-label={`${s.id}开始`} type="number" min="0" step="0.01" value={s.start ?? ''} onChange={e => sentenceChange(s.id, { start: e.target.value === '' ? null : Number(e.target.value) })} /></label><button disabled={!audioMeta} onClick={() => sentenceChange(s.id, { start: Number(time.toFixed(2)) })}>标开始</button><label>结束（秒）<input aria-label={`${s.id}结束`} type="number" min="0" step="0.01" value={s.end ?? ''} onChange={e => sentenceChange(s.id, { end: e.target.value === '' ? null : Number(e.target.value) })} /></label><button disabled={!audioMeta} onClick={() => sentenceChange(s.id, { end: Number(time.toFixed(2)) })}>标结束</button></div></div>)}</div></section>
      </details>
    </>}
    {tab === 'scenes' && <>
      <section className="studio-section"><div className="studio-section-heading"><h2>总表需要的图片与录屏</h2><label className="studio-file-button">添加素材<input disabled={busy} multiple type="file" accept="image/png,image/jpeg,image/webp,video/*" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} /></label></div><p>当前需手动添加电脑里的截图、图片或录屏。未接通Workspace／WORKPRINT自动取文件。总表列出的缺失素材会显示在下方，添加同名文件即可连接。默认仅在本次页面内使用素材；可在我的项目中选择缓存。单文件40MB、项目100MB。</p><ul className="studio-assets">{project.assets.filter(a => a.kind !== 'audio').map(a => <li key={a.id}><span>{a.kind === 'image' ? '图片' : '录屏'}</span><div><strong>{a.name}</strong><small>{a.id}{a.duration ? ` · ${formatTime(a.duration)}` : ''}{!files.has(a.id) ? ' · 文件未连接，请重新添加同名素材' : ''}</small></div><button onClick={() => { if (project.scenes.some(s => s.assetId === a.id) && !window.confirm('该素材正在使用，删除后相关画面将显示缺项。继续？')) return; update({ assets: project.assets.filter(x => x.id !== a.id) }); setFiles(f => { const n = new Map(f); n.delete(a.id); return n; }); }}>移除</button></li>)}</ul></section>
    </>}
    {tab === 'plan' && <>
      <section className="studio-section"><h2>视频制作总表</h2>{!audioMeta && <p role="status">可以先导入无时间的画面规划；录音导入后需要补实际时间。</p>}<p>总表规定稿子原文、每段画面、素材文件名和动画指令；没有录音实际时间时先留空，可先查看全部卡片。ChatGPT／Codex／WorkBuddy按Motion格式生成JSON文件后导入；缺实际时间会提示，不会自动猜测。</p><div className="studio-actions"><button disabled={busy} onClick={() => downloadText(planningPacket(project), 'motion-planning.md')}>导出给ChatGPT的制作资料</button><label className="studio-file-button prominent">导入制作总表<input disabled={busy} type="file" accept=".json" onChange={readFile(async f => { if (project.scenes.length && !window.confirm('总表将替换原文时间和画面安排，已添加文件会保留。继续？')) return; const next = parseProductionPlan(await f.text(), project); setProject(next); setSelected(next.scenes[0]?.id ?? ''); setNotice(`已导入${next.sentences.length}句原文和${next.scenes.length}个画面。请连接缺失素材；未标时间的句子需要实际对齐后才能导出。`); setTab('scenes'); })} /></label></div><details><summary>制作资料和制作总表有什么区别？</summary><p>制作资料是给ChatGPT的输入，包含当前录音版本、已有原文时间和素材索引；总表是ChatGPT返回的执行结果。已有兼容总表直接导入，不必重复导出资料。资料不包含录音文件，若需要ChatGPT听录音，请另外提供录音或真实时间字幕。</p></details><p>当前没有直接连接ChatGPT、Workspace或WORKPRINT的MCP通道，需要手动传文件。</p></section>
    </>}
    {tab === 'scenes' && <>
      <div className="studio-actions"><button onClick={addScene}>补充一个画面</button><button onClick={() => setTab('plan')}>重新导入总表</button><button className="primary" onClick={() => setTab('export')}>下一步：预览与导出 →</button></div>
      <div className="studio-status-grid"><span>{project.scenes.length}个画面</span><span>{project.assets.filter(a=>a.kind!=='audio' && !files.has(a.id)).length}个素材待添加</span><span>{project.sentences.filter(s=>s.start===null || s.end===null).length}句待补实际时间</span></div><div className="studio-scene-layout">{scene && <SceneEditor project={project} scene={scene} onChange={sceneChange} onDelete={() => { update({ scenes: project.scenes.filter(s => s.id !== selected) }); setSelected(''); }} onDuplicate={() => { const copy = { ...scene, id: uid('scene'), title: `${scene.title}（副本）`, sentenceIds: [] }; update({ scenes: [...project.scenes, copy] }); setSelected(copy.id); }} />}</div>
    </>}
    {tab === 'export' && <>
      <section className="studio-section"><h2>成片设置</h2><p>视频长度跟随录音；20分钟导出尚未实测。当前先用60—90秒验证：单文件40MB、项目100MB、云端包80MB。云端任务30分钟是运行超时，不是视频时长上限。</p><div className="studio-fields"><label>画幅<select value={`${project.width}`} onChange={e => update(e.target.value === '1920' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 })}><option value="1920">横屏 16:9</option><option value="1080">竖屏 9:16</option></select></label><label className="studio-checkbox"><input type="checkbox" checked={project.captions} onChange={e => update({ captions: e.target.checked })} />显示录音字幕</label></div></section>
      <section className="studio-section"><h2>导出前检查</h2><p>{errors.length ? `${errors.length}项需要处理` : '基础时间与素材检查通过；仍请完整试听预览。'}</p><ul className="studio-issues">{issues.slice(0, 30).map((issue, i) => <li key={i} className={issue.level}>{issue.message}</li>)}{issues.length > 30 && <li>另有{issues.length - 30}项，请先处理前面的缺项。</li>}</ul></section>
      <section className="studio-section"><h2>项目备份（可选）</h2><p>项目包包含原始素材、句子时间和画面方案，方便继续编辑。成片不会写入项目备份。</p><div className="studio-actions"><button disabled={busy} onClick={() => void attempt(() => exportZip(false))}>下载项目包</button></div></section>
      <details open><summary>云端制作设置与完整视频</summary><section className="studio-section"><h2>云端导出 MP4</h2><p>在 GitHub 的私有仓库运行 HyperFrames，本机不渲染。首次需要一个已添加 README 的私有仓库，以及可读写该仓库和工作流的 Token（在 Motion 设置中填写）。仓库内会保存素材历史，请勿使用公开仓库。</p><p>使用 GitHub Actions 标准运行器；请确认账户有免费额度，并关闭超额付费。每次提交一个任务，运行超时上限30分钟。60秒纯文字图解后台渲染已验证；页面提交和混合素材仍待实际验收。</p><label>私有渲染仓库名<input value={cloudRepo} onChange={e => setCloudRepo(e.target.value)} /></label><label className="studio-checkbox"><input type="checkbox" checked={cloudConsent} onChange={e => setCloudConsent(e.target.checked)} />允许把本项目素材上传至我的私有仓库，并确认仅使用免费额度</label><div className="studio-actions"><button className="primary" disabled={busy || errors.length > 0 || !cloudConsent} onClick={() => void attempt(()=>renderIds(['full']))}>生成完整视频</button></div>{cloudLink && <a href={cloudLink} target="_blank" rel="noreferrer">查看最近云端任务 / 取回产物（保留1天）</a>}<button disabled={!Object.keys(outputs).length} onClick={clearOutputs}>释放页面视频缓存</button></section></details>
    </>}
    </div><aside className="studio-preview-pane"><div className="studio-preview-heading"><h2>画面预览</h2><span>轻量预览 · 不渲染视频</span></div><div className="studio-preview" style={{ aspectRatio: `${project.width}/${project.height}` }}>{!project.scenes.length && <div className="studio-preview-empty">导入制作总表后，这里预览对应时间的画面。只有录音时可先试听；不显示画面并不代表音频导入失败。</div>}<iframe ref={frame} title="口播画面预览" sandbox="allow-scripts" srcDoc={html} onLoad={() => notifyFrame(time, playing)} /></div><div className="studio-playhead"><strong>{formatTime(time)}</strong><span>/ {formatTime(duration)}</span></div><input className="studio-scrubber" aria-label="预览时间" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(time, duration || 1)} onChange={e => { previewEnd.current = null; previewQueue.current = []; seek(Number(e.target.value)); }} />
    <audio ref={audio} controls preload="metadata" src={project.audioAssetId ? urls[project.audioAssetId] : undefined} onTimeUpdate={e => checkPreviewEnd(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setTime(audio.current?.currentTime ?? 0); }} onEnded={() => setPlaying(false)} onError={() => { if (project.audioAssetId) setNotice('录音无法播放，请重新导入常见音频格式。'); }} />
    {selected && validOutputs[selected] && <section className="studio-output"><h3>本段成片 · {scene?.title}</h3><video controls preload="metadata" src={validOutputs[selected].url}/><button onClick={()=>saveBlob(validOutputs[selected].blob, 'motion-segment.mp4')}>下载本段视频</button><a target="_blank" rel="noreferrer" href={validOutputs[selected].runUrl}>云端任务</a></section>}
    {validOutputs.full && <section className="studio-output"><h3>完整视频</h3><video controls preload="metadata" src={validOutputs.full.url}/><button onClick={()=>saveBlob(validOutputs.full.blob, 'motion.mp4')}>下载完整视频</button><a target="_blank" rel="noreferrer" href={validOutputs.full.runUrl}>云端任务</a><p className="studio-hint">仅临时读取到页面播放，不写入本机项目缓存；刷新后可从云端任务取回，产物保留1天。完整导出按总表统一渲染，目前不复用分段MP4。</p></section>}
    <p className="studio-hint">未分配画面的停顿会保持上一幕。录屏原声静音，录音始终作为主音轨。当前未标时间的画面不会显示。</p><div className="studio-progress"><span>{project.sentences.length}句录音</span><span>{project.scenes.length}个画面</span><span>{project.sentences.filter(s => s.start !== null && s.end !== null).length}句已标时间</span></div></aside></div></fieldset>{busy && abort.current && <div className="studio-notice">正在云端制作{renderingIds.length > 1 ? `（队列${renderingIds.length}段）` : ''}<button onClick={() => abort.current?.abort()}>停止等待及后续队列</button><p>已经启动的云端任务需到GitHub任务页取消。</p></div>}
  </div>;
};
