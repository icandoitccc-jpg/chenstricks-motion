import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { compileScenes, formatTime, newProject, newScene, parseScenePlan, parseSrt, splitScript, uid, validateProject, type Project, type Scene, type Sentence } from '../lib/project';
import { loadProject, saveProject, mediaMetadata, planningPacket, projectZip, readProjectZip } from '../lib/project-files';
import { projectHtml } from '../lib/project-render';
import { renderProjectCloud } from '../lib/project-cloud';
import { saveBlob } from '../lib/github';
import { SceneEditor } from '../components/SceneEditor';
import '../studio.css';

type Tab = 'inputs' | 'scenes' | 'export';
const labels: Record<Tab,string> = { inputs: '1 · 旁白与素材', scenes: '2 · 画面安排', export: '3 · 检查与导出' };
export const Studio: React.FC = () => {
  const [project, setProject] = useState<Project>(newProject);
  const [files, setFiles] = useState<Map<string,Blob>>(new Map());
  const [ready, setReady] = useState(false); const [tab, setTab] = useState<Tab>('inputs');
  const [selected, setSelected] = useState(''); const [script, setScript] = useState('');
  const [time, setTime] = useState(0); const [playing, setPlaying] = useState(false);
  const [notice, setNotice] = useState(''); const [saveStatus, setSaveStatus] = useState('正在读取本机项目…');
  const [busy, setBusy] = useState(false); const [cloudRepo, setCloudRepo] = useState('motion-render-private');
  const [cloudConsent, setCloudConsent] = useState(false); const [cloudLink, setCloudLink] = useState('');
  const audio = useRef<HTMLAudioElement>(null); const frame = useRef<HTMLIFrameElement>(null); const abort = useRef<AbortController | null>(null);
  const projectRef = useRef(project); projectRef.current = project;
  useEffect(() => { let live = true; loadProject().then(d => { if (!live) return; if (d) { setProject(d.project); setFiles(new Map(d.files)); } setSaveStatus(d ? '已恢复本机项目' : '新项目'); }).catch(e => { if (live) setNotice((e as Error).message); }).finally(() => { if (live) setReady(true); }); return () => { live = false; abort.current?.abort(); }; }, []);
  useEffect(() => { if (!ready) return; const timer = setTimeout(() => { saveProject(project, files).then(() => setSaveStatus('已保存在此浏览器')).catch(e => setSaveStatus((e as Error).message)); }, 1200); return () => clearTimeout(timer); }, [project, files, ready]);
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
        const meta = await mediaMetadata(f); if (narration && meta.kind !== 'audio') throw new Error('旁白入口只接受音频。');
        if (!narration && meta.kind === 'audio') throw new Error('请从旁白入口导入音频，素材入口接受图片和录屏。');
        const existing = next.assets.find(a => a.name === f.name && a.size === f.size && a.kind === meta.kind && !nextFiles.has(a.id));
        const id = existing?.id ?? uid('asset');
        if ([...nextFiles.values()].reduce((sum, blob) => sum + blob.size, 0) + f.size > 100 * 1024 ** 2) throw new Error('首版项目素材总量限100MB，建议先做短片段。');
        nextFiles.set(id, f); next = { ...next, assets: [...next.assets.filter(a => a.id !== id), { id, ...meta }] };
        if (narration) {
          const changed = next.audioAssetId && next.audioAssetId !== id;
          if (changed) { const old = next.audioAssetId; nextFiles.delete(old!); next = { ...next, assets: next.assets.filter(a => a.id !== old), sentences: next.sentences.map(s => ({ ...s, start: null, end: null })) }; }
          next = { ...next, audioAssetId: id, audioRevision: existing ? next.audioRevision : next.audioRevision + 1 };
          audio.current?.pause(); setTime(0); setPlaying(false);
          setNotice(changed ? '已更换录音，旧句子时间已清空；画面绑定保留，请重新对齐。' : '旁白已导入。请导入时间字幕，或听录音标记句子时间。');
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
  const importSubtitles = async (f: File) => { if (project.scenes.length && !window.confirm('替换时间字幕会清空画面绑定。请先下载项目包备份，是否继续？')) return; const sentences = parseSrt(await f.text()); update({ sentences, scenes: [] }); setSelected(''); setNotice(`已导入${sentences.length}条时间字幕，请听录音核对。`); };
  const exportZip = async (render: boolean) => { const blob = await projectZip(project, files, render); saveBlob(blob, `${render ? 'motion-render' : 'motion-project'}.zip`); setNotice(render ? '已下载渲染包；没有在本机运行渲染。' : '已下载含素材的项目包，换电脑也可以继续。'); };
  const cloudRender = async () => { const controller = new AbortController(); abort.current = controller; const blob = await projectZip(project, files, true); const link = await renderProjectCloud(blob, cloudRepo, setNotice, controller.signal); setCloudLink(link); setNotice('云端渲染完成，MP4已下载。'); };
  return <div className="studio">
    <header className="studio-header"><div><h1>口播项目</h1><p>先有声音，再让画面跟上。</p></div><div className="studio-header-actions"><span className="studio-hint" role="status">{saveStatus}</span><label className="studio-file-button">打开项目<input disabled={busy} type="file" accept=".zip" onChange={readFile(async f => { const d = await readProjectZip(f); audio.current?.pause(); setProject(d.project); setFiles(new Map(d.files)); setTime(0); setPlaying(false); setSelected(''); setNotice('项目已打开。'); })} /></label><button disabled={busy || !ready} onClick={() => { if (window.confirm('新建前请下载当前项目包备份。确认新建？')) { audio.current?.pause(); setProject(newProject()); setFiles(new Map()); setSelected(''); setTime(0); setPlaying(false); setScript(''); } }}>新建</button></div></header>
    <input className="studio-project-title" aria-label="项目名称" value={project.title} onChange={e => update({ title: e.target.value })} />
    <div className="studio-tabs" role="tablist" aria-label="制作步骤">{(Object.keys(labels) as Tab[]).map(t => <button role="tab" aria-selected={tab === t} key={t} onClick={() => setTab(t)}>{labels[t]}</button>)}</div>
    {notice && <div className="studio-notice" role="status">{notice}</div>}
    <div className="studio-workspace"><div className="studio-editing">
    {tab === 'inputs' && <>
      <section className="studio-section"><h2>最终旁白</h2><p>导入你录好的声音。只读取时长，不在电脑上运行语音模型。</p><label className="studio-file-button prominent">{audioMeta ? '更换旁白' : '导入旁白'}<input type="file" accept="audio/*" disabled={busy} onChange={e => { void addFiles(e.target.files, true); e.target.value = ''; }} /></label>{audioMeta && <span className="studio-file-name">{audioMeta.name} · {formatTime(audioMeta.duration ?? 0)}</span>}</section>
      <section className="studio-section"><div className="studio-section-heading"><h2>稿子与时间</h2><label className="studio-file-button">导入 SRT / VTT<input disabled={busy} type="file" accept=".srt,.vtt" onChange={readFile(importSubtitles)} /></label></div><p>有时间字幕就直接导入；没有时，粘贴稿子，边听边标记。首版不自动转写，也不猜秒数。</p>
      {!project.sentences.length && <><textarea rows={6} aria-label="口播稿" placeholder="粘贴最终口播稿…" value={script} onChange={e => setScript(e.target.value)} /><button disabled={!script.trim()} onClick={() => update({ sentences: splitScript(script) })}>按句子整理</button></>}
      <div className="studio-transcript">{project.sentences.map(s => <div className="studio-sentence" key={s.id}><div className="studio-sentence-id"><button title="跳到此句" onClick={() => s.start !== null && seek(s.start)}>{s.id}</button></div><textarea aria-label={`${s.id}文字`} rows={2} value={s.text} onChange={e => sentenceChange(s.id, { text: e.target.value })} /><div className="studio-time-fields"><label>开始（秒）<input aria-label={`${s.id}开始`} type="number" min="0" step="0.01" value={s.start ?? ''} onChange={e => sentenceChange(s.id, { start: e.target.value === '' ? null : Number(e.target.value) })} /></label><button disabled={!audioMeta} onClick={() => sentenceChange(s.id, { start: Number(time.toFixed(2)) })}>标开始</button><label>结束（秒）<input aria-label={`${s.id}结束`} type="number" min="0" step="0.01" value={s.end ?? ''} onChange={e => sentenceChange(s.id, { end: e.target.value === '' ? null : Number(e.target.value) })} /></label><button disabled={!audioMeta} onClick={() => sentenceChange(s.id, { end: Number(time.toFixed(2)) })}>标结束</button></div></div>)}</div></section>
      <section className="studio-section"><div className="studio-section-heading"><h2>图片与录屏</h2><label className="studio-file-button">添加素材<input disabled={busy} multiple type="file" accept="image/png,image/jpeg,image/webp,video/*" onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} /></label></div><p>从 WORKPRINT 导出的真实素材，或新录制的演示。素材只保存在当前浏览器；需要备份请下载项目包。</p><ul className="studio-assets">{project.assets.filter(a => a.kind !== 'audio').map(a => <li key={a.id}><span>{a.kind === 'image' ? '图片' : '录屏'}</span><div><strong>{a.name}</strong><small>{a.id}{a.duration ? ` · ${formatTime(a.duration)}` : ''}{!files.has(a.id) ? ' · 文件未连接，请重新添加同名素材' : ''}</small></div><button onClick={() => { if (project.scenes.some(s => s.assetId === a.id) && !window.confirm('该素材正在使用，删除后相关画面将显示缺项。继续？')) return; update({ assets: project.assets.filter(x => x.id !== a.id) }); setFiles(f => { const n = new Map(f); n.delete(a.id); return n; }); }}>移除</button></li>)}</ul></section>
    </>}
    {tab === 'scenes' && <>
      <section className="studio-section"><h2>把策划交给 ChatGPT</h2><p>下载策划包，交给 ChatGPT 安排具体画面；把返回的 JSON 方案导入这里。无需 API Key。</p><div className="studio-actions"><button disabled={!project.sentences.length} onClick={() => downloadText(planningPacket(project), 'motion-planning.md')}>下载策划包</button><label className="studio-file-button">导入画面方案<input disabled={busy} type="file" accept=".json" onChange={readFile(async f => { const scenes = parseScenePlan(await f.text(), project); update({ scenes }); setSelected(scenes[0].id); setNotice(`已导入${scenes.length}个画面，检查缺项后即可预览。`); })} /></label><button onClick={addScene}>手动添加一幕</button></div></section>
      <div className="studio-scene-layout"><section className="studio-scene-list" aria-label="场景列表">{!project.scenes.length && <div className="studio-empty">还没有画面。导入 ChatGPT 方案，或先添加一幕试试。</div>}{project.scenes.map((s, i) => { const t = timed.find(t => t.id === s.id); return <button className={selected === s.id ? 'selected' : ''} key={s.id} onClick={() => { setSelected(s.id); if (t) seek(t.start); }}><span className="studio-scene-number">{String(i + 1).padStart(2, '0')}</span><span><strong>{s.title}</strong><small>{s.kind === 'info' ? '信息动画' : s.kind === 'image' ? '图片动画' : '录屏'} · {t ? `${formatTime(t.start)}—${formatTime(t.end)}` : '待绑定时间'}</small><small>{s.sentenceIds.join('、') || '未绑定句子'}</small></span></button>; })}</section>{scene && <SceneEditor project={project} scene={scene} onChange={sceneChange} onDelete={() => { update({ scenes: project.scenes.filter(s => s.id !== selected) }); setSelected(''); }} onDuplicate={() => { const copy = { ...scene, id: uid('scene'), title: `${scene.title}（副本）`, sentenceIds: [] }; update({ scenes: [...project.scenes, copy] }); setSelected(copy.id); }} />}</div>
    </>}
    {tab === 'export' && <>
      <section className="studio-section"><h2>成片设置</h2><div className="studio-fields"><label>画幅<select value={`${project.width}`} onChange={e => update(e.target.value === '1920' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 })}><option value="1920">横屏 16:9</option><option value="1080">竖屏 9:16</option></select></label><label className="studio-checkbox"><input type="checkbox" checked={project.captions} onChange={e => update({ captions: e.target.checked })} />显示旁白字幕</label></div></section>
      <section className="studio-section"><h2>导出前检查</h2><p>{errors.length ? `${errors.length}项需要处理` : '基础时间与素材检查通过；仍请完整试听预览。'}</p><ul className="studio-issues">{issues.slice(0, 30).map((issue, i) => <li key={i} className={issue.level}>{issue.message}</li>)}{issues.length > 30 && <li>另有{issues.length - 30}项，请先处理前面的缺项。</li>}</ul></section>
      <section className="studio-section"><h2>保存与交接</h2><p>项目包包含原始素材、句子时间和画面方案，方便继续编辑。渲染包另外包含 HyperFrames 页面。</p><div className="studio-actions"><button disabled={busy} onClick={() => void attempt(() => exportZip(false))}>下载项目包</button><button disabled={busy || errors.length > 0} onClick={() => void attempt(() => exportZip(true))}>下载渲染包</button></div></section>
      <section className="studio-section"><h2>云端导出 MP4 · 试验功能</h2><p>在 GitHub 的私有仓库运行 HyperFrames，本机不渲染。首次需要一个已添加 README 的私有仓库，以及可读写该仓库和工作流的 Token（在 Motion 设置中填写）。仓库内会保存素材历史，请勿使用公开仓库。</p><p>使用 GitHub Actions 标准运行器；请确认账户有免费额度，并关闭超额付费。每次提交一个任务，上限30分钟。这条新导出通道尚未完成真实云端验收。</p><label>私有渲染仓库名<input value={cloudRepo} onChange={e => setCloudRepo(e.target.value)} /></label><label className="studio-checkbox"><input type="checkbox" checked={cloudConsent} onChange={e => setCloudConsent(e.target.checked)} />允许把本项目素材上传至我的私有仓库，并确认仅使用免费额度</label><div className="studio-actions"><button className="primary" disabled={busy || errors.length > 0 || !cloudConsent} onClick={() => void attempt(cloudRender)}>提交云端渲染</button>{busy && abort.current && <button onClick={() => abort.current?.abort()}>停止等待</button>}</div>{cloudLink && <a href={cloudLink} target="_blank" rel="noreferrer">查看渲染任务</a>}</section>
    </>}
    </div><aside className="studio-preview-pane"><div className="studio-preview-heading"><h2>画面预览</h2><span>轻量预览 · 不渲染视频</span></div><div className="studio-preview" style={{ aspectRatio: `${project.width}/${project.height}` }}><iframe ref={frame} title="口播画面预览" sandbox="allow-scripts" srcDoc={html} onLoad={() => notifyFrame(time, playing)} /></div><div className="studio-playhead"><strong>{formatTime(time)}</strong><span>/ {formatTime(duration)}</span></div><input className="studio-scrubber" aria-label="预览时间" type="range" min="0" max={duration || 1} step="0.05" value={Math.min(time, duration || 1)} onChange={e => seek(Number(e.target.value))} />
    <audio ref={audio} controls preload="metadata" src={project.audioAssetId ? urls[project.audioAssetId] : undefined} onTimeUpdate={e => setTime(e.currentTarget.currentTime)} onPlay={() => setPlaying(true)} onPause={() => { setPlaying(false); setTime(audio.current?.currentTime ?? 0); }} onEnded={() => setPlaying(false)} onError={() => { if (project.audioAssetId) setNotice('旁白无法播放，请重新导入常见音频格式。'); }} />
    <p className="studio-hint">未分配画面的停顿会保持上一幕。录屏原声静音，旁白始终作为主音轨。当前未标时间的画面不会显示。</p><div className="studio-progress"><span>{project.sentences.length}句旁白</span><span>{project.scenes.length}个画面</span><span>{project.sentences.filter(s => s.start !== null && s.end !== null).length}句已标时间</span></div></aside></div>
  </div>;
};
