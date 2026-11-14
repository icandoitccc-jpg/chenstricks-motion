export interface RoughCandidate {id:string;kind:'pause'|'retake';start:number;end:number;reason:string;text?:string;comparison?:string;comparisonStart?:number;selected?:boolean}
export interface RoughCue {id?:string;text:string;start:number;end:number;needsReview?:boolean}
export interface RoughAnalysis {version:1;audioSha256:string;duration:number;cues:RoughCue[];candidates:RoughCandidate[];scope:string}
export interface RoughState {sourceAssetId:string;analysis:RoughAnalysis;selectedIds:string[];draftAssetId?:string;draftSelection?:string[];runUrls?:string[];resultAnalysis?:RoughAnalysis;adopted?:boolean}
export function parseRoughAnalysis(value:unknown):RoughAnalysis{
 const a=value as RoughAnalysis;if(!a||a.version!==1||!/^[a-f0-9]{64}$/.test(a.audioSha256)||!Number.isFinite(a.duration)||a.duration<=0||!Array.isArray(a.cues)||!Array.isArray(a.candidates)||a.cues.length>10000||a.candidates.length>3000)throw new Error('音频分析结果格式无效。');
 const ids=new Set<string>();for(const c of a.candidates){if(!c||typeof c.id!=='string'||ids.has(c.id)||!['pause','retake'].includes(c.kind)||typeof c.reason!=='string'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||c.end>a.duration+.05)throw new Error('粗剪候选范围无效。');if(c.comparisonStart!==undefined&&(!Number.isFinite(c.comparisonStart)||c.comparisonStart<0||c.comparisonStart>a.duration))throw new Error('试听范围无效。');ids.add(c.id);}
 let last=0;for(const c of a.cues){if(typeof c.text!=='string'||!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<last||c.end<=c.start||c.end>a.duration+.1)throw new Error('识别字幕时间无效。');last=c.end;}
 return a;
}
export function roughIntervals(a:RoughAnalysis,selectedIds:string[]):[number,number][]{
 if(new Set(selectedIds).size!==selectedIds.length||selectedIds.some(id=>!a.candidates.some(c=>c.id===id)))throw new Error('粗剪选择无效。');
 const merged:[number,number][]=[];for(const c of a.candidates.filter(c=>selectedIds.includes(c.id)).sort((x,y)=>x.start-y.start)){const prev=merged.at(-1);if(prev&&c.start<=prev[1])prev[1]=Math.max(prev[1],c.end);else merged.push([c.start,c.end]);}
 if(a.duration-merged.reduce((n,[s,e])=>n+e-s,0)<.5)throw new Error('至少保留半秒录音。');return merged;
}
export const selectionSignature=(ids:string[])=>JSON.stringify([...ids].sort());
export const audioHash=async(blob:Blob)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
