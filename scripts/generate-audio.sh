#!/bin/bash
# Run on macOS. Requires the Samantha voice and ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p public/audio
audio_tmp=$(mktemp -d)
trap 'rm -rf "$audio_tmp"' EXIT
# Derive clips from the same range definitions and words as the app (Node 24+).
while IFS=$'\t' read -r number word; do
  if [ -f "public/audio/$number.mp3" ]; then continue; fi
  say -v Samantha -r 145 -o "$audio_tmp/$number.aiff" "$word"
  ffmpeg -nostdin -v error -y -i "$audio_tmp/$number.aiff" -af 'silenceremove=start_periods=1:start_threshold=-50dB,apad=pad_dur=0.12' -codec:a libmp3lame -q:a 3 "public/audio/$number.mp3"
done < <(node -e 'const {RANGES,numberWord}=require("./lib/numbers.ts"); for(const n of [...new Set(RANGES.flatMap(r=>r.numbers))].sort((a,b)=>a-b)) console.log(n+"\t"+numberWord(n));')
