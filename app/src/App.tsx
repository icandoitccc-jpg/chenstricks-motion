import React, { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { ImageMotion } from './pages/ImageMotion';
import { InfoMotion } from './pages/InfoMotion';
import { SettingsModal } from './components/SettingsModal';
import { Studio } from './pages/Studio';

function useHashRoute(): [string, (p: string) => void] {
  const [hash, setHash] = useState(window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: string) => { window.location.hash = p; };
  return [hash, go];
}

export const App: React.FC = () => {
  const [hash, go] = useHashRoute();
  const [showSettings, setShowSettings] = useState(false);

  const page = hash.startsWith('#/studio') ? 'studio' : hash.startsWith('#/a') ? 'a' : hash.startsWith('#/b') ? 'b' : 'home';

  return (
    <div className="app-shell">
      <nav className="side-nav">
        <div className="brand">chenstricks <span>Motion</span></div>
        <a className={`nav-item ${page === 'home' ? 'active' : ''}`} href="#/">🏠 首页</a>
        <div className="nav-group">完整视频</div><a className={`nav-item ${page === 'studio' ? 'active' : ''}`} href="#/studio">视频制作</a>
        <div className="nav-group">画面片段工具</div><a className={`nav-item ${page === 'a' ? 'active' : ''}`} href="#/a">🖼️ 图片局部动画</a>
        <a className={`nav-item ${page === 'b' ? 'active' : ''}`} href="#/b">💡 文字图解动画</a>
        <div style={{ flex: 1 }} />
        <a className="nav-item" href="#/" onClick={(e) => { e.preventDefault(); setShowSettings(true); }}>⚙️ 设置</a>
      </nav>
      <main className="main">
        {page === 'home' && <Home go={go} />}
        {page === 'studio' && <Studio />}
        {page === 'a' && <ImageMotion />}
        {page === 'b' && <InfoMotion />}
      </main>
      {showSettings && <SettingsModal githubOnly onClose={() => setShowSettings(false)} />}
    </div>
  );
};
