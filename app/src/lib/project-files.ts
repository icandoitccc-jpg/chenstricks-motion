import JSZip from 'jszip';
import { assetPath, projectHtml } from './project-render';
import { parseProject, type Project, type MediaAsset } from './project';
export interface StoredProject { project: Project; files: [string, Blob][] }
const STORE = 'projects';
const MEDIA = 'media';
const savedFiles = new Map<string, Map<string, Blob>>();
export interface ProjectEntry { project: Project; updatedAt: number; cacheMedia: boolean }
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open('motion-studio-v1', 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
      if (!d.objectStoreNames.contains(MEDIA)) d.createObjectStore(MEDIA);
      if (!d.objectStoreNames.contains('catalog')) d.createObjectStore('catalog');
      if (!d.objectStoreNames.contains('project-media')) d.createObjectStore('project-media');
    };
    r.onerror = () => reject(new Error('项目保存无法打开。'));
    r.onsuccess = () => resolve(r.result);
  });
}
function done(t: IDBTransaction) {
  return new Promise<void>((resolve, reject) => { t.oncomplete = () => resolve(); t.onabort = t.onerror = () => reject(new Error('保存失败：空间不足或浏览器拒绝存储。')); });
}
export async function saveProject(project: Project, files: Map<string, Blob>, cacheMedia = false) {
  const d = await db(); try {
    const t = d.transaction(['catalog', 'project-media'], 'readwrite');
    t.objectStore('catalog').put({ project, updatedAt: Date.now(), cacheMedia }, project.id);
    // Media are stored under the owning project, never shared across unrelated projects.
    const media = t.objectStore('project-media'); const keys = media.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) if (String(key).startsWith(project.id + ':') && (!cacheMedia || !files.has(String(key).slice(project.id.length + 1)))) media.delete(key);
      if (cacheMedia) for (const [id, blob] of files) if (savedFiles.get(project.id)?.get(id) !== blob) media.put(blob, project.id + ':' + id);
    };
    await done(t); savedFiles.set(project.id, cacheMedia ? new Map(files) : new Map());
  } finally { d.close(); }
}
export async function listProjects(): Promise<ProjectEntry[]> {
  const d = await db(); try {
    const t = d.transaction('catalog'); const r = t.objectStore('catalog').getAll(); await done(t);
    return r.result.sort((a: ProjectEntry, b: ProjectEntry) => b.updatedAt - a.updatedAt);
  } finally { d.close(); }
}
export async function deleteProject(id: string) {
  const d = await db(); try {
    const t = d.transaction(['catalog', 'project-media'], 'readwrite'); t.objectStore('catalog').delete(id); savedFiles.delete(id);
    const media = t.objectStore('project-media'); const keys = media.getAllKeys();
    keys.onsuccess = () => { for (const key of keys.result) if (String(key).startsWith(id + ':')) media.delete(key); };
    await done(t);
  } finally { d.close(); }
}
export async function loadProject(id?: string): Promise<(StoredProject & { cacheMedia?: boolean }) | undefined> {
  const d = await db(); let legacy: StoredProject | undefined;
  try {
    const t = d.transaction('catalog');
    const r = id ? t.objectStore('catalog').get(id) : t.objectStore('catalog').getAll(); await done(t);
    const entry: ProjectEntry | undefined = id ? r.result : r.result.sort((a: ProjectEntry,b: ProjectEntry)=>b.updatedAt-a.updatedAt)[0];
    if (entry) {
      const t = d.transaction('project-media'); const media = t.objectStore('project-media');
      const range = IDBKeyRange.bound(entry.project.id + ':', entry.project.id + ':\uffff');
      const keys = media.getAllKeys(range); const blobs = media.getAll(range); await done(t);
      const files: [string, Blob][] = keys.result.map((key,i)=>[String(key).slice(entry.project.id.length + 1), blobs.result[i]]);
      savedFiles.set(entry.project.id, new Map(files));
      return { project: entry.project, cacheMedia: entry.cacheMedia, files };
    }
    if (!id) {
      const t = d.transaction([STORE, MEDIA]); const old = t.objectStore(STORE).get('current');
      const oldKeys = t.objectStore(MEDIA).getAllKeys(); const oldBlobs = t.objectStore(MEDIA).getAll(); await done(t);
      if (old.result) legacy = { project: old.result.project, files: old.result.files ?? oldKeys.result.map((key,i) => [String(key), oldBlobs.result[i]]) };
    }
  } finally { d.close(); }
  if (legacy) {
    await saveProject(legacy.project, new Map(legacy.files), true);
    const d = await db(); try { const t = d.transaction([STORE, MEDIA], 'readwrite'); t.objectStore(STORE).delete('current'); t.objectStore(MEDIA).clear(); await done(t); } finally { d.close(); }
    return { ...legacy, cacheMedia: true };
  }
  return undefined;
}
export async function mediaMetadata(file: File): Promise<Omit<MediaAsset, 'id'>> {
  const kind = file.type.startsWith('audio/') ? 'audio' : file.type.startsWith('video/') ? 'video' : file.type.startsWith('image/') ? 'image' : null;
  if (!kind || (kind === 'image' && !['image/png','image/jpeg','image/webp'].includes(file.type))) throw new Error('只支持音频、视频和 PNG / JPG / WebP 图片。');
  if (file.size > 40 * 1024 ** 2) throw new Error('首版每个素材限40MB，请选用短录屏或压缩副本。');
  if (kind === 'image') return { kind, name: file.name, size: file.size, mime: file.type };
  const duration = await new Promise<number>((resolve, reject) => {
    const el = document.createElement(kind); const url = URL.createObjectURL(file);
    const finish = () => { el.removeAttribute('src'); el.load(); URL.revokeObjectURL(url); };
    const timer = window.setTimeout(() => { finish(); reject(new Error('读取素材时长超时。')); }, 15000);
    el.preload = 'metadata'; el.onloadedmetadata = () => { const n = el.duration; clearTimeout(timer); finish(); Number.isFinite(n) && n > 0 ? resolve(n) : reject(new Error('无法读取时长，请换用常见音视频格式。')); };
    el.onerror = () => { clearTimeout(timer); finish(); reject(new Error('浏览器无法读取该音视频，请使用 MP3 / WAV / M4A 或 H.264 MP4。')); }; el.src = url;
  }); return { kind, name: file.name, size: file.size, mime: file.type, duration };
}
export async function projectZip(p: Project, files: Map<string, Blob>, render = false, audioRange?: { start: number; duration: number }) {
  const zip = new JSZip(); zip.file('project.json', JSON.stringify(p, null, 2));
  const urls: Record<string,string> = {};
  for (const a of p.assets) { const f = files.get(a.id); if (f) { const path = assetPath(a.id, a.name); zip.file(path, f); urls[a.id] = path; } }
  if (audioRange) { const source = urls[p.audioAssetId!]; if (!source) throw new Error('本段缺录音文件。'); zip.file('audio-range.json', JSON.stringify({ source, ...audioRange })); urls[p.audioAssetId!] = 'assets/segment-audio.wav'; }
  if (render) { zip.file('index.html', projectHtml(p, urls)); zip.file('README.txt', '这是 Motion 的 HyperFrames 渲染包。音视频与稿件保留在此包中，请勿放入公开仓库。云端须安装 hyperframes@0.9.33、gsap@3.13.0，拷贝 gsap.min.js 到 lib/，并提供 assets/fonts/NotoSansSC.ttf 后执行 hyperframes render。'); }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}
