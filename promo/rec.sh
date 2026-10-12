#!/usr/bin/env bash
# Запись ролика: кадры снимаются изнутри программы и накладываются на фон.
# Перед запуском должен работать фон: npx electron promo/bg.js
# Пример: promo/rec.sh 1-glaza 12 "--nag=2 --edge=bottom --interval=999" circle
set -u
NAME="$1"; SEC="$2"; FLAGS="$3"; MOUSE="${4:-jiggle}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FF="${FFMPEG:-$(cygpath -u "$LOCALAPPDATA")/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-9.0.2-full_build/bin/ffmpeg.exe}"
REC="$(cygpath -u "$APPDATA")/Гимнастика для глаз/rec"
OUT="$ROOT/promo/out"

kill_app() {
  # и запуск из исходников, и установленная программа: вторая копия не стартует
  powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='electron.exe'\" | Where-Object { \$_.CommandLine -match '\.exe\"\s+\.\s' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-Process -Name 'Гимнастика для глаз' -ErrorAction SilentlyContinue | Stop-Process -Force" >/dev/null 2>&1
  sleep 2
}

kill_app
cd "$ROOT"
rm -rf "$REC"
powershell -NoProfile -Command "Set-Location '$(cygpath -w "$ROOT")'; Start-Process -FilePath 'npx.cmd' -ArgumentList 'electron . $FLAGS --rec=$SEC' -WindowStyle Hidden" >/dev/null 2>&1

# Мышь не трогаем: режим фильма на время записи отключён через настройку
# stillMin в state.json, поэтому окно не прячется и без движения курсора.
sleep $((SEC + 8))

kill_app
N=$(ls "$REC" 2>/dev/null | wc -l)
# частота — по времени самих кадров: окно снимается не всю запись
T1=$(stat -c %Y "$REC"/f0001.png 2>/dev/null || echo 0)
T2=$(stat -c %Y "$(ls "$REC"/f*.png | tail -1)" 2>/dev/null || echo 0)
FPS=$(awk -v n="$N" -v a="$T1" -v b="$T2" 'BEGIN { d = b - a; printf "%.2f", (d > 0 ? (n - 1) / d : 8) }')
echo "кадров: $N, частота: $FPS"
[ "$N" -lt 10 ] && { echo "кадров мало — окно не показалось"; exit 1; }

"$FF" -hide_banner -loglevel error -y \
  -loop 1 -framerate "$FPS" -i "$OUT/bg960.png" \
  -framerate "$FPS" -i "$REC/f%04d.png" \
  -filter_complex "[0:v][1:v]overlay=shortest=1,minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,format=yuv420p" \
  -c:v libx264 -crf 20 -movflags +faststart "$OUT/$NAME.mp4"
echo "готово: promo/out/$NAME.mp4"
