#!/usr/bin/env node
/**
 * 本地预览：构建 + 起一个静态服务器，浏览器打开 http://localhost:4173
 * 预览与云端渲染使用同一个组件、同一份 JSON、同一个字体文件。
 */
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import {buildPreview, OUT_DIR} from './preview-common.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};

await buildPreview();

const port = Number(process.env.PORT || 4173);
const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let filePath = path.join(OUT_DIR, path.normalize(urlPath).replace(/^([.][.][/\\])+/, ''));
  if (!filePath.startsWith(OUT_DIR)) {
    res.writeHead(403);
    return res.end('forbidden');
  }
  if (urlPath === '/' || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(OUT_DIR, 'index.html');
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {'content-type': MIME[ext] ?? 'application/octet-stream'});
  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`预览已启动: http://localhost:${port}`);
  console.log('按 Ctrl+C 退出');
});
