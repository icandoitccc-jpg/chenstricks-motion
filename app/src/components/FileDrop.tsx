import React, { useRef, useState } from 'react';
import './file-drop.css';

export function FileDrop({ accept, multiple = false, disabled = false, label, onFiles, children }: {
  accept: string; multiple?: boolean; disabled?: boolean; label: string;
  onFiles: (files: File[]) => void | Promise<void>; children: React.ReactNode;
}) {
  const [active, setActive] = useState(false); const [error, setError] = useState(''); const depth = useRef(0);
  const unavailable = (el: HTMLElement) => disabled || !!el.closest('fieldset:disabled');
  const isFileDrag = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const receive = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation(); depth.current = 0; setActive(false); setError('');
    if (unavailable(e.currentTarget)) return;
    const files = Array.from(e.dataTransfer.files); if (!files.length) return;
    if (!multiple && files.length > 1) { setError('请一次拖入一个文件。'); return; }
    const rules = accept.toLowerCase().split(',').map(s=>s.trim());
    const wrong = files.find(f => !rules.some(rule => rule.startsWith('.') ? f.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? f.type.toLowerCase().startsWith(rule.slice(0,-1)) : f.type.toLowerCase() === rule));
    if (wrong) { setError(`不支持这个文件：${wrong.name}`); return; }
    try { await onFiles(files); } catch (e) { setError((e as Error).message); }
  };
  return <div className={`file-drop ${active ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}`} data-drop-label={label}
    onDragEnter={e=>{if(!isFileDrag(e))return;e.preventDefault();e.stopPropagation();if(unavailable(e.currentTarget))return;depth.current++;setActive(true);}}
    onDragOver={e=>{if(!isFileDrag(e))return;e.preventDefault();e.stopPropagation();e.dataTransfer.dropEffect=unavailable(e.currentTarget)?'none':'copy';}}
    onDragLeave={e=>{e.preventDefault();e.stopPropagation();depth.current=Math.max(0,depth.current-1);if(!depth.current)setActive(false);}}
    onDrop={e=>void receive(e)}>
    {children}<span className="file-drop-hint">{active ? '松开即可导入' : multiple ? '或拖入文件，可多选' : '或将文件拖到这里'}</span>
    {error && <span className="file-drop-error" role="alert">{error}</span>}
  </div>;
}
