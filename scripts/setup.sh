#!/usr/bin/env bash
# Finds the hook-reels engine, installs its packages the first time, and checks that it can run.
# Prints OUTPUT=, CHECK= and ENGINE= lines. Never prints the contents of .env.
set -u
SKILL="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$HOME/.claude/local:$PATH"

# The engine ships inside this skill. HOOK_REELS_HOME points at another copy (a development checkout, say).
ENGINE="${HOOK_REELS_HOME:-$SKILL/engine}"
[ -f "$ENGINE/src/cli.ts" ] || { echo "PROBLEM: no engine at $ENGINE. Clone the whole repository, not only SKILL.md."; exit 1; }
cd "$ENGINE" || exit 1

problems=0
need() { command -v "$1" >/dev/null 2>&1 || { echo "PROBLEM: $1 is not installed. $2"; problems=1; }; }
need node "Install Node 22 or later (macOS: brew install node)."
need ffmpeg "macOS: brew install ffmpeg"
need yt-dlp "macOS: brew install yt-dlp"
need claude "Install Claude Code; the script is written through its command line (or set claudeVia to \"api\" in engine/config.json and add ANTHROPIC_API_KEY to engine/.env)."
if command -v node >/dev/null 2>&1; then
  major=$(node -p 'process.versions.node.split(".")[0]')
  [ "$major" -ge 22 ] || { echo "PROBLEM: Node $major is too old; version 22 or later is needed."; problems=1; }
fi
[ $problems -eq 0 ] || exit 1

if [ ! -d node_modules ]; then
  echo "Installing packages (one time, a few minutes)"
  npm install --no-audit --no-fund >/dev/null 2>&1 || { echo "PROBLEM: npm install failed in $ENGINE"; exit 1; }
fi
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created $ENGINE/.env from the example: the user must add ELEVENLABS_API_KEY to it."
fi

# The output folder's parent must exist; on a computer without it, fall back to a folder in the home directory.
node -e '
const fs=require("fs"),os=require("os"),path=require("path");
const c=JSON.parse(fs.readFileSync("config.json","utf8"));
const abs=d=>d.startsWith("~/")?path.join(os.homedir(),d.slice(1)):d;
if(!fs.existsSync(path.dirname(abs(c.outputDir)))){c.outputDir="~/Hook Reels";fs.writeFileSync("config.json",JSON.stringify(c,null,2)+"\n");console.log("Output folder set to ~/Hook Reels (the configured one does not exist on this computer).");}
fs.mkdirSync(abs(c.outputDir),{recursive:true});console.log("OUTPUT="+abs(c.outputDir));'

echo "CHECK=$(node_modules/.bin/tsx src/cli.ts doctor 2>&1 | tail -1)"
echo "ENGINE=$ENGINE"
