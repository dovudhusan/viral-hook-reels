# Viral Hook Reels

This repository is an agent skill plus the program it drives. It makes "hook breakdown" reels from viral video links.

When the user asks for a hook reel, a hook breakdown, or a reel from a video link:

1. Read `SKILL.md` in this folder and follow it step by step. It starts with `scripts/setup.sh`.
2. Read `reference.md` when SKILL.md points to it.

Rules that always apply here:

- Never read, print or ask for the contents of `engine/.env`. The user edits it themselves.
- Never post or upload a reel. Files are saved to the output folder and the user posts them.
- You write the script yourself, after looking at every frame of the video. Do not write it from the link or the title alone.
