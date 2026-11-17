# Hook Reel reference

## The nine approaches

The engine offers three of these per reel, drawn at random and never one used by the last three reels. Claude (inside the engine) picks the one that fits the video and adapts it. They are the shapes the most viewed hook-breakdown reels take. The full wording of each is in `ENGINE/src/narration.ts` (`FORMATS`) and an example voiceover for each is in `ENGINE/src/examples.ts`.

| Name | When it fits | Opening line shape | Beats |
|---|---|---|---|
| `ad-reveal` | The video turns out to be an ad | "This video pulled over N views, and surprisingly, it was an ad for …" | 3 numbered triggers, formula "A to B to C" |
| `named-hook` | The hook deserves a name | "… and it used one powerful hook, the … hook." | 3 numbered triggers |
| `one-trigger` | One idea carries the video | "… and your brain fell for it before you even realized." | 3 unnamed beats told as a story |
| `crazy-part` | One surprising fact is visible | "… but here's the crazy part. …" | 2 triggers, then "Why it spreads" |
| `same-concept` | Any brand could copy it | "… and any brand can use the exact same concept." | 2 longer triggers |
| `odd-setting` | An ordinary thing in the wrong place | "… and it wasn't …, it was …" | 3 triggers with short fragments |
| `timing` | It rode a season, fear or trend | "This video pulled over N views" plus the interesting part | 2 triggers in the video, 1 outside it |
| `this-is` | A label says it all | "This is a … hook, and it pulled N views." | 2 or 3 triggers |
| `contrast` | It did what most would cut out | "… by doing what most brands would cut out." | 3 triggers |

## script.json fields

| Field | Meaning |
|---|---|
| `format` | The approach, from the table above |
| `payoff` | Second of the source where the viewer understands what the opening leads to |
| `hook` | `{start, end}`: the untouched opening. Starts at 0, ends 2 to 4 s after `payoff`, at most 35 s long |
| `stat` | First spoken sentence. Must contain the spoken view count exactly ("6.8 million") |
| `intro` | The line that leads into the triggers |
| `triggers` | Each has `name` (1 to 3 words, or empty), `lines` (1 to 3 short sentences) and `moment` `{start, end}` in source seconds: the footage shown while it is explained |
| `formula` | The closing lesson, ending on advice the viewer can use |
| `caption` | Post caption, under 12 words |
| `ending` | hooks, viral, follow, save, share or like |

The whole voiceover is 95 to 130 words, counting "Number one," headings and the closing line.

## Scene types in the edit

| Scene | What it shows | Used for |
|---|---|---|
| `RawClip` | Source footage, untouched, with its sound | The opening |
| `StatOverlay` | Frozen last frame, words stacking up, numbers large | The first spoken line |
| `NumberCard` | A big numeral on black | "Number one" |
| `TextCard` | Words on black, one at a time or building up | Names, connecting phrases, the formula |
| `Replay` | Full-screen footage of the trigger's moment, muted, one word at a time over it | Lines that describe what happens |
| `ClipCard` | A small rounded footage card on black | Variety between replays |
| `Reaction` | A reaction clip from `ENGINE/assets/reactions` with the word under it (only when the user has added clips) | A question, a shock, a twist, a thought |
| `CommentsMock` | A comments view | Lines that mention comments, replays or shares |
| `Cta` | The ending | Blurred hooks document, or the follow / save / share / like button |

No reaction clips ship with the engine. The names it knows are `confused`, `shocked`, `mindblown` and `thinking`: the user saves a 640×400 mp4 of two to five seconds as `ENGINE/assets/reactions/<name>.mp4` and the next reel uses it. For a new name, also add a pattern for it in `REACTIONS` in `ENGINE/src/plan.ts`.

## Endings

| Ending | Closing line (three wordings rotate) |
|---|---|
| `hooks` | "Comment <keyword>, and I'll send you <offer>" with the keyword and offer from `config.json` |
| `viral` | "Comment viral, and I'll send you psychology-based hooks you can use in your own videos." |
| `follow` | "Follow for a new hook breakdown every day." |
| `save` | "Save this, and use the formula in your next video." |
| `share` | "Send this to someone who makes videos." |
| `like` | "Like this if you want the next breakdown." |

