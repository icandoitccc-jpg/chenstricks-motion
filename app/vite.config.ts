import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 引擎源码在仓库根 src/，其 remotion/react 导入会向根 node_modules 解析，
// 与 app 自身的依赖形成两份实例（Player 上下文断裂、hooks 报错）。
// 统一强制解析到 app/node_modules，保证全图只有一份 remotion/react。
export default defineConfig({
  base: '/chenstricks-motion/',
  plugins: [react()],
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
