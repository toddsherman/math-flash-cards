"""Embed the trimmed buzzer PCM so taps need no network fetch or audio decoder."""
import base64
import json
import wave
from pathlib import Path

root = Path(__file__).resolve().parent.parent
with wave.open(str(root / 'public/audio/feedback/incorrect-youtube-v1.wav'), 'rb') as audio:
    assert audio.getnchannels() == 1 and audio.getsampwidth() == 2
    data = {
        'source': 'https://www.youtube.com/watch?v=FRpq7o1mKXY',
        'trimStartSeconds': 0.609,
        'sampleRate': audio.getframerate(),
        'pcm16Base64': base64.b64encode(audio.readframes(audio.getnframes())).decode('ascii'),
    }
(root / 'lib/incorrect-sound.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')
