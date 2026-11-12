import JSZip from 'jszip';
import { getPat } from './github';

// User media are only sent to a verified PRIVATE repository, never the public site repository.
const workflow = `name: Motion project render
on:
  push:
    paths: ['inputs/*.zip']
permissions:
  contents: read
jobs:
  render:
    runs-on: ubuntu-24.04
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 1
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install renderer (no AI calls)
        run: |
          sudo apt-get update -qq
          sudo apt-get install -y ffmpeg fonts-noto-cjk
          npm install --no-audit --no-fund hyperframes@0.9.33 gsap@3.13.0
      - name: Prepare project
        run: |
          mkdir -p render/lib render/assets/fonts
          python3 - <<'PY'
          import pathlib, zipfile
          paths = list(pathlib.Path('inputs').glob('*.zip'))
          if len(paths) != 1:
              raise SystemExit('Expected exactly one project ZIP')
          with zipfile.ZipFile(paths[0]) as z:
              total = 0
              for item in z.infolist():
                  dest = (pathlib.Path('render') / item.filename).resolve()
                  if not dest.is_relative_to(pathlib.Path('render').resolve()):
                      raise SystemExit('Unsafe archive path')
                  total += item.file_size
                  if total > 120 * 1024 * 1024:
                      raise SystemExit('Archive too large')
              z.extractall('render')
          range_file = pathlib.Path('render/audio-range.json')
          if range_file.exists():
              import json, math, subprocess
              r = json.loads(range_file.read_text())
              root = pathlib.Path('render').resolve()
              source = (root / r['source']).resolve()
              if not source.is_relative_to(root) or not source.is_file():
                  raise SystemExit('Invalid audio range source')
              start, duration = float(r['start']), float(r['duration'])
              if not math.isfinite(start) or not math.isfinite(duration) or start < 0 or duration <= 0:
                  raise SystemExit('Invalid audio range')
              subprocess.run(['ffmpeg', '-v', 'error', '-i', str(source), '-ss', str(start), '-t', str(duration), '-vn', '-c:a', 'pcm_s16le', '-y', str(root / 'assets/segment-audio.wav')], check=True)
          PY
          cp node_modules/gsap/dist/gsap.min.js render/lib/
          curl --fail --location --retry 2 --max-time 90 -o render/assets/fonts/NotoSansSC.ttf 'https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/Variable/TTF/Subset/NotoSansSC-VF.ttf'
      - name: Render MP4
        working-directory: render
        env:
          DO_NOT_TRACK: '1'
        run: |
          ../node_modules/.bin/hyperframes render --quality draft -o motion.mp4
          ffprobe -v error -show_entries format=duration -of default=nw=1 motion.mp4
      - uses: actions/upload-artifact@v4
        with:
          name: motion-video
          path: render/motion.mp4
          retention-days: 1
`;

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const pat = getPat(); if (!pat) throw new Error('请先在 Motion 设置中填写 GitHub Token。');
  const r = await fetch(`https://api.github.com${path}`, { method, headers: { Authorization: `Bearer ${pat}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`GitHub ${r.status}：${r.status === 404 ? '仓库不存在，或 Token 没有访问权限。' : r.status === 403 ? '权限不足或 Actions 额度受限。' : '请求未成功，请检查 Token 权限和网络。'}`);
  const text = await r.text(); return (text ? JSON.parse(text) : undefined) as T;
}
const b64 = (text: string) => { const bytes = new TextEncoder().encode(text); let s = ''; for (const byte of bytes) s += String.fromCharCode(byte); return btoa(s); };
const asBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(new Error('读取渲染包失败。')); r.readAsDataURL(blob); });

export async function renderProjectCloud(zip: Blob, repoName: string, onProgress: (s: string) => void, signal: AbortSignal): Promise<{ blob: Blob; runUrl: string }> {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(repoName)) throw new Error('请填写单独的私有渲染仓库名。');
  if (zip.size > 80 * 1024 ** 2) throw new Error('云端首版渲染包限80MB，请减少未使用素材。');
  onProgress('检查私有仓库…'); const user = await api<{ login: string }>('/user'); const repo = `/repos/${user.login}/${repoName}`;
  // Do not silently create repositories or change existing visibility.
  const meta = await api<{ private: boolean; default_branch: string }>(repo);
  if (!meta.private) throw new Error('已阻止上传：此仓库是公开的。请在 GitHub 创建私有仓库（勾选添加 README），再填写仓库名。');
  if (signal.aborted) throw new Error('已取消。');
  const branch = meta.default_branch;
  const workflowPath = `${repo}/contents/.github/workflows/motion-project.yml`;
  let current: { sha: string; content: string } | undefined;
  try { current = await api(workflowPath); } catch (e) { if (!(e as Error).message.includes('404')) throw e; }
  if (!current || atob(current.content.replace(/\s/g, '')) !== workflow) {
    onProgress('安装免费渲染流程…');
    await api(workflowPath, 'PUT', { message: 'chore: set up Motion private renderer', content: b64(workflow), sha: current?.sha, branch });
  }
  const head = await api<{ object: { sha: string } }>(`${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  const base = await api<{ tree: { sha: string } }>(`${repo}/git/commits/${head.object.sha}`);
  const tree = await api<{ tree: { path: string; type: string }[] }>(`${repo}/git/trees/${base.tree.sha}?recursive=1`);
  if (signal.aborted) throw new Error('已取消。');
  onProgress('上传至私有渲染仓库…'); const blob = await api<{ sha: string }>(`${repo}/git/blobs`, 'POST', { content: await asBase64(zip), encoding: 'base64' });
  if (signal.aborted) throw new Error('已取消。');
  const jobId = crypto.randomUUID(); const path = `inputs/${jobId}.zip`;
  const remove = tree.tree.filter(t => t.type === 'blob' && t.path.startsWith('inputs/') && t.path.endsWith('.zip')).map(t => ({ path: t.path, mode: '100644', type: 'blob', sha: null }));
  const newTree = await api<{ sha: string }>(`${repo}/git/trees`, 'POST', { base_tree: base.tree.sha, tree: [...remove, { path, mode: '100644', type: 'blob', sha: blob.sha }] });
  const commit = await api<{ sha: string }>(`${repo}/git/commits`, 'POST', { message: `render: ${jobId}`, tree: newTree.sha, parents: [head.object.sha] });
  await api(`${repo}/git/refs/heads/${encodeURIComponent(branch)}`, 'PATCH', { sha: commit.sha, force: false });
  const runUrl = `https://github.com/${user.login}/${repoName}/actions`;
  const deadline = Date.now() + 32 * 60 * 1000;
  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error(`已停止等待；云端任务可能仍在运行，请到 ${runUrl} 手动取消。`);
    const d = await api<{ workflow_runs: { id: number; head_sha: string; status: string; conclusion: string | null; html_url: string }[] }>(`${repo}/actions/workflows/motion-project.yml/runs?per_page=10`);
    const run = d.workflow_runs.find(r => r.head_sha === commit.sha);
    onProgress(run?.status === 'in_progress' ? '云端渲染中，本机不参与渲染…' : '等待 GitHub Actions 启动…');
    if (run?.status === 'completed') {
      if (run.conclusion !== 'success') throw new Error(`云端任务未成功（${run.conclusion}），查看：${run.html_url}`);
      const data = await api<{ artifacts: { id: number; name: string; expired: boolean }[] }>(`${repo}/actions/runs/${run.id}/artifacts`); const art = data.artifacts.find(a => a.name === 'motion-video' && !a.expired);
      if (!art) throw new Error(`任务结束但未找到 MP4：${run.html_url}`);
      onProgress('读取成片用于页面播放，不自动下载…');
      const r = await fetch(`https://api.github.com${repo}/actions/artifacts/${art.id}/zip`, { headers: { Authorization: `Bearer ${getPat()}`, Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error(`浏览器未能下载产物，请从任务页面下载：${run.html_url}`);
      const z = await JSZip.loadAsync(await r.arrayBuffer()); const f = Object.values(z.files).find(f => f.name.endsWith('.mp4'));
      if (!f) throw new Error('产物中缺少 MP4。'); const blob = await f.async('blob'); return { blob: blob.slice(0, blob.size, 'video/mp4'), runUrl: run.html_url };
    }
    await new Promise<void>((resolve) => { const done = () => { clearTimeout(id); signal.removeEventListener('abort', done); resolve(); }; const id = setTimeout(done, 10000); signal.addEventListener('abort', done, { once: true }); });
  }
  throw new Error(`等待超时，请查看云端任务：${runUrl}`);
}
