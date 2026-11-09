# Self-hosted intro media

Run from the repo root, using the creators' **official** download files (not a YouTube rip):

```bash
scripts/make-intro.sh ~/Downloads/cosmos.mp4 ~/Downloads/space-meditation.mp3
git add public/intro && git commit -m "Add intro media" && git push
```

This writes `intro-720.mp4`, `intro-480.mp4`, `intro-music.m4a` and `manifest.json` here.
When `manifest.json` exists, the intro plays these files instead of the YouTube embed.
