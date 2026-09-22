// GitHub 通道：PAT 存储（仅 localStorage）、workflow_dispatch、轮询、产物下载、上传素材清理。
// 素材即用即删：渲染成功后自动删除仓库里的上传文件；产物保留 2 天由 Actions 自动过期。
import JSZip from 'jszip';

const REPO = 'icandoitccc-jpg/chenstricks-motion';
const API = `https://api.github.com/repos/${REPO}`;
const KEY_PAT = 'cm.githubPat';

export function getPat(): string {
  return localStorage.getItem(KEY_PAT) ?? '';
}
export function setPat(pat: string) {
  localStorage.setItem(KEY_PAT, pat.trim());
}

async function gh<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const pat = getPat();
  if (!pat) throw new Error('未设置 GitHub Token（点右上角「设置」）');
  const r = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `token ${pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GitHub API ${r.status}: ${t.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}

export async function verifyPat(): Promise<string> {
  const pat = getPat();
  if (!pat) throw new Error('未设置 GitHub Token');
  const r = await fetch('https://api.github.com/user', {
    headers: { Authorization: `token ${pat}`, Accept: 'application/vnd.github+json' },
  });
  if (!r.ok) throw new Error(`Token 无效（HTTP ${r.status}）`);
  const d = (await r.json()) as { login: string };
  return d.login;
}

// ---------- 上传图片素材（渲染完成后须 deleteUpload） ----------
export async function uploadAsset(dataUrl: string): Promise<{ path: string; sha: string }> {
  const base64 = dataUrl.split(',')[1];
  const ext = dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png';
  const p = `public/uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  await gh('PUT', `/contents/${p}`, { message: 'upload: 临时渲染素材（用后自动删除）', content: base64 });
  const meta = await gh<{ sha: string }>('GET', `/contents/${p}`);
  return { path: p.replace(/^public\//, ''), sha: meta.sha };
}

export async function deleteUpload(publicRelativePath: string): Promise<void> {
  try {
    const meta = await gh<{ sha: string }>('GET', `/contents/public/${publicRelativePath}`);
    await gh('DELETE', `/contents/public/${publicRelativePath}`, { message: 'cleanup: 删除临时渲染素材', sha: meta.sha });
  } catch {
    /* 清理失败不阻断；定时任务会兜底 */
  }
}

// ---------- 触发渲染 ----------
export async function dispatchRender(specJson: string): Promise<number> {
  const t0 = Date.now();
  await gh('POST', '/actions/workflows/render.yml/dispatches', {
    ref: 'main',
    inputs: { specJson },
  });
  return t0;
}

interface Run { id: number; status: string; conclusion: string | null; created_at: string; event: string }
interface Artifact { id: number; name: string; size_in_bytes: number; expired: boolean }

// 轮询直到找到 t0 之后触发的 dispatch run 并完成（最长 25 分钟）
export async function waitForRun(t0: number, onTick?: (msg: string) => void): Promise<{ runId: number; conclusion: string }> {
  const deadline = Date.now() + 25 * 60 * 1000;
  let seenId = 0;
  for (;;) {
    const d = await gh<{ workflow_runs: Run[] }>('GET', '/actions/runs?per_page=10&event=workflow_dispatch');
    const run = d.workflow_runs
      .filter((r) => new Date(r.created_at).getTime() >= t0 - 60_000)
      .sort((a, b) => b.id - a.id)[0];
    if (run) {
      seenId = run.id;
      onTick?.(run.status === 'completed' ? '渲染完成' : run.status === 'in_progress' ? '云端渲染中…' : '排队中…');
      if (run.status === 'completed') {
        return { runId: run.id, conclusion: run.conclusion ?? 'unknown' };
      }
    } else {
      onTick?.('等待云端任务启动…');
    }
    if (Date.now() > deadline) throw new Error(seenId ? '渲染超时（25分钟），请到 GitHub Actions 查看' : '未找到云端任务，请检查 Actions 是否启用');
    await new Promise((r) => setTimeout(r, 10_000));
  }
}

// ---------- 下载 MP4 ----------
export async function downloadMp4(runId: number): Promise<{ blob: Blob; name: string }> {
  const d = await gh<{ artifacts: Artifact[] }>('GET', `/actions/runs/${runId}/artifacts`);
  const art = d.artifacts.find((a) => !a.expired);
  if (!art) throw new Error('产物不存在或已过期');
  const pat = getPat();
  const r = await fetch(`${API}/actions/artifacts/${art.id}/zip`, {
    headers: { Authorization: `token ${pat}` },
  });
  if (!r.ok) throw new Error(`下载产物失败: HTTP ${r.status}`);
  const zip = await JSZip.loadAsync(await r.arrayBuffer());
  const mp4Entry = Object.values(zip.files).find((f) => f.name.endsWith('.mp4'));
  if (!mp4Entry) throw new Error('产物中没有 MP4');
  const buf = await mp4Entry.async('blob');
  return { blob: buf, name: mp4Entry.name.split('/').pop() ?? 'motion.mp4' };
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
