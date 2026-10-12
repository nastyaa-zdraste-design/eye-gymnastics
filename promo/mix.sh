#!/usr/bin/env bash
# Собрать ролик из уже снятых кадров: promo/mix.sh имя
set -u
NAME="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FF="/c/Users/nasty/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe"
REC="/c/Users/nasty/AppData/Roaming/Гимнастика для глаз/rec"
OUT="$ROOT/promo/out"

N=$(ls "$REC" | wc -l)
T1=$(stat -c %Y "$REC"/f0001.png)
T2=$(stat -c %Y "$(ls "$REC"/f*.png | tail -1)")
FPS=$(awk -v n="$N" -v a="$T1" -v b="$T2" 'BEGIN { d = b - a; printf "%.2f", (d > 0 ? (n - 1) / d : 8) }')
echo "кадров: $N, частота: $FPS"

"$FF" -hide_banner -loglevel error -y \
  -loop 1 -framerate "$FPS" -i "$OUT/bg960.png" \
  -framerate "$FPS" -i "$REC/f%04d.png" \
  -filter_complex "[0:v][1:v]overlay=shortest=1,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p" \
  -c:v libx264 -crf 20 -movflags +faststart "$OUT/$NAME.mp4"
echo "готово: promo/out/$NAME.mp4"
