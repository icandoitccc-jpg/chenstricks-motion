import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

export const OUT_DIR = path.resolve('preview-dist');

export async function buildPreview() {
  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});

  await build({
    entryPoints: [path.resolve('preview', 'main.tsx')],
    bundle: true,
    format: 'iife',
    minify: true,
    outfile: path.join(OUT_DIR, 'bundle.js'),
    define: {'process.env.NODE_ENV': '"production"'},
    logLevel: 'info',
  });

  fs.cpSync(path.resolve('public'), OUT_DIR, {recursive: true});
  fs.copyFileSync(path.resolve('preview', 'index.html'), path.join(OUT_DIR, 'index.html'));
  console.log('preview-dist 构建完成');
}
