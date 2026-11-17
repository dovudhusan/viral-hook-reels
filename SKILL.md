---
name: hook-reel
description: Make a short "hook breakdown" reel from a viral video link. The reel replays the viral video's opening, then an AI voice explains why it worked, with word-timed captions, replays, number cards, a cover picture and a chosen ending. Use when the user says "/hook-reel", "make a hook reel", "hook breakdown", "break down this viral video", "make a reel from this link", "turn this viral video into a reel", "failed version vs good version", "compare these two videos", or pastes an Instagram, TikTok or YouTube Shorts link and wants a breakdown reel. Not for talking-head edits and not for posting.
argument-hint: [video link] [ending: hooks | viral | follow | save | share | like]
---

# Hook Reel

You make hook-breakdown reels by driving the hook-reels engine, a command-line program that does the downloading, the voice, the edit and the render. Your job is to run it, check its decisions the way an editor would, and fix what is off before the user sees it.

Read `~/.claude/skills/hook-reel/reference.md` when you need the nine script approaches, the scene types, the two-clip spec or troubleshooting.

## Step 0: find the engine

Run this first, every time:

```bash
~/.claude/skills/hook-reel/scripts/setup.sh
```

It finds the engine (the `engine` folder inside this skill, or `HOOK_REELS_HOME` when that is set), installs its packages the first time, and ends with `OUTPUT=`, `CHECK=` and `ENGINE=` lines. Use the `ENGINE` folder for every command below.

- A line starting with `PROBLEM:` means something is missing. Tell the user what to install and stop.
- In `CHECK`, `voiceKey: false` means the user must add `ELEVENLABS_API_KEY` to `ENGINE/.env` themselves. Never ask for a key in chat and never print `.env`.
- `telegram: false` and `scoutKey: false` are fine. Telegram only announces finished reels; the scout key is for the daily scan.
- Instagram links need the user to be logged into Instagram in Chrome on this computer.

## Step 1: make the reel

Take the link and the ending from `$ARGUMENTS`. If no ending is given, use `hooks`.

```bash
cd "$ENGINE" && node_modules/.bin/tsx src/cli.ts make "<link>" --ending <ending> --json
```

- It takes 4 to 8 minutes. Run it in the background and wait for it; do not poll.
- It prints one JSON line per event: `job` (the job id), `stage` started and finished, then `done` (with the file) or `failed` (with the stage and reason).
- The seven stages are fetch, analyze, script, voice, plan, render, deliver.
- If the link reports no view count, add `--views 2.3m`. Never guess a number: ask the user.
- The voice stage costs ElevenLabs credits each time it runs. Do not re-run it without a reason.

On `failed`, read the reason, fix the cause, then continue from the failed stage (finished stages are kept):

```bash
cd "$ENGINE" && node_modules/.bin/tsx src/cli.ts resume <jobId> --json
```

## Step 2: check it like an editor

When it is done, read `ENGINE/jobs/<jobId>/script.json` and look at the reel before you tell the user it is ready.

1. **The cut.** `hook` must start at 0, and `hook.end` must be at least two seconds after `payoff`, the second where a first-time viewer understands what the opening leads to. For an ad, that is the second the product or brand is clearly on screen. Look at the frames in `jobs/<jobId>/frames/` (one per second) around `payoff` and confirm it yourself. Cutting in before the payoff is the worst mistake: the voice says "it was an ad" and the viewer has not seen the ad.
2. **The script.** Every line must be about this video: what is on screen, at which moment, and what the viewer's brain does. If a line could be read over any video, it is too generic.
3. **The picture.** Make a sheet of frames from the finished file and look at it:

```bash
ffmpeg -y -v error -i "<file>" -vf "fps=1/2,scale=200:-1,tile=8x4" /tmp/hook-reel-sheet.jpg
```

Check that captions are readable, footage is not stretched, any reaction clips fit their lines, and the ending matches the one asked for.

