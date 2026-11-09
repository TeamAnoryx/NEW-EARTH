#!/usr/bin/env bash
# Build the self-hosted intro media from the creators' original files.
#
#   scripts/make-intro.sh <cosmos-video-file> <space-meditation-music-file>
#
# Get both files from the creators' own download links (see each YouTube video's description):
#   footage: "Relaxing Space Music | Cosmos" — SERENE        https://www.youtube.com/watch?v=a6NqW_JqFwM
#   music:   "Space Meditation" — MokkaMusic                https://www.youtube.com/watch?v=-LYhkU_hD_w
# Keep their credit lines (CREDITS.md + in-game Credits). Do not rip from YouTube — that breaks
# YouTube's Terms of Service.
#
# Output (served by Vite from public/, picked up automatically by the intro):
#   public/intro/intro-720.mp4   H.264 720p30, no audio, faststart  (default)
#   public/intro/intro-480.mp4   H.264 480p30 for low-memory phones
#   public/intro/intro-music.m4a AAC, loudness-normalised, faded in/out
#   public/intro/manifest.json   segment boundaries on the edited timeline (drives captions)
set -euo pipefail

VIDEO_SRC="${1:?usage: $0 <video> <music>}"
MUSIC_SRC="${2:?usage: $0 <video> <music>}"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/intro"
mkdir -p "$OUT"

# Cuts requested for the intro (seconds in the source video). Keep in sync with SEGMENTS in src/intro/intro.js.
SEGS=("0 45" "226 234" "250 265" "404 415")
XF=0.35          # cross-cut duration between segments
OUTRO=12         # music after the footage: title + credits + 2 s white-out
MUSIC_START=0    # seconds into the music file

command -v ffmpeg >/dev/null || { echo "ffmpeg not found" >&2; exit 1; }
[[ -f "$VIDEO_SRC" ]] || { echo "video not found: $VIDEO_SRC" >&2; exit 1; }
[[ -f "$MUSIC_SRC" ]] || { echo "music not found: $MUSIC_SRC" >&2; exit 1; }

build_video () {  # $1 = height, $2 = crf, $3 = output
  # one input per segment with fast input seeking (-ss before -i): low memory, no full decode
  local H=$1 CRF=$2 OUTF=$3 W=$(( $1 * 16 / 9 ))
  local inputs=() fc="" prev="" n=${#SEGS[@]} i acc offset d a b
  for ((i=0; i<n; i++)); do
    read -r a b <<<"${SEGS[$i]}"
    d=$(awk -v a="$a" -v b="$b" 'BEGIN{print b-a}')
    inputs+=(-ss "$a" -t "$d" -i "$VIDEO_SRC")
    fc+="[${i}:v]setpts=PTS-STARTPTS,fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p[s${i}];"
  done
  prev="s0"; read -r a b <<<"${SEGS[0]}"; acc=$(awk -v a="$a" -v b="$b" 'BEGIN{print b-a}')
  for ((i=1; i<n; i++)); do
    offset=$(awk -v t="$acc" -v x="$XF" 'BEGIN{printf "%.3f", t-x}')
    fc+="[${prev}][s${i}]xfade=transition=fadewhite:duration=${XF}:offset=${offset}[x${i}];"
    prev="x${i}"
    read -r a b <<<"${SEGS[$i]}"
    acc=$(awk -v t="$acc" -v a="$a" -v b="$b" -v x="$XF" 'BEGIN{printf "%.3f", t+(b-a)-x}')
  done
  ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -filter_complex "${fc%;}" -map "[${prev}]" -an -threads 2 \
    -c:v libx264 -preset slow -crf "$CRF" -profile:v main -pix_fmt yuv420p -movflags +faststart "$OUTF"
  echo "$acc"
}

echo "• cutting video (720p)…";  TOTAL=$(build_video 720 23 "$OUT/intro-720.mp4")
echo "• cutting video (480p)…";  build_video 480 26 "$OUT/intro-480.mp4" >/dev/null
MUSIC_LEN=$(awk -v t="$TOTAL" -v o="$OUTRO" 'BEGIN{printf "%.2f", t+o}')
FADE_OUT_AT=$(awk -v l="$MUSIC_LEN" 'BEGIN{printf "%.2f", l-3}')
echo "• trimming music to ${MUSIC_LEN}s…"
ffmpeg -hide_banner -loglevel error -y -ss "$MUSIC_START" -t "$MUSIC_LEN" -i "$MUSIC_SRC" \
  -af "afade=t=in:st=0:d=2,afade=t=out:st=${FADE_OUT_AT}:d=3,loudnorm=I=-16:TP=-1.5:LRA=11" \
  -c:a aac -b:a 160k -ar 48000 -movflags +faststart "$OUT/intro-music.m4a"

# segment boundaries on the edited timeline (each later segment starts XF earlier because of the cross-cut)
python3 - "$OUT/manifest.json" "$TOTAL" "$XF" "${SEGS[@]}" <<'PY'
import json, sys
out, total, xf, segs = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4:]
t, rows = 0.0, []
for i, s in enumerate(segs):
    a, b = map(float, s.split()); d = b - a
    start = t if i == 0 else t - xf
    rows.append({"start": round(start, 3), "end": round(start + d, 3), "source": [a, b]})
    t = start + d
json.dump({"version": 1, "duration": round(total, 3), "segments": rows,
           "video": {"720": "intro/intro-720.mp4", "480": "intro/intro-480.mp4"}, "music": "intro/intro-music.m4a"},
          open(out, "w"), indent=2)
print("• manifest:", out)
PY
ls -lh "$OUT"
