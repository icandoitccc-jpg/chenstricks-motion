import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

// 引擎源码在仓库根 src/，其 remotion/react 导入会向根 node_modules 解析，
// 与 app 自身的依赖形成两份实例（Player 上下文断裂、hooks 报错）。
// 统一强制解析到 app/node_modules，保证全图只有一份 remotion/react。
export default defineConfig({
  base: './',
  plugins: [react(), {
    name: 'local-pdf-resources',
    generateBundle() {
      this.emitFile({type:'asset',fileName:'motion-agent-skill.md',source:fs.readFileSync(path.resolve(__dirname,'../plugin/skills/plan-motion-video/SKILL.md'))});
      for (const dir of ['cmaps', 'standard_fonts']) {
        const root = path.resolve(__dirname, 'node_modules/pdfjs-dist', dir);
        for (const name of fs.readdirSync(root)) {
          const file = path.join(root, name);
          if (fs.statSync(file).isFile()) this.emitFile({type:'asset',fileName:`pdfjs/${dir}/${name}`,source:fs.readFileSync(file)});
        }
      }
    },
    configureServer(server) {
      server.middlewares.use((req,res,next) => {
        if(req.url==='/motion-agent-skill.md'){res.setHeader('Content-Type','text/markdown; charset=utf-8');res.end(fs.readFileSync(path.resolve(__dirname,'../plugin/skills/plan-motion-video/SKILL.md')));return;}
        const match = req.url?.match(/^\/pdfjs\/(cmaps|standard_fonts)\/([a-zA-Z0-9_.-]+)$/);
        if (!match) return next();
        const file = path.resolve(__dirname, 'node_modules/pdfjs-dist', match[1], match[2]);
        if (!fs.existsSync(file)) return next();
        res.setHeader('Content-Type','application/octet-stream');res.end(fs.readFileSync(file));
      });
    },
  }],
  resolve: {
    dedupe: ['react', 'react-dom', 'remotion', '@remotion/player'],
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      remotion: path.resolve(__dirname, 'node_modules/remotion'),
    },
  },
  server: {
    port: 4175,
    fs: { allow: ['..'] },
  },
});