## Two-clip comparison spec

One video file must hold both clips, each untouched somewhere in it (for example a comparison reel someone else made, or two downloads joined with ffmpeg). You write the lines. `lines[0]` is spoken after the first clip, then the second clip plays, then the rest follow.

```json
{
  "file": "/absolute/path/both-clips.mp4",
  "first": { "start": 0, "end": 6.2 },
  "second": { "start": 9.0, "end": 22.4 },
  "views": 13000000,
  "caption": "The failed version got 6x more views than the good one",
  "lines": [
    { "text": "This is the failed version. 13 million views.", "show": "label", "big": ["failed"] },
    { "text": "This is the good version. 2 million views.", "show": "label", "big": ["good"] },
    { "text": "So why did the fail get", "show": "build" },
    { "text": "six times the views?", "show": "build" },
    { "text": "A perfect pour is exactly what you expect.", "show": "replay", "clip": "second", "range": { "start": 15, "end": 22.4 } },
    { "text": "A spill breaks the pattern.", "show": "replay", "clip": "first", "range": { "start": 2.2, "end": 6.2 } },
    { "text": "It grabs your attention", "show": "card", "clip": "first" },
    { "text": "and feels human,", "show": "word" },
    { "text": "so it stops looking like an ad,", "show": "build" },
    { "text": "and starts looking real.", "show": "replay", "clip": "first", "range": { "start": 4.4, "end": 6.2 } }
  ]
}
```

| `show` | Result |
|---|---|
| `label` | Words stack up on the frozen last frame of the clip; `big` words are large |
| `build` | The phrase builds up on black |
| `word` | One word at a time on black |
| `replay` | Full-screen footage of `range` (or the whole clip) |
| `card` | Small footage card |
| `reaction` | The named reaction clip (use only one the user has added) |

How to find the ranges: make a frame sheet (`ffmpeg -i file -vf "fps=1,scale=180:-1,tile=10x6" sheet.jpg`), then a finer one at 4 frames a second around each cut. A range ends before any caption, dimming or logo that someone else added.

Split a sentence across several lines when you want the picture to change mid-sentence. Keep the whole script under about 70 words: the two clips already take most of the time.

Running the same spec again reuses the recorded voice as long as the words are unchanged, so changing only `show`, `range` or `big` costs nothing.

## Settings

`ENGINE/config.json`: `cta.keyword`, `cta.offer`, `voiceId` (ElevenLabs), `voiceTempo` (1.0 to 1.4, default 1.15), `musicVolume` (0 to 0.4, default 0.14, used when `ENGINE/assets/music/bed.mp3` exists), `outputDir`, `creditSource`. Change the first four with:

```bash
node_modules/.bin/tsx src/cli.ts settings set voiceTempo 1.2
```

`ENGINE/.env` (the user edits it): `ELEVENLABS_API_KEY` is required. `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are optional. `IG_COOKIES_BROWSER` defaults to chrome.

## Other commands

| Command | What it does |
|---|---|
| `history` | Every job, newest first, as JSON |
| `cover <jobId>` | Draw the cover again and put it next to the reel |
| `doctor` | What is installed and set, yes or no only |
| `make … --file /path/video.mp4 --views 2.3m` | Use a video already on disk |

## Troubleshooting

| Problem | Cause and fix |
|---|---|
| "Log into Instagram in Chrome" | The Instagram session expired. The user logs in at instagram.com in Chrome, then resume |
| Script invalid after retry | Read the reasons in the message. Usually the video is too short or has no clear payoff; try again, or pick another video |
| Render fails with "got no response" | The engine already retries three times. Resume once more |
| The cut is still too early | Edit `hook.end` in `script.json`, continue from `plan` |
| Voice too fast or slow | `settings set voiceTempo`, then continue from `voice` |
| A download host cannot be reached | A network block on this computer. Try again later or use `--file` |
