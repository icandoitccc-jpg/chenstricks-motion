export interface LayerKeyframe {at:number;x?:number;y?:number;scale?:number;opacity?:number;rotation?:number}
export interface ImageLayer {id:string;kind:'image'|'text';label:string;prompt?:string;assetId?:string;text?:string;x:number;y:number;width:number;height:number;fontSize:number;color:string;start:number;end:number;keyframes:LayerKeyframe[]}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('图片元素必须是对象。');return v as Record<string,unknown>;};
const finite=(v:unknown,min:number,max:number,label:string,fallback?:number)=>{if(v===undefined&&fallback!==undefined)return fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw new Error(label+'超出允许范围。');return v;};
export function parseImageLayers(value:unknown):ImageLayer[]{
 if(value===undefined)return [];if(!Array.isArray(value)||value.length>24)throw new Error('每幕最多24个图片或文字元素。');const ids=new Set<string>();
 return value.map(v=>{const l=object(v);if(typeof l.id!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(l.id)||ids.has(l.id))throw new Error('图片元素编号无效或重复。');ids.add(l.id);if(l.kind!=='image'&&l.kind!=='text')throw new Error('元素只支持image或text。');
  if(l.kind==='image'&&(typeof l.assetId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(l.assetId)))throw new Error('图片元素需要有效素材编号。');
  if(l.kind==='text'&&(typeof l.text!=='string'||!l.text.trim()||l.text.length>300))throw new Error('文字元素需要1—300字内容。');
  if(l.color!==undefined&&(typeof l.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(l.color)))throw new Error('文字颜色请用六位十六进制色值。');
  const start=finite(l.start,0,1,'出现位置',0),end=finite(l.end,0,1,'结束位置',1);if(end<=start)throw new Error('元素结束位置必须晚于出现位置。');
  const frames=l.keyframes??[];if(!Array.isArray(frames)||frames.length>12)throw new Error('每个元素最多12个动画节点。');let previous=-1;
  const keyframes=frames.map(v=>{const k=object(v),at=finite(k.at,0,1,'动画进度');if(at<=previous||at<start||at>end)throw new Error('动画节点必须递增且位于元素显示范围内。');previous=at;const result:LayerKeyframe={at};for(const [key,min,max] of [['x',-100,200],['y',-100,200],['scale',.05,5],['opacity',0,1],['rotation',-360,360]] as const)if(k[key]!==undefined)result[key]=finite(k[key],min,max,key);return result;});
  return {id:l.id,kind:l.kind,label:typeof l.label==='string'?l.label.slice(0,100):l.id,prompt:typeof l.prompt==='string'?l.prompt.slice(0,3000):undefined,assetId:l.kind==='image'?l.assetId as string:undefined,text:l.kind==='text'?l.text as string:undefined,x:finite(l.x,-100,200,'横向位置',50),y:finite(l.y,-100,200,'纵向位置',50),width:finite(l.width,1,100,'宽度',35),height:finite(l.height,1,100,'高度',25),fontSize:finite(l.fontSize,12,120,'字号',48),color:typeof l.color==='string'?l.color:'#252b2a',start,end,keyframes};
 });
}
/** Pure, seekable interpolation; serialized unchanged into preview and export. */
export function layerPose(layer:ImageLayer,progress:number){
 const base={x:layer.x,y:layer.y,scale:1,opacity:1,rotation:0};
 const frames=layer.keyframes;let before={at:layer.start,...base},after=before;
 for(const frame of frames){after={...before,...frame};if(progress<frame.at){const raw=Math.max(0,Math.min(1,(progress-before.at)/Math.max(.000001,frame.at-before.at))),u=raw*raw*(3-2*raw);return {visible:progress>=layer.start&&progress<=layer.end,x:before.x+(after.x-before.x)*u,y:before.y+(after.y-before.y)*u,scale:before.scale+(after.scale-before.scale)*u,opacity:before.opacity+(after.opacity-before.opacity)*u,rotation:before.rotation+(after.rotation-before.rotation)*u};}before=after;}
 return {...before,visible:progress>=layer.start&&progress<=layer.end};
}
export function sceneMediaIds(scene:{kind:string;assetId?:string;layers?:ImageLayer[]}){return [...new Set([...(scene.kind!=='info'&&scene.assetId?[scene.assetId]:[]),...(scene.kind==='image'?(scene.layers??[]).filter(l=>l.kind==='image').map(l=>l.assetId!):[])])];}
export function layerPreset(layer:ImageLayer,preset:string):LayerKeyframe[]{const a=layer.start,b=layer.end,d=b-a,t=a+d*.16;
 if(preset==='slide')return [{at:a,x:layer.x-18,opacity:0},{at:t,x:layer.x,opacity:1}];
 if(preset==='move')return [{at:a,x:layer.x,opacity:1},{at:b,x:Math.min(95,layer.x+25),opacity:1}];
 if(preset==='pulse')return [{at:a,scale:1},{at:a+d*.3,scale:1.12},{at:a+d*.6,scale:1},{at:b,scale:1}];
 if(preset==='zoom')return [{at:a,scale:.8,opacity:0},{at:t,scale:1,opacity:1},{at:b,scale:1.08,opacity:1}];
 return [{at:a,opacity:0},{at:t,opacity:1}];
}
