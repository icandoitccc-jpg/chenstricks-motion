import JSZip from 'jszip';

export async function readScriptFile(file: File): Promise<string> {
  if (file.size > 10 * 1024 ** 2) throw new Error('稿件请控制在10MB以内。');
  const ext = file.name.split('.').pop()?.toLowerCase(); let text = '';
  if (ext === 'pdf') {
    const pdfjs = await import('pdfjs-dist');
    const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false });
    const doc = await task.promise;
    try {
      if (doc.numPages > 100) throw new Error('稿件页数过多，请上传本期视频的终稿。');
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n); const content = await page.getTextContent();
        text += content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : '') : '').join('') + '\n';
        page.cleanup();
      }
    } finally { await doc.destroy(); }
  } else if (ext === 'docx') {
    const zip = await JSZip.loadAsync(file); const entry = zip.file('word/document.xml');
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })?._data?.uncompressedSize;
    if (!entry || !size || size > 2 * 1024 ** 2) throw new Error('无法读取该Word稿件。');
    const doc = new DOMParser().parseFromString(await entry.async('string'), 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Word稿件格式错误。');
    text = Array.from(doc.getElementsByTagNameNS('*', 'p')).map(p => Array.from(p.getElementsByTagNameNS('*', 't')).map(n=>n.textContent).join('')).join('\n');
  } else if (ext === 'txt' || ext === 'md') text = await file.text();
  else throw new Error('请上传PDF、Word（docx）或文字文件，也可以直接粘贴稿子。');
  text = text.trim();
  if (!text) throw new Error('没有读到文字。扫描图片PDF需要先转成文字稿。');
  if (text.length > 100000) throw new Error('稿件文字过多，请仅上传本期终稿。');
  return text;
}