You cannot hear the reel. Say so, and ask the user to play it once.

## Step 3: fix and redo

To change the script or the cut after the fact, edit `jobs/<jobId>/script.json`, then tell the engine where to continue from and resume:

```bash
cd "$ENGINE" && echo '{"stage":"voice","state":"failed","error":"script edited"}' > jobs/<jobId>/status.json && node_modules/.bin/tsx src/cli.ts resume <jobId> --json
```

- Changed spoken words (`stat`, `intro`, `triggers`, `formula`): continue from `voice`. This records the voice again.
- Changed only `hook` or a trigger's `moment`: continue from `plan`. No new voice.
- A new delivery never overwrites the old file; it gets `-2` in its name.

## Step 4: hand it over

Tell the user, in this order: where the reel is (the `file` from the `done` event), that its cover is next to it as `<name>-cover.png`, the caption to paste (`jobs/<jobId>/caption.txt`), which approach and ending it used, and what you could not check (the sound).

## Two-clip comparison reels

For "this version got X views, this one got Y" reels: one clip plays untouched and gets a label, the second clip plays and gets a label, then the voice explains the difference. Write a spec file and run:

```bash
cd "$ENGINE" && node_modules/.bin/tsx src/cli.ts compare /path/to/spec.json
```

The spec format and a full example are in `reference.md`. You write the lines yourself here. Find the clean, untouched range of each clip by looking at frames of the file; never include a stretch that has someone else's captions or logo on it.

## The editing rules

These are what make the reels good. The engine follows them; you check them.

1. **Opening.** The source plays untouched, with its own sound, from second 0 until two to four seconds after the payoff. Up to 35 seconds.
2. **First line.** The voice comes in on the frozen last frame with the view count stacked up word by word, in the shape of the chosen approach ("This video pulled over 6.8 million views, and surprisingly, it was an ad for…").
3. **Approach.** One of nine, drawn at random from three the last reels did not use, so two reels in a row never have the same outline.
4. **Voice.** Pauses are cut out and the audio runs at 1.15 times speed: fast like a creator, never chipmunk fast.
5. **Captions.** Word-timed, white, uppercase. Either one word at a time or a phrase building up. No sound effect on every caption.
6. **Pictures under the voice.** Replays of the exact moment being described, small clip cards, black text cards, and number cards for "Number one, …".
7. **Reaction clips.** Only if the user has added clips to `ENGINE/assets/reactions` (none ship with the engine). At most three per reel, each one once, only where the line calls for it: confused on a question, shocked on danger, mind-blown on a twist, thinking on what the brain expects. Never over full-screen footage.
8. **Music.** Only if the user has saved a track as `ENGINE/assets/music/bed.mp3` (none ships). One bed, quiet (14 percent), starting with the voice. Without it the reel has the voice and sound effects, and the user can add a sound in the app when posting.
9. **Ending.** `hooks` and `viral` ask for a comment keyword over a blurred hooks document. `follow`, `save`, `share` and `like` show that button being tapped.
10. **Cover.** Black, pale blue hand-drawn text: "THIS AD HIT / 13 MILLION / VIEWS USING THESE".

## Critical rules

1. Run `setup.sh` first and use the `ENGINE` it prints. Never assume the folder.
2. Never read, print or ask for the contents of `.env`. The user edits it themselves.
3. Never invent a view count, a product name or a detail that is not in the frames or the speech.
4. Never mirror the source video.
5. Never copy another creator's script word for word. Keep the points, write our own sentences.
6. Never post or upload the reel anywhere. It is saved to the output folder and the user posts it.
7. Do not re-run the voice stage to fix something that a re-plan would fix.
8. Do not call a reel done until you have looked at its frames.
9. The source footage is another creator's work, and so is any music or reaction clip the user adds that they did not make. The engine credits the source account on screen; keep that on. If the user asks about risk, say so plainly.

Use `$ARGUMENTS` as the link and the ending. With no link, ask for one.
