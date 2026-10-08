"""Embed the two-second cheer PCM for immediate playback.

Prepare the WAV from the downloaded source with:
ffmpeg -i cheer.webm -af 'atrim=start=0:end=2,asetpts=PTS-STARTPTS,afade=t=out:st=1.5:d=0.5' -ac 1 -ar 24000 -c:a pcm_s16le public/audio/feedback/correct-cheer-v1.wav
"""
import base64
import json
import wave
from pathlib import Path

root = Path(__file__).resolve().parent.parent
with wave.open(str(root / "public/audio/feedback/correct-cheer-v1.wav"), "rb") as audio:
    assert audio.getnchannels() == 1 and audio.getsampwidth() == 2
    assert audio.getnframes() == audio.getframerate() * 2
    data = {
        "source": "https://www.youtube.com/shorts/wAYWuzOGXSU",
        "durationSeconds": 2,
        "fadeOutStartSeconds": 1.5,
        "fadeOutDurationSeconds": 0.5,
        "sampleRate": audio.getframerate(),
        "pcm16Base64": base64.b64encode(audio.readframes(audio.getnframes())).decode("ascii"),
    }
(root / "lib/correct-sound.json").write_text(json.dumps(data, separators=(",", ":")) + "\n")
