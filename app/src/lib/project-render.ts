import { compileScenes, type Project, type TimedScene } from './project';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const json = (x: unknown) => JSON.stringify(x).replace(/</g, '\\u003c');
export const assetPath = (id: string, name: string) => `assets/${id}.${name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'}`;

function graphics(sc: TimedScene) {
  const items = sc.items.map((s, i) => `<div class="item" data-item="${i}">${sc.template === 'steps' ? `<span class="number">${String(i + 1).padStart(2, '0')}</span>` : ''}${sc.template === 'comparison' ? `<div class="column-label">${esc(i === 0 ? sc.leftLabel : sc.rightLabel)}</div>` : ''}<div>${esc(s)}</div></div>`).join('');
  return `<div class="graphic ${sc.template}"><div class="blue-line"></div><h1>${esc(sc.title)}</h1><div class="items">${items}</div></div>`;
}

/** Same deterministic scene document for lightweight preview and HyperFrames export. */
export function projectHtml(p: Project, urls: Record<string, string>, preview = false): string {
  const scenes = compileScenes(p); const audio = p.assets.find(a => a.id === p.audioAssetId);
  const duration = audio?.duration ?? Math.max(1, ...scenes.map(s => s.end));
  const media = (id?: string) => esc(id ? urls[id] ?? '' : '');
  const sceneHtml = scenes.map((sc, i) => {
    const attrs = `id="${esc(sc.id)}" class="clip scene" data-start="${sc.start}" data-duration="${sc.end - sc.start}" data-track-index="1" style="z-index:${i + 1}"`;
    if (sc.kind === 'video') return `<video ${attrs} src="${media(sc.assetId)}" data-media-start="${sc.sourceIn}" muted playsinline preload="metadata"></video>`;
    if (sc.kind === 'image') return `<div ${attrs}><img class="picture" src="${media(sc.assetId)}" alt="${esc(sc.title)}" /></div>`;
    return `<div ${attrs} data-track-kind="graphics">${graphics(sc)}</div>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(p.title)}</title>
<style>
${preview ? '' : "@font-face{font-family:MotionChinese;src:url('assets/fonts/NotoSansSC.ttf')}"}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#f6f3ec;color:#252b2a;font-family:${preview ? "'PingFang SC','Microsoft YaHei'," : 'MotionChinese,'}sans-serif}
#main{position:absolute;left:0;top:0;width:${p.width}px;height:${p.height}px;transform-origin:top left;overflow:hidden}
.paper{position:absolute;inset:0;background:#f6f3ec}.scene{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;visibility:hidden;background:#f6f3ec;overflow:hidden}
.picture{width:100%;height:100%;object-fit:contain;transform-origin:center}.graphic{position:absolute;inset:10% 10% 17%;display:flex;flex-direction:column;justify-content:center;gap:42px}.blue-line{width:90px;height:9px;background:#3268ba;transform:rotate(-2deg)}h1{font-size:${p.width < p.height ? 72 : 80}px;line-height:1.25;margin:0;letter-spacing:-2px;overflow-wrap:anywhere}.items{display:flex;flex-direction:column;gap:25px}.item{font-size:${p.width < p.height ? 46 : 50}px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}.number{font-size:32px;color:#3268ba;margin-right:24px}.comparison .items{display:grid;grid-template-columns:1fr 1fr;gap:50px}.comparison .item{border-top:3px solid #c7c4ba;padding-top:28px}.comparison .item:last-child{border-color:#3268ba}.column-label{font-size:30px;color:#72766f;margin-bottom:18px}.focus .item{color:#3268ba;font-weight:600}.caption{position:absolute;z-index:10000;left:10%;right:10%;bottom:5%;text-align:center;font-size:${p.width < p.height ? 38 : 40}px;line-height:1.5;color:#fff;text-shadow:0 1px 3px #000;white-space:pre-wrap}.caption span{background:rgba(21,25,28,.82);padding:8px 18px;box-decoration-break:clone;-webkit-box-decoration-break:clone}
</style></head><body>
<div id="main" data-composition-id="main" data-start="0" data-duration="${duration}" data-width="${p.width}" data-height="${p.height}" data-fps="${p.fps}">
<div class="paper"></div>${sceneHtml}
${p.captions ? p.sentences.filter(s => s.start !== null && s.end !== null).map((s, i) => `<div id="caption-${i}" class="clip caption" data-start="${s.start}" data-duration="${s.end! - s.start!}" data-track-index="3" data-track-kind="captions"><span>${esc(s.text)}</span></div>`).join('') : ''}
${!preview && audio ? `<audio id="narration" class="clip" src="${media(audio.id)}" data-start="0" data-duration="${duration}" data-track-index="2" data-volume="1" preload="metadata"></audio>` : ''}
</div>
${preview ? '' : '<script src="lib/gsap.min.js"></script>'}
<script>
const scenes=${json(scenes)},sentences=${json(p.sentences)},isPreview=${preview};
function draw(t,playing){
 const active=scenes.find(s=>t>=s.start&&t<s.end)||scenes.filter(s=>s.start<=t).at(-1);
 for(const sc of scenes){const el=document.getElementById(sc.id);if(!el)continue;const on=!!active&&active.id===sc.id;el.style.visibility=on?'visible':'hidden';
  if(sc.kind==='video'&&isPreview){const desired=Math.min(Number.isFinite(el.duration)?Math.max(0,el.duration-.04):1e9,sc.sourceIn+Math.max(0,t-sc.start));if(on&&el.readyState>=1&&Math.abs(el.currentTime-desired)>.25)el.currentTime=desired;if(on&&playing)el.play().catch(()=>{});else el.pause();}
  if(!on)continue;const local=Math.max(0,t-sc.start),progress=Math.max(0,Math.min(1,local/Math.max(.1,sc.end-sc.start)));
  const img=el.querySelector('.picture');if(img){img.style.transformOrigin=sc.focusX+'% '+sc.focusY+'%';img.style.transform=sc.motion==='push'?'scale('+(1+.08*progress)+')':sc.motion==='pan'?'scale(1.08) translateX('+(-2+4*progress)+'%)':'none';}
  const title=el.querySelector('h1');if(title){title.style.opacity=String(Math.min(1,local/.35));title.style.transform='translateY('+(16*(1-Math.min(1,local/.35)))+'px)';}
  const items=el.querySelectorAll('.item');items.forEach((item,i)=>{const step=Math.max(.6,Math.min(2,(sc.end-sc.start-1)/Math.max(1,items.length)));const u=Math.max(0,Math.min(1,(local-.5-i*step)/.35));item.style.opacity=String(u);item.style.transform='translateY('+(18*(1-u))+'px)';});
 }
 document.querySelectorAll('.caption').forEach((el,i)=>{const s=sentences.filter(s=>s.start!==null&&s.end!==null)[i];el.style.visibility=s&&t>=s.start&&t<s.end?'visible':'hidden';});
}
${preview ? `function fit(){const root=document.getElementById('main');root.style.transform='scale('+Math.min(innerWidth/${p.width},innerHeight/${p.height})+')';}new ResizeObserver(fit).observe(document.body);fit();window.addEventListener('message',e=>{if(e.source===parent&&e.data?.type==='motion-preview')draw(e.data.time,e.data.playing);});` : `const tl=gsap.timeline({paused:true,onUpdate:()=>draw(tl.time(),false)});tl.to({}, {duration:${duration}});window.__timelines=window.__timelines||{};window.__timelines.main=tl;window.addEventListener('hf-seek',e=>draw(e.detail.time,false));`}
draw(0,false);
</script></body></html>`;
}
