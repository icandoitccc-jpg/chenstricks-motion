// 设置：GitHub Token（云端渲染通道）+ AI Key（功能B导演，可选）
import React, { useState } from 'react';
import { getPat, setPat, verifyPat } from '../lib/github';
import { getLlmConfig, setLlmConfig } from '../lib/director';

export const SettingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [pat, setPatV] = useState(getPat());
  const llm = getLlmConfig();
  const [apiKey, setApiKey] = useState(llm.apiKey);
  const [baseUrl, setBaseUrl] = useState(llm.baseUrl);
  const [model, setModel] = useState(llm.model);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setPatV(pat.trim());
    setPat(pat);
    setLlmConfig(apiKey, baseUrl, model);
    if (pat.trim()) {
      try {
        const login = await verifyPat();
        setMsg(`✓ GitHub Token 有效（${login}）。设置已保存。`);
      } catch (e) {
        setMsg(`⚠️ ${(e as Error).message}（已保存，渲染前请确认 token 有 repo + workflow 权限）`);
      }
    } else {
      setMsg('✓ 已保存（未设置 GitHub Token，云端渲染不可用）');
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>设置</h3>
        <div className="col" style={{ gap: 16 }}>
          <div className="col">
            <b>GitHub Token（云端渲染必填）</b>
            <span className="muted">需要 classic token，勾选 <code>repo</code> + <code>workflow</code>。只存在本机浏览器，用于触发渲染和下载 MP4。</span>
            <input type="password" value={pat} onChange={(e) => setPatV(e.target.value)} placeholder="ghp_..." />
          </div>
          <div className="col">
            <b>AI 分析 Key（功能B 可选）</b>
            <span className="muted">OpenAI 兼容接口。不配置时功能B 可用手工 JSON 模式。</span>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-..." />
            <div className="row">
              <input style={{ flex: 2 }} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1" />
              <input style={{ flex: 1 }} value={model} onChange={(e) => setModel(e.target.value)} placeholder="gpt-4o-mini" />
            </div>
          </div>
          {msg && <div className="muted">{msg}</div>}
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button onClick={onClose}>关闭</button>
            <button className="primary" onClick={save}>保存</button>
          </div>
        </div>
      </div>
    </div>
  );
};
