import { type Project, type Sentence, type Scene } from './project';
export interface SyncRow { scene:Scene; text:string; spoken:string; start:number|null; end:number|null; coverage:number; review:boolean; skip:boolean; reason:string }
const normalized=(text:string)=>text.normalize('NFKC').toLowerCase().replace(/[⻔門]/g,'门').replace(/戶/g,'户').replace(/⻚/g,'页').replace(/[^\p{L}\p{N}]/gu,'');
/** Unique 8-character anchors, with bounded LCS between anchors. No invented timestamps. */
function matching(a:string,b:string):Map<number,number>{
 const result=new Map<number,number>(),candidates:{x:number;y:number}[]=[];
 const grams=new Map<string,number>();for(let j=0;j<=b.length-8;j++){const k=b.slice(j,j+8);grams.set(k,grams.has(k)?-1:j);}
 const own=new Map<string,number>();for(let i=0;i<=a.length-8;i++){const k=a.slice(i,i+8);own.set(k,own.has(k)?-1:i);}
 for(const [k,x] of own){const y=grams.get(k);if(x>=0&&y!==undefined&&y>=0)candidates.push({x,y});}
 // Longest increasing subsequence rejects out-of-order/repeated distant anchors.
 candidates.sort((u,v)=>u.x-v.x);const tails:number[]=[],prev=new Int32Array(candidates.length).fill(-1);
 for(let i=0;i<candidates.length;i++){let lo=0,hi=tails.length;while(lo<hi){const m=(lo+hi)>>1;if(candidates[tails[m]].y<candidates[i].y)lo=m+1;else hi=m;}if(lo)prev[i]=tails[lo-1];tails[lo]=i;}
 const chain:{x:number;y:number}[]=[];let pos=tails.at(-1)??-1;while(pos>=0){chain.push(candidates[pos]);pos=prev[pos];}chain.reverse();
 const anchors:{x:number;y:number}[]=[];let x=0,y=0;for(const p of chain){if(p.x>=x&&p.y>=y){anchors.push(p);x=p.x+8;y=p.y+8;}}
 const gap=(ax:number,ae:number,by:number,be:number)=>{const n=ae-ax,m=be-by;if(!n||!m||n*m>200000)return;const dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[ax+i]===b[by+j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);let i=0,j=0;while(i<n&&j<m){if(a[ax+i]===b[by+j]){result.set(ax+i,by+j);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}};
 x=0;y=0;for(const p of anchors){gap(x,p.x,y,p.y);for(let k=0;k<8;k++)result.set(p.x+k,p.y+k);x=p.x+8;y=p.y+8;}gap(x,a.length,y,b.length);return result;
}
export function suggestAudioSync(p:Project,cues:Sentence[]):SyncRow[]{
 if(!p.scenes.length)throw new Error('请先安排画面。');const duration=p.assets.find(a=>a.id===p.audioAssetId)?.duration;
 if(!duration)throw new Error('请先上传最终录音。');
 if(cues.length>5000)throw new Error('字幕条目过多。');let last=0;for(const c of cues){if(c.start===null||c.end===null||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<last||c.end<=c.start||c.end>duration+.05)throw new Error('字幕时间无效、重叠或超过当前录音。');last=c.end;}
 const texts=p.scenes.map(s=>s.sentenceIds.map(id=>p.sentences.find(v=>v.id===id)?.text??'').join(''));
 const expected=texts.map(normalized),actual=cues.map(c=>normalized(c.text));if(expected.join('').length>20000||actual.join('').length>20000)throw new Error('单次同步文字过长，请拆分项目。');
 const cueAt:number[]=[];actual.forEach((s,i)=>{for(let k=0;k<s.length;k++)cueAt.push(i);});const matches=matching(expected.join(''),actual.join(''));
 let offset=0;const counts=expected.map(t=>{const count=new Map<number,number>();for(let i=0;i<t.length;i++){const j=matches.get(offset+i);if(j!==undefined){const c=cueAt[j];count.set(c,(count.get(c)??0)+1);}}offset+=t.length;return count;});
 // Each timestamped subtitle belongs to at most one visual scene. Ties need review.
 const winners=new Map<number,number>(),ambiguous=new Set<number>();
 counts.forEach((cs,i)=>{for(const [c,n] of cs){const old=winners.get(c);if(old===undefined)winners.set(c,i);else{ambiguous.add(c);if(n>(counts[old].get(c)??0))winners.set(c,i);}}});
 const rows=p.scenes.map((scene,i)=>{const ids=[...counts[i].keys()].filter(c=>winners.get(c)===i).sort((a,b)=>a-b),coverage=[...counts[i].values()].reduce((a,b)=>a+b,0)/Math.max(1,expected[i].length);const review=!ids.length||coverage<.85||ids.some(c=>ambiguous.has(c));return {scene,text:texts[i],spoken:ids.map(c=>cues[c].text).join(' '),start:ids.length?cues[ids[0]].start:null,end:ids.length?cues[ids.at(-1)!].end:null,coverage,review,skip:false,reason:!ids.length?'没有找到可靠对应，可能未朗读或文字差异较大':ids.some(c=>ambiguous.has(c))?'一条字幕跨越多个画面，请核对边界':coverage<.85?'原文与录音字幕差异较大，请试听确认':'已找到对应字幕，仍建议试听'};});
 // Added whole passages need a visual decision, not silent gap filling.
 actual.forEach((text,c)=>{const matched=counts.reduce((n,cs)=>n+(cs.get(c)??0),0);if(text.length<8||matched/text.length>=.4)return;let owner=winners.get(c);if(owner===undefined){for(let j=c-1;j>=0;j--){const v=winners.get(j);if(v!==undefined){owner=v;break;}}if(owner===undefined)for(let j=c+1;j<cues.length;j++){const v=winners.get(j);if(v!==undefined){owner=v;break;}}}if(owner===undefined)return;const row=rows[owner];row.review=true;row.reason='录音有新增内容或识别差异较大的字幕，请确认画面是否仍适合';if(!row.spoken.includes(cues[c].text))row.spoken+=' '+cues[c].text;row.start=Math.min(row.start??Infinity,cues[c].start!);row.end=Math.max(row.end??0,cues[c].end!);});
 let boundary=0;for(const row of rows){if(row.start!==null&&row.end!==null){if(row.start<boundary){row.review=true;row.reason='候选时间与前一画面重叠，请核对';}boundary=Math.max(boundary,row.end);}}return rows;
}
export function applyAudioSync(p:Project,rows:SyncRow[],cues:Sentence[]):Project{
 if(rows.length!==p.scenes.length||rows.some((r,i)=>r.scene.id!==p.scenes[i].id||r.review))throw new Error('请先确认所有待检查画面。');
 const duration=p.assets.find(a=>a.id===p.audioAssetId)?.duration??0;let last=0;
 for(const r of rows){if(r.skip)continue;if(r.start===null||r.end===null||!Number.isFinite(r.start)||!Number.isFinite(r.end)||r.start<last||r.end<=r.start||r.end>duration+.05)throw new Error('画面时间无效、重叠或超过录音，请调整后采用。');last=r.end;}
 if(rows.every(r=>r.skip))throw new Error('至少保留一段实际朗读画面。');
 // Keep original full text and scenes; regroup anchors to visual tasks, never rewrite the draft.
 const sentences=rows.map((r,i)=>({id:`A${String(i+1).padStart(3,'0')}`,text:r.text,start:r.skip?null:r.start,end:r.skip?null:r.end,omitted:r.skip}));
 return {...p,sentences,scenes:p.scenes.map((s,i)=>({...s,sentenceIds:[sentences[i].id]})),transcript:{audioRevision:p.audioRevision,cues}};
}
