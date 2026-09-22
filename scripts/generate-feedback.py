"""Generate original, gentle feedback effects; no API, key, or samples required."""
import math
import struct
import wave
from pathlib import Path

RATE = 44100
DESTINATION = Path(__file__).resolve().parent.parent / 'public/audio/feedback'
DESTINATION.mkdir(parents=True, exist_ok=True)


def render(name, duration, sound):
    with wave.open(str(DESTINATION / f'{name}.wav'), 'wb') as output:
        output.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
        frames = [int(max(-1, min(1, sound(i / RATE))) * 32767) for i in range(int(duration * RATE))]
        output.writeframes(struct.pack('<' + 'h' * len(frames), *frames))


def bell(t, start, frequency):
    age = t - start
    if age < 0 or age > .4:
        return 0
    envelope = min(age / .008, 1) * math.exp(-age * 11) * min((.4 - age) / .03, 1)
    return .23 * envelope * (math.sin(2 * math.pi * frequency * age) + .18 * math.sin(4 * math.pi * frequency * age))


render('correct', .66, lambda t: sum(bell(t, start, frequency) for start, frequency in [(0, 523.25), (.11, 659.25), (.22, 783.99)]))


def buzzer(t):
    # Short, low, softly edged buzz, without a startling volume jump.
    envelope = min(t / .015, 1, max(0, (.24 - t) / .07))
    phase = 2 * math.pi * (170 * t - 40 * t * t)
    return .18 * envelope * (math.sin(phase) + .3 * math.sin(3 * phase) + .12 * math.sin(5 * phase))


render('incorrect', .25, buzzer)
