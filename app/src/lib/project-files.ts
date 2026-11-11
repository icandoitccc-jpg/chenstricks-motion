import JSZip from 'jszip';
import { assetPath, projectHtml } from './project-render';
import { parseProject, type Project, type MediaAsset } from './project';
export interface StoredProject { project: Project; files: [string, Blob][] }
const STORE = 'projects';
const MEDIA = 'media';
let lastSavedFiles = new Map<string, Blob>();
async function db() {
  return new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('motion-studio-v1', 2); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); if (!r.result.objectStoreNames.contains(MEDIA)) r.result.createObjectStore(MEDIA); }; r.onerror = () => reject(new Error('本机项目存储无法打开，请导出项目包备份。')); r.onsuccess = () => resolve(r.result); });
}
export async function saveProject(project: Project, files: Map<string, Blob>) {
  const d = await db(); try { await new Promise<void>((resolve, reject) => { const t = d.transaction([STORE, MEDIA], 'readwrite'); t.objectStore(STORE).put({ project }, 'current'); const media = t.objectStore(MEDIA); for (const [id, blob] of files) if (lastSavedFiles.get(id) !== blob) media.put(blob, id); for (const id of lastSavedFiles.keys()) if (!files.has(id)) media.delete(id); t.oncomplete = () => { lastSavedFiles = new Map(files); resolve(); }; t.onerror = () => reject(new Error('保存失败：空间不足或浏览器拒绝存储。请下载项目包。')); }); } finally { d.close(); }
}
export async function loadProject(): Promise<StoredProject | undefined> {
  const d = await db(); try { return await new Promise((resolve, reject) => { const t = d.transaction([STORE, MEDIA]); const r = t.objectStore(STORE).get('current'); const keys = t.objectStore(MEDIA).getAllKeys(); const blobs = t.objectStore(MEDIA).getAll(); t.oncomplete = () => { if (!r.result) { resolve(undefined); return; } const files: [string, Blob][] = r.result.files ?? keys.result.map((id, i) => [String(id), blobs.result[i]]); lastSavedFiles = r.result.files ? new Map() : new Map(files); resolve({ project: r.result.project, files }); }; t.onerror = () => reject(new Error('读取本机项目失败。')); }); } finally { d.close(); }
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
export async function projectZip(p: Project, files: Map<string, Blob>, render = false) {
  const zip = new JSZip(); zip.file('project.json', JSON.stringify(p, null, 2));
  const urls: Record<string,string> = {};
  for (const a of p.assets) { const f = files.get(a.id); if (f) { const path = assetPath(a.id, a.name); zip.file(path, f); urls[a.id] = path; } }
  if (render) { zip.file('index.html', projectHtml(p, urls)); zip.file('README.txt', '这是 Motion 的 HyperFrames 渲染包。音视频与稿件保留在此包中，请勿放入公开仓库。云端须安装 @hyperframes/cli@0.9.33、gsap@3.13.0，拷贝 gsap.min.js 到 lib/，并提供 assets/fonts/NotoSansSC.ttf 后执行 hyperframes render。'); }
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
  return `# Motion 画面策划包\n项目：${p.title}\nprojectId: ${p.id}\naudioRevision: ${p.audioRevision}\n\n请根据原意给出具体画面，不要求用户选择抽象结构。优先使用清单中的真实素材；未看到画面不能声称已选中合适素材。只允许 info/image/video；info模板只允许 focus/steps/comparison/list。图片动效仅 still/push/pan。comparison恰好两项items。每个场景绑定一组连续句子；每句必须且只能属于一个场景。不得猜时间，不得虚构素材ID。缺素材时用info或明确列待补项。返回纯JSON：{version:1,projectId,audioRevision,scenes:[{id,title,sentenceIds,kind,template,items,assetId,sourceIn,motion,focusX,focusY,leftLabel,rightLabel}]}。sourceIn是原录屏入点（秒），场景时长由句子时间决定。无需提供HTML、JS、坐标、代码或API key。返回文件应可直接导入，不用Markdown代码围栏。\n\n## 句子及实测时间\n${JSON.stringify(p.sentences, null, 2)}\n\n## 素材索引（只有元数据，图像内容需单独提供）\n${JSON.stringify(p.assets.filter(a=>a.kind!=='audio'), null, 2)}\n`;
}
