// Synthetic fixtures only; no personal scripts, recordings, or tokens.
const {chromium}=require(process.env.QA_MODULES+'/playwright');
const JSZip=require(process.env.QA_MODULES+'/jszip');const fs=require('node:fs');const assert=require('node:assert/strict');
const norm=s=>s.replace(/\s/g,'');
(async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);
 const errors=[],consoleErrors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});page.on('dialog',d=>d.accept());
 try {
 await page.goto('http://127.0.0.1:4187/#/');await page.getByRole('heading',{name:'最近项目',exact:true}).waitFor();await page.getByRole('heading',{name:'还没有项目',exact:true}).waitFor();
 assert.equal(await page.getByText('用你的录音，组织一条视频',{exact:true}).count(),0);
 await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('link',{name:'← 返回项目列表',exact:true}).click();await page.getByRole('heading',{name:'还没有项目',exact:true}).waitFor();
 await page.getByRole('button',{name:'新建项目',exact:true}).click();await page.getByRole('textbox',{name:'项目名称',exact:true}).fill('终稿恢复测试');
 const pdfPage=await browser.newPage();await pdfPage.setContent('<html lang="zh-CN"><body><p>这是第一句测试终稿。</p><p>这是第二句测试终稿。</p></body></html>');const pdf=await pdfPage.pdf();await pdfPage.close();
 await page.locator('input[accept=".pdf,.docx,.txt,.md"]').setInputFiles({name:'测试终稿.pdf',mimeType:'application/pdf',buffer:pdf});
 await page.waitForFunction(()=>document.querySelector('textarea[aria-label="最终稿"]')?.value.includes('这是第二句测试终稿。'));
 const text=await page.getByRole('textbox',{name:'最终稿',exact:true}).inputValue();assert.equal(norm(text),'这是第一句测试终稿。这是第二句测试终稿。');
 await page.getByRole('button',{name:'创建项目',exact:true}).click();await page.getByRole('heading',{name:'终稿恢复测试',exact:true}).waitFor();
 assert.equal(await page.locator('audio').count(),0);assert.equal(await page.getByText('原文与实际时间',{exact:true}).count(),0);assert.equal(await page.getByRole('textbox',{name:'最终稿',exact:true}).inputValue(),text.trim());
 await page.getByRole('link',{name:'← 返回项目列表',exact:true}).click();await page.getByRole('link',{name:'🏠 首页',exact:true}).click();await page.reload();
 await page.getByText('终稿已上传 · 尚未安排画面',{exact:true}).waitFor();assert.equal(await page.locator('.project-card').count(),1);await page.screenshot({path:'/tmp/qa-evidence/home.png',fullPage:true});
 await page.getByRole('button',{name:'继续制作',exact:true}).click();await page.getByRole('textbox',{name:'最终稿',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'最终稿',exact:true}).inputValue(),text.trim());
 assert.equal(norm(await page.locator('[aria-current="step"]').innerText()),'1终稿');await page.screenshot({path:'/tmp/qa-evidence/draft.png',fullPage:true});
 await page.getByRole('button',{name:'下一步：画面安排 →',exact:true}).click();await page.getByRole('heading',{name:'画面安排',exact:true}).waitFor();
 await page.getByRole('link',{name:'🏠 首页',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续制作',exact:true}).click();await page.getByRole('heading',{name:'画面安排',exact:true}).waitFor();
 assert.equal(await page.locator('audio').count(),0);assert.equal(norm(await page.locator('[aria-current="step"]').innerText()),'2画面安排');
 const id=decodeURIComponent(page.url().split('#/project/')[1]);
 const p=await page.evaluate(id=>new Promise((resolve,reject)=>{const r=indexedDB.open('motion-studio-v1',3);r.onsuccess=()=>{const d=r.result,t=d.transaction('catalog'),q=t.objectStore('catalog').get(id);t.oncomplete=()=>{resolve(q.result.project);d.close();};};r.onerror=reject;}),id);
 const scene={id:'test-scene',title:'测试画面',sentenceIds:p.sentences.map(s=>s.id),kind:'info',template:'list',items:['第一点','第二点'],sourceIn:0,motion:'still',focusX:50,focusY:50,leftLabel:'之前',rightLabel:'之后'};
 const plan={version:1,projectId:p.id,audioRevision:p.audioRevision,scriptRevision:p.scriptRevision,sentences:p.sentences,assets:[],scenes:[scene]};
 await page.locator('input[accept=".json"]').setInputFiles({name:'总表.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});await page.locator('.studio-shot').waitFor();assert.equal(await page.getByRole('button',{name:'生成本段 MP4',exact:true}).count(),0);
 await page.getByRole('button',{name:'下一步：录音 →',exact:true}).click();await page.getByRole('heading',{name:'录音',exact:true}).waitFor();assert.equal(await page.getByRole('textbox',{name:'最终稿',exact:true}).count(),0);
 await page.getByRole('link',{name:'🏠 首页',exact:true}).click();await page.reload();await page.getByRole('button',{name:'继续制作',exact:true}).click();await page.getByRole('heading',{name:'录音',exact:true}).waitFor();
 const wav=Buffer.alloc(44+16000*2*5);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40);
 await page.locator('input[accept="audio/*"]').setInputFiles({name:'测试录音.wav',mimeType:'audio/wav',buffer:wav});await page.getByText('录音已添加，等待同步',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'下一步：分段制作 →',exact:true}).isDisabled());
 await page.getByRole('button',{name:'1 终稿',exact:true}).click();await page.getByRole('textbox',{name:'最终稿',exact:true}).fill('修改后的新终稿。');await page.getByRole('button',{name:'保存终稿',exact:true}).click();await page.getByRole('button',{name:'下一步：画面安排 →',exact:true}).click();await page.getByText('还没有画面安排。',{exact:true}).waitFor();
 await page.locator('input[accept=".json"]').setInputFiles({name:'旧总表.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(plan))});await page.getByText('总表属于其他项目或旧录音，请用当前制作资料重新生成。',{exact:true}).waitFor();assert.equal(await page.locator('.studio-shot').count(),0);
 await page.getByRole('link',{name:'← 返回项目列表',exact:true}).click();await page.getByRole('button',{name:'新建项目',exact:true}).click();
 const z=new JSZip();z.file('word/document.xml','<w:document xmlns:w="urn:test"><w:body><w:p><w:r><w:t>Word测试稿。</w:t></w:r></w:p></w:body></w:document>');
 await page.locator('input[accept=".pdf,.docx,.txt,.md"]').setInputFiles({name:'Word测试.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await z.generateAsync({type:'nodebuffer'})});await page.waitForFunction(()=>document.querySelector('textarea')?.value==='Word测试稿。');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/qa-evidence/mobile.png',fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
 fs.writeFileSync('/tmp/qa-evidence/result.json',JSON.stringify({passed:true,pageErrors:errors,consoleErrors,tests:['cancel new creates no empty project','PDF text extraction','create without recording or plan','home progress survives reload','resume at draft without reupload','resume at plan','plan contains no render controls','resume at audio','recording does not fake automatic alignment','changed draft invalidates plan','old plan rejected','DOCX extraction','390px no horizontal overflow']},null,2));console.log('PASS: project-first workflow and resume checks');
 }catch(e){await page.screenshot({path:'/tmp/qa-evidence/failure.png',fullPage:true}).catch(()=>{});fs.writeFileSync('/tmp/qa-evidence/failure.txt',String(e)+'\n\n'+await page.locator('body').innerText());throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
