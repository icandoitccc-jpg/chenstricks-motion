/** Portable planning contract v1. Planning only: no inferred recording times. */
export function checkPortableContract(d: Record<string,unknown>): void {
  const obj=(x:unknown):Record<string,unknown>=>{if(!x||typeof x!=='object'||Array.isArray(x))throw new Error('总表条目必须是对象。');return x as Record<string,unknown>;};
  const id=(x:unknown)=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(x);
  if(d.version!==1)throw new Error('制作总表需要 version: 1。');
  if(!Array.isArray(d.assets)||d.assets.length>500)throw new Error('总表需要assets素材清单，无素材填空数组，最多500项。');
  if(!Array.isArray(d.sentences)||!d.sentences.length||d.sentences.length>5000)throw new Error('总表需要1—5000个原文单元。');
  const sentenceIds=new Map<string,number>();
  d.sentences.forEach((value,i)=>{const s=obj(value);if(!id(s.id)||sentenceIds.has(s.id as string)||typeof s.text!=='string'||!s.text.trim())throw new Error(`第${i+1}个原文单元需要唯一编号及非空原文。`);sentenceIds.set(s.id as string,i);});
  if(!Array.isArray(d.scenes)||!d.scenes.length||d.scenes.length>500)throw new Error('总表需要1—500个画面。');
  const sceneIds=new Set<string>();let next=0;
  d.scenes.forEach((value,i)=>{
    const s=obj(value),label=`第${i+1}幕`;
    if(!id(s.id)||sceneIds.has(s.id as string))throw new Error(`${label}编号无效或重复。`);sceneIds.add(s.id as string);
    if(typeof s.title!=='string'||!s.title.trim()||s.title.length>200)throw new Error(`${label}需要1—200字的画面标题。`);
    if(!['info','image','video'].includes(String(s.kind)))throw new Error(`${label}只支持info、image、video。`);
    if(!['focus','steps','comparison','list'].includes(String(s.template)))throw new Error(`${label}的图解模板尚未实现。`);
    if(!Array.isArray(s.sentenceIds)||!s.sentenceIds.length)throw new Error(`${label}需要绑定原文。`);
    for(const sid of s.sentenceIds){if(typeof sid!=='string'||sentenceIds.get(sid)!==next)throw new Error(`${label}的原文必须按全文顺序连续排列，不得遗漏、重复或倒序。`);next++;}
    if(!Array.isArray(s.items)||s.items.some(x=>typeof x!=='string'||!x.trim()))throw new Error(`${label}的items需要非空文字数组（录屏或图片可填空数组）。`);
    if(s.kind==='info'){
      if(s.items.length<1||s.items.length>6)throw new Error(`${label}文字图解需要1—6项内容，更多请拆幕。`);
      if(s.template==='comparison'&&s.items.length!==2)throw new Error(`${label}对比图必须恰好两项。`);
      if(s.template==='comparison'&&(typeof s.leftLabel!=='string'||!s.leftLabel.trim()||typeof s.rightLabel!=='string'||!s.rightLabel.trim()))throw new Error(`${label}对比图需要左右标签。`);
    }
    if(!['still','push','pan'].includes(String(s.motion)))throw new Error(`${label}图片动效只支持still、push、pan。`);
    if(typeof s.sourceIn!=='number'||!Number.isFinite(s.sourceIn)||s.sourceIn<0)throw new Error(`${label}素材入点必须为非负秒数，无素材填0。`);
    for(const key of ['focusX','focusY'])if(typeof s[key]!=='number'||!Number.isFinite(s[key])||(s[key] as number)<0||(s[key] as number)>100)throw new Error(`${label}的${key}必须在0—100之间。`);
  });
  if(next!==d.sentences.length)throw new Error('总表末尾仍有原文没有安排画面。');
}
