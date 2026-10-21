"""Local media worker. No shell interpolation and no paid APIs."""
import argparse, asyncio, json, os, subprocess
p=argparse.ArgumentParser(); p.add_argument('stage',choices=['tts','video']);
for flag in ['text','voice','output','image','audio','clip']: p.add_argument('--'+flag,default='')
p.add_argument('--mock',action='store_true'); a=p.parse_args()
os.makedirs(os.path.dirname(os.path.abspath(a.output)),exist_ok=True)
if a.stage=='tts':
    async def speak():
        import edge_tts
        await edge_tts.Communicate(a.text,a.voice or 'en-IN-NeerjaNeural').save(a.output)
    try: asyncio.run(speak())
    except Exception:
        model=os.environ.get('PIPER_MODEL')
        if not model: raise
        with open(a.output+'.wav','wb') as f:
            subprocess.run(['piper','--model',model,'--output-raw'],input=a.text.encode(),stdout=f,check=True)
        subprocess.run(['ffmpeg','-y','-f','s16le','-ar','22050','-ac','1','-i',a.output+'.wav',a.output],check=True)
else:
    subtitle=a.output+'.srt'
    if a.mock:
        with open(subtitle,'w',encoding='utf-8') as f: f.write('1\n00:00:00,000 --> 00:00:30,000\nMOCK PREVIEW - silent voiceover\n')
    else:
        from faster_whisper import WhisperModel
        model=WhisperModel(os.environ.get('WHISPER_MODEL','tiny'),device='cpu',compute_type='int8')
        segments,_=model.transcribe(a.audio,word_timestamps=True)
        def ts(t):
            ms=round(t*1000); return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
        with open(subtitle,'w',encoding='utf-8') as f:
            n=1
            for segment in segments:
                for word in segment.words:
                    f.write(f'{n}\n{ts(word.start)} --> {ts(word.end)}\n{word.word.strip()}\n\n'); n+=1
    # Working directory keeps subtitle filter escaping portable across Windows/Linux.
    cwd=os.path.dirname(os.path.abspath(a.output)); name=os.path.basename(subtitle)
    video_input=['-stream_loop','-1','-i',os.path.abspath(a.clip)] if a.clip else ['-loop','1','-i',os.path.abspath(a.image)]
    # Stock clips are cropped to portrait, with the branded card inset as an end-card style overlay.
    if a.clip:
        inputs=video_input+['-i',os.path.abspath(a.image),'-i',os.path.abspath(a.audio)]
        filters=f"[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920[bg];[1:v]scale=324:576[card];[bg][card]overlay=40:40,subtitles='{name}':force_style='FontSize=18,Alignment=2,MarginV=100'[out]"
        maps=['-filter_complex',filters,'-map','[out]','-map','2:a']
    else:
        inputs=video_input+['-i',os.path.abspath(a.audio)]
        maps=['-vf',f"scale=1080:1920,subtitles='{name}':force_style='FontSize=18,Alignment=2,MarginV=100'",'-map','0:v','-map','1:a']
    subprocess.run(['ffmpeg','-y']+inputs+maps+['-t','45','-shortest','-r','24','-c:v','libx264','-preset','ultrafast','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',os.path.abspath(a.output)],cwd=cwd,check=True)
