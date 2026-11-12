import React, { useEffect, useState } from 'react';
import { Home } from './pages/Home';
import { ImageMotion } from './pages/ImageMotion';
import { InfoMotion } from './pages/InfoMotion';
import { SettingsModal } from './components/SettingsModal';
import { Projects } from './pages/Projects';
import { NewProject } from './pages/NewProject';
import { Help } from './pages/Help';
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

  let projectId = '';
  try { projectId = hash.startsWith('#/project/') ? decodeURIComponent(hash.slice('#/project/'.length).split('?')[0]) : ''; } catch { /* Invalid URL opens project list instead of crashing. */ }
  const page = projectId ? 'studio' : hash === '#/new' ? 'new' : hash.startsWith('#/help') ? 'help' : hash.startsWith('#/tools') ? 'tools' : hash.startsWith('#/projects') ? 'projects' : hash.startsWith('#/studio') ? 'projects' : hash.startsWith('#/a') ? 'a' : hash.startsWith('#/b') ? 'b' : 'home';

  return (
    <div className="app-shell">
      <nav className="side-nav">
        <div className="brand">chenstricks <span>Motion</span></div>
        <a className={`nav-item ${page === 'home' ? 'active' : ''}`} href="#/">🏠 首页</a>
        <a className={`nav-item ${['projects','studio','new'].includes(page) ? 'active' : ''}`} href="#/projects">我的项目</a>
        <a className={`nav-item ${['tools','a','b'].includes(page) ? 'active' : ''}`} href="#/tools">素材工具</a>
        <a className={`nav-item ${page==='help' ? 'active' : ''}`} href="#/help">帮助与对接</a>
        <div style={{ flex: 1 }} />
        <a className="nav-item" href="#/" onClick={(e) => { e.preventDefault(); setShowSettings(true); }}>⚙️ 设置</a>
      </nav>
      <main className="main">
        {page === 'home' && <Home go={go} />}
        {page === 'projects' && <Projects go={go}/>}
        {page === 'new' && <NewProject go={go}/>}
        {page === 'studio' && <Studio key={projectId} projectId={projectId}/>}
        {page === 'help' && <Help/>}
        {page === 'tools' && <div className="studio"><a className="back-link" href="#/">← 返回首页</a><h1>素材工具</h1><div className="project-card-grid"><section className="project-card"><h2>图片局部动画</h2><button onClick={()=>go('#/a')}>打开</button></section><section className="project-card"><h2>文字图解动画</h2><button onClick={()=>go('#/b')}>打开</button></section></div></div>}
        {page === 'a' && <ImageMotion />}
        {page === 'b' && <InfoMotion />}
      </main>
      {showSettings && <SettingsModal githubOnly onClose={() => setShowSettings(false)} />}
    </div>
  );
};