export async function readProjectZip(file: File): Promise<StoredProject> {
  if (file.size > 120 * 1024 ** 2) throw new Error('项目包超过120MB，首版请拆成较小项目。');
  const zip = await JSZip.loadAsync(file); const entry = zip.file('project.json'); if (!entry) throw new Error('项目包中缺少 project.json。');
  const jsonSize = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? Infinity;
  if (jsonSize > 2 * 1024 ** 2) throw new Error('项目描述文件过大。');
  const p = parseProject(await entry.async('string')); const files: [string, Blob][] = []; let total = 0;
  for (const a of p.assets) { const f = zip.file(assetPath(a.id, a.name)); if (f) { const size = (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0; total += size; if (size > 40 * 1024 ** 2 || total > 100 * 1024 ** 2) throw new Error('解压素材超过首版限制。'); const b = await f.async('blob'); if (b.size > 40 * 1024 ** 2) throw new Error('单项素材过大。'); files.push([a.id, b.slice(0, b.size, a.mime)]); } }
  return { project: p, files };
}
export function planningPacket(p: Project) {
  return `# Motion 视频制作资料
这是给ChatGPT的输入。请返回一份可直接导入的视频制作总表JSON，不要另造格式。
projectId: ${p.id}
audioRevision: ${p.audioRevision}
录音时长（秒）: ${p.assets.find(a=>a.id===p.audioAssetId)?.duration ?? '未导入'}
请保留projectId/audioRevision。用户若未提供最终稿，请先索取稿子；此资料不包含录音文件。只有听过录音或已有真实时间字幕，才填写时间，否则start/end都用null，明确要求补充实测时间，严禁根据字数估算。
总表结构：{version:1,projectId,audioRevision,sentences:[{id,text,start,end}],assets:[{id,name,kind}],scenes:[{id,title,sentenceIds,kind,template,items,assetId,sourceIn,motion,focusX,focusY,leftLabel,rightLabel}]}
sentences每句唯一id、原文text、实际秒数start/end或都null。每句必须且只能安排一个画面，每个画面绑定一组连续句子。保留已有ID和实测时间。
scenes.kind只允许info/image/video；info模板仅focus/steps/comparison/list，comparison必须恰好两项items，每幕不超过6项。图片动效仅still/push/pan（整图轻推/平移，不是图片局部动画工具）。sourceIn是录屏原文件入点秒数，场景长度由句子时间决定。
assets只列图片/录屏，kind仅image/video，id与name必须唯一，name是不带路径的文件名。已有素材保持ID；待录屏可指定待补文件名和新ID。image/video画面的assetId必须出现在清单中。缺文件明确列待补，不能声称已自动获取。图像内容没看到时不能声称已选到合适画面。
优先真实案例和录屏；其余用具体文字图解。Motion内没有AI，不支持任意HTML/JS、自动录屏或生成视频。不要给未实现的模板和动效。返回纯JSON文件，不要代码围栏。
## 原文和已有实测时间（null=未对齐）
${JSON.stringify(p.sentences,null,2)}
## 素材索引（只有元数据，不含图像）
${JSON.stringify(p.assets.filter(a=>a.kind!=='audio'),null,2)}
`;
}
