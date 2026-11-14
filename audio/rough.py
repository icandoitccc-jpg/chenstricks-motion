"""Deterministic edit decisions. ASR only proposes retakes; never decides removal."""
import json,math,pathlib,re,subprocess,sys,hashlib,tempfile,os,difflib

def probe(path):
    d=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','json',str(path)]));return float(d['format']['duration'])
def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
    return h.hexdigest()
def normal(s):return re.sub(r'[^\w\u3400-\u9fff]','',s.lower())
def analyze(path,out,recognize=True):
    duration=probe(path);cmd=['ffmpeg','-v','info','-i',str(path),'-af','silencedetect=noise=-42dB:d=1.4','-f','null','-'];log=subprocess.run(cmd,capture_output=True,text=True,check=True).stderr
    cuts=[];start=None
    for line in log.splitlines():
        m=re.search(r'silence_start: ([0-9.]+)',line)
        if m:start=float(m.group(1))
        m=re.search(r'silence_end: ([0-9.]+)',line)
        if m and start is not None:
            end=min(duration,float(m.group(1)));a=start+.32;b=end-.32
            if b-a>=.6:cuts.append(dict(id=f'pause-{len(cuts)}',kind='pause',start=a,end=b,reason='长停顿候选，保留两端各约0.32秒',selected=False))
            start=None
    cues=[]
    if recognize:
        from faster_whisper import WhisperModel
        model=WhisperModel('small',device='cpu',compute_type='int8',cpu_threads=2)
        segments,_=model.transcribe(str(path),beam_size=3,vad_filter=True,word_timestamps=True,condition_on_previous_text=False)
        cues=[dict(id=f'T{i}',text=s.text.strip(),start=s.start,end=s.end) for i,s in enumerate(segments) if s.text.strip()]
        for i,a in enumerate(cues):
            aa=normal(a['text'])
            if len(aa)<6:continue
            for b in cues[i+1:i+4]:
                if b['start']-a['end']>12:break
                bb=normal(b['text']);ratio=difflib.SequenceMatcher(None,aa,bb,autojunk=False).ratio()
                if len(bb)>=6 and (ratio>=.72 or (len(aa)>=8 and bb.startswith(aa))):
                    cuts.append(dict(id=f'retake-{i}',kind='retake',start=a['start'],end=a['end'],reason='疑似重读；仅建议删除前一遍，需试听决定',text=a['text'],comparison=b['text'],comparisonStart=b['start'],selected=False));break
    result=dict(version=1,audioSha256=digest(path),duration=duration,cues=cues,candidates=sorted(cuts,key=lambda c:(c['start'],c['end'])),scope='停顿/重读候选；未删除任何音频。不保证识别清嗓子、错字或所有重读。')
    pathlib.Path(out).write_text(json.dumps(result,ensure_ascii=False),encoding='utf8');return result

def intervals(duration,cuts):
    spans=[]
    for c in cuts:
        a,b=c['start'],c['end']
        if isinstance(a,bool) or isinstance(b,bool) or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in [a,b]) or a<0 or b<=a or b>duration+.01:raise ValueError('Invalid cut range')
        spans.append((a,min(b,duration)))
    merged=[]
    for a,b in sorted(spans):
        if merged and a<=merged[-1][1]:merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else:merged.append((a,b))
    keep=[];last=0
    for a,b in merged:
        if a>last:keep.append((last,a))
        last=b
    if last<duration:keep.append((last,duration))
    if sum(b-a for a,b in keep)<.5:raise ValueError('At least 0.5 seconds must remain')
    return keep

def edited_cues(cues,keep):
    out=[];offset=0
    for a,b in keep:
        for c in cues:
            x,y=max(a,c['start']),min(b,c['end'])
            if y<=x:continue
            # Partially cut phrases cannot retain their full transcript as if accurate.
            if x>c['start']+.015 or y<c['end']-.015:
                out.append(dict(start=offset+x-a,end=offset+y-a,text=c['text'],needsReview=True))
            else:out.append(dict(start=offset+x-a,end=offset+y-a,text=c['text'],needsReview=False))
        offset+=b-a
    return out

def cut(path,analysis,decision,out):
    info=json.loads(pathlib.Path(analysis).read_text());d=json.loads(pathlib.Path(decision).read_text())
    if info['audioSha256']!=digest(path) or d.get('audioSha256')!=info['audioSha256']:raise ValueError('Audio has changed; analyze again')
    if abs(probe(path)-info['duration'])>.1:raise ValueError('Duration changed')
    ids=d.get('selectedIds',[])
    if not isinstance(ids,list) or len(set(ids))!=len(ids):raise ValueError('Invalid selection')
    byid={c['id']:c for c in info['candidates']}
    if any(i not in byid for i in ids):raise ValueError('Unknown cut ID')
    keep=intervals(info['duration'],[byid[i] for i in ids])
    if len(keep)>800:raise ValueError('Too many cuts')
    out=pathlib.Path(out);out.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        files=[]
        # Stream each range; memory is independent of the full recording length.
        for i,(a,b) in enumerate(keep):
            p=pathlib.Path(temp)/f'{i:04}.wav';subprocess.run(['ffmpeg','-v','error','-ss',str(a),'-i',str(path),'-t',str(b-a),'-af','afade=t=in:d=0.004,afade=t=out:st='+str(max(0,b-a-.004))+':d=0.004','-ar','48000','-c:a','pcm_s16le',str(p)],check=True);files.append(p)
        listing=pathlib.Path(temp)/'files.txt';listing.write_text(''.join("file '"+str(p)+"'\n" for p in files))
        subprocess.run(['ffmpeg','-v','error','-f','concat','-safe','0','-i',str(listing),'-c:a','aac','-b:a','160k',str(out/'rough-cut.m4a')],check=True)
    (out/'rough-result.json').write_text(json.dumps(dict(version=1,sourceSha256=info['audioSha256'],audioSha256=digest(out/'rough-cut.m4a'),sourceDuration=info['duration'],duration=probe(out/'rough-cut.m4a'),selectedIds=ids,keep=keep,cues=edited_cues(info.get('cues',[]),keep),needsTranscriptReview=bool(ids)),ensure_ascii=False))
if __name__=='__main__':
    mode=sys.argv[1]
    if mode=='analyze':analyze(sys.argv[2],sys.argv[3],recognize='--no-asr' not in sys.argv)
    elif mode=='cut':cut(*sys.argv[2:6])
    else:raise SystemExit('Unknown mode')
