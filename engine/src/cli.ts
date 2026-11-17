import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';
import { loadConfig, loadEnv } from './config';
import { createJob, openJob, type Job } from './job';
import { parseViews } from './narration';
import { runPipeline, STAGES, type Deps } from './pipeline';
import { killChildren, realExec } from './exec';
import { makeAsk } from './clients/claude';
import { makeAskCli } from './clients/claudeCli';
import { askClaudeJson } from './clients/claudeJson';
import { speak, transcribe } from './clients/elevenlabs';
import { dropSessions, IgAuthError, mediaInfo, withSession, type Reel } from './clients/instagram';
import { makeRapidSource } from './clients/reelSource';
import { makeNotify } from './clients/telegram';
import { doctor, history, settingsGet, settingsSet, shortlistGet, shortlistSet, watchAdd, watchRemove } from './commands';
import { recordMade, type Emit } from './events';
import { installSchedule, removeSchedule, scheduleStatus } from './schedule';
import { scout } from './scout';
import { PICK_SCHEMA, PICK_SYSTEM, pickPrompt, readPicks } from './scoutPrompt';
import { openStore } from './store';
import { compareReel, readSpec } from './compare';
import { coverPathFor } from './cover';
import { ENDINGS, isEnding, postCaption } from './endings';
import { renderCover, renderStage } from './stages/render';
import { submitScript, writeBrief } from './stages/script';
import type { FetchOpts } from './stages/fetch';
import type { Script, StageName } from './types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jobsRoot = join(root, 'jobs');
const store = openStore(root);
const pad = (n: number) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const print = (value: unknown) => console.log(JSON.stringify(value));

/** Reads config.json and .env; throws, naming what is missing, before any job is created. */
function settings() {
  loadDotenv({ path: join(root, '.env'), quiet: true });
  const config = loadConfig(root);
  return { config, env: loadEnv(process.env, config.claudeVia === 'api') };
}
const browser = () => { loadDotenv({ path: join(root, '.env'), quiet: true }); return process.env.IG_COOKIES_BROWSER?.trim() || 'chrome'; };

async function run(job: Job, saved: { url: string; file?: string; views?: number; flip?: boolean }, json: boolean, from?: StageName, until?: StageName) {
  const { config, env } = settings();
  const emit: Emit = json ? print : () => {};
  const say = json ? () => {} : (line: string) => console.log(line);
  const deps: Deps = {
    exec: realExec,
    ask: config.claudeVia === 'api' ? makeAsk(env.anthropicKey, config.model) : makeAskCli(realExec, config.subscriptionModel),
    speak: text => speak(env.elevenKey, config.voiceId, text, config.voiceModel),
    transcribe: file => transcribe(env.elevenKey, file),
    notify: env.telegramToken && env.telegramChatId ? makeNotify(env.telegramToken, env.telegramChatId) : async () => {},
    render: renderStage,
    emit,
  };
  const opts: FetchOpts = {
    ...saved, igCookiesFile: env.igCookiesFile, igCookiesBrowser: env.igCookiesBrowser,
    lookupViews: url => withSession(realExec, env.igCookiesBrowser ?? 'chrome', async get => (await mediaInfo(get, url)).plays),
  };
  say(`Job ${job.id}`);
  emit({ event: 'job', jobId: job.id, url: saved.url });
  try {
    await runPipeline(job, opts, config, deps, from, until);
  } catch {
    const s = job.status();
    console.error(`Failed at ${s?.stage}: ${s?.error}`);
    console.error(`Fix the cause, then run: npm run hook-reels -- resume ${job.id}`);
    process.exit(1);
  }
  if (until && until !== 'deliver') {
    // Stopped on purpose: whoever is driving writes the script from the brief, hands it in, then resumes.
    const brief = writeBrief(job, config);
    say(`Brief: ${brief}`);
    say(`Write the script, then run: script ${job.id} <file>, then: resume ${job.id}`);
    emit({ event: 'brief', jobId: job.id, brief, frames: job.path('frames') });
    process.exit(0);
  }
  const done = job.readJson<{ file: string; notice?: string }>('deliver.json');
  const script = job.readJson<Script>('script.json');
  try { recordMade(store, { url: saved.url, jobId: job.id, script, date: today(), copyTo: config.outputDir }); }
  catch (e) { console.error(`The reel is made, but the shortlist or the breakdowns file could not be updated: ${(e as Error).message}`); }
  say(`Done: ${done.file}`);
  if (done.notice) say(done.notice);
  emit({ event: 'done', jobId: job.id, file: done.file, caption: postCaption(script, config.cta), title: script.caption });
  process.exit(0);
}

// Quitting the app stops the engine: take the helpers down with it and leave no cookie file behind.
for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { killChildren(); dropSessions(); process.exit(143); });

const fail = (e: unknown) => { console.error((e as Error).message); process.exit(1); };
/** Runs a small command and exits non-zero with a one-line reason if it throws. */
const act = <A extends unknown[]>(fn: (...args: A) => unknown) => async (...args: A) => { try { await fn(...args); } catch (e) { fail(e); } };
const scheduleEnv = () => ({ exec: realExec, home: homedir(), uid: userInfo().uid, nodePath: process.execPath, repo: root });
const program = new Command('hook-reels').description('Turn a viral short-video link into a hook-breakdown reel.');

program.command('make <url>')
  .description('Make a reel from a video link')
  .option('--views <count>', 'view count, if the link does not report one (34000000 or 2.3m)', parseViews)
  .option('--file <path>', 'use a video file already on this Mac instead of downloading')
  .option('--flip', 'mirror the source video left to right')
  .option('--ending <name>', `how the reel ends: ${ENDINGS.join(', ')}`, 'hooks')
  .option('--json', 'report progress as JSON lines')
  .action(async (url: string, o: { views?: number; file?: string; flip?: boolean; json?: boolean; ending: string }) => {
    if (!isEnding(o.ending)) fail(new Error(`--ending must be one of: ${ENDINGS.join(', ')}`));
    try { settings(); } catch (e) { fail(e); }
    mkdirSync(jobsRoot, { recursive: true });
    const job = createJob(jobsRoot, url);
    const saved = { url, file: o.file, views: o.views, flip: o.flip, ending: o.ending };
    job.writeJson('job.json', saved);
    await run(job, saved, Boolean(o.json)).catch(fail);
  });

const makeOptions = (c: Command) => c
  .option('--views <count>', 'view count, if the link does not report one (34000000 or 2.3m)', parseViews)
  .option('--file <path>', 'use a video file already on this computer instead of downloading')
  .option('--flip', 'mirror the source video left to right')
  .option('--ending <name>', `how the reel ends: ${ENDINGS.join(', ')}`, 'hooks')
  .option('--json', 'report progress as JSON lines');

makeOptions(program.command('prepare <url>'))
  .description('Download and analyse a video, then stop and write a brief so the agent driving the engine writes the script itself')
  .action(async (url: string, o: { views?: number; file?: string; flip?: boolean; json?: boolean; ending: string }) => {
    if (!isEnding(o.ending)) fail(new Error(`--ending must be one of: ${ENDINGS.join(', ')}`));
    try { settings(); } catch (e) { fail(e); }
    mkdirSync(jobsRoot, { recursive: true });
    const job = createJob(jobsRoot, url);
    const saved = { url, file: o.file, views: o.views, flip: o.flip, ending: o.ending };
    job.writeJson('job.json', saved);
    await run(job, saved, Boolean(o.json), undefined, 'analyze').catch(fail);
  });

program.command('brief <jobId>')
  .description('Write the script brief for a prepared job again and print where it is')
  .action(act((jobId: string) => { console.log(writeBrief(openJob(jobsRoot, jobId), loadConfig(root))); }));

program.command('script <jobId> <file>')
  .description('Hand in a script written from the brief: it is checked, and saved if it passes')
  .action(act((jobId: string, file: string) => {
    const job = openJob(jobsRoot, jobId);
    let answer: unknown;
    try { answer = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { throw new Error(`${file} is not valid JSON: ${(e as Error).message}`); }
    const problems = submitScript(job, loadConfig(root), answer);
    if (problems.length) {
      console.error(`The script has ${problems.length} problem${problems.length > 1 ? 's' : ''}. Fix all of them and hand it in again:`);
      for (const p of problems) console.error(`- ${p}`);
      process.exit(1);
    }
    job.setStatus({ stage: 'script', state: 'done' });
    console.log(`Script accepted. Continue with: resume ${job.id}`);
  }));

program.command('resume <jobId>')
  .description('Continue a job: from the stage that failed, or from the stage after the last finished one')
  .option('--json', 'report progress as JSON lines')
  .action(async (jobId: string, o: { json?: boolean }) => {
    try {
      const job = openJob(jobsRoot, jobId);
      const status = job.status();
      if (status?.stage === 'deliver' && status.state === 'done') {
        console.error('This job already finished.');
        if (o.json) {
          const script = job.readJson<Script>('script.json');
          print({ event: 'done', jobId: job.id, file: job.readJson<{ file: string }>('deliver.json').file, caption: postCaption(script, loadConfig(root).cta), title: script.caption });
        }
        return;
      }
      // A stage that finished is not run again: a prepared job whose script was handed in continues with the voice.
      const from = status?.state === 'done' ? STAGES[STAGES.indexOf(status.stage) + 1] : status?.stage ?? STAGES[0];
      await run(job, job.readJson('job.json'), Boolean(o.json), from);
    } catch (e) { fail(e); }
  });

program.command('compare <specFile>')
  .description('Make a two-clip comparison reel ("this version got X views, this one got Y") from a spec file')
  .action(async (specFile: string) => {
    try {
      const { config, env } = settings();
      const spec = readSpec(specFile);
      mkdirSync(jobsRoot, { recursive: true });
      const made = await compareReel(spec, jobsRoot, config, { exec: realExec, speak: text => speak(env.elevenKey, config.voiceId, text, config.voiceModel), render: renderStage });
      console.log(`Done: ${made.file}`);
      process.exit(0);
    } catch (e) { fail(e); }
  });

program.command('cover <jobId>')
  .description('Draw (or redraw) the cover picture of a job and put it next to its reel')
  .action(async (jobId: string) => {
    try {
      const job = openJob(jobsRoot, jobId);
      const made = await renderCover(job);
      const done = job.has('deliver.json') ? job.readJson<{ file: string; cover?: string; notice?: string }>('deliver.json') : null;
      if (done && existsSync(done.file)) {
        const cover = coverPathFor(done.file);
        copyFileSync(made, cover);
        job.writeJson('deliver.json', { ...done, cover, notice: done.notice?.replace('The cover picture was not made.', '').trim() || undefined });
        console.log(cover);
      } else console.log(made);
      process.exit(0);
    } catch (e) { fail(e); }
  });

program.command('scout')
  .description('Scan the watchlist and put up to five new viral videos on today\'s shortlist')
  .action(act(async () => {
    const { config, env } = settings();
    const key = process.env.RAPIDAPI_KEY?.trim();
    if (!key) throw new Error('.env is missing: RAPIDAPI_KEY (needed to read the watched accounts)');
    const covers = join(store.dir, 'covers');
    mkdirSync(covers, { recursive: true });
    const run = (detail?: (reel: Reel) => Promise<Reel>) => scout({
      detail, budget: { everyDays: config.scanEveryDays ?? 30, perMonth: config.scanRequestsPerMonth ?? 20 },
      store, today: today(), source: makeRapidSource(key, process.env.RAPIDAPI_HOST?.trim() || undefined),
      notify: env.telegramToken && env.telegramChatId ? makeNotify(env.telegramToken, env.telegramChatId) : async () => {},
      pause: () => new Promise(r => setTimeout(r, 2000 + Math.random() * 3000)),
      saveCover: async reel => {
        if (!reel.cover) return '';
        const res = await fetch(reel.cover);
        if (!res.ok) return '';
        const file = join(covers, `${reel.shortcode}.jpg`);
        writeFileSync(file, Buffer.from(await res.arrayBuffer()));
        return file;
      },
      rank: async (pool, files) => readPicks(await askClaudeJson(realExec, { system: PICK_SYSTEM, prompt: pickPrompt(pool, files), schema: PICK_SCHEMA, dir: covers, model: config.subscriptionModel })),
    });
    // Lengths and captions come from the signed-in browser, one video at a time; without a session the scan still runs.
    let result;
    try { result = await withSession(realExec, env.igCookiesBrowser ?? 'chrome', get => run(reel => mediaInfo(get, reel.url))); }
    catch (e) { if (!(e instanceof IgAuthError)) throw e; console.error('Instagram is not logged in in Chrome, so video lengths were not checked.'); result = await run(); }
    console.log(`${result.offered} offered, ${result.requests} account ${result.requests === 1 ? 'request' : 'requests'} used (${store.requests(today().slice(0, 7))} this month)${result.broken.length ? `; could not read: ${result.broken.join(', ')}` : ''}`);
  }));

const watch = program.command('watch').description('The Instagram accounts the scout looks at');
watch.command('list').action(act(() => print(store.watchlist())));
watch.command('add <usernameOrReelLink>').action(act(async (input: string) =>
  print(await watchAdd(store, input, url => withSession(realExec, browser(), async get => (await mediaInfo(get, url)).username), today()))));
watch.command('remove <username>').action(act((username: string) => print(watchRemove(store, username))));

const shortlist = program.command('shortlist').description('The videos offered for approval');
shortlist.command('show [date]', { isDefault: true }).action(act((date?: string) => print(shortlistGet(store, date))));
shortlist.command('days').action(act(() => print(store.dates())));
shortlist.command('set <date> <shortcode> <state>').action(act((date: string, code: string, state: string) => { shortlistSet(store, date, code, state); print(shortlistGet(store, date)); }));

program.command('history').description('Every reel job, newest first').action(act(() => print(history(jobsRoot))));

const setting = program.command('settings').description('The settings the app can change');
setting.command('get', { isDefault: true }).action(act(() => print({ ...settingsGet(root), schedule: scheduleStatus(homedir()) })));
setting.command('set <key> <value>').action(act((key: string, value: string) => { settingsSet(root, key, value); print(settingsGet(root)); }));

const schedule = program.command('schedule').description('The daily scout');
schedule.command('status', { isDefault: true }).action(act(() => print(scheduleStatus(homedir()))));
schedule.command('install <time>').description('Run the scout every day at HH:MM').action(act(async (time: string) => { await installSchedule(scheduleEnv(), time); print(scheduleStatus(homedir())); }));
schedule.command('remove').action(act(async () => { await removeSchedule(scheduleEnv()); print(scheduleStatus(homedir())); }));

program.command('doctor').description('Check that everything the engine needs is in place')
  .action(act(async () => { loadDotenv({ path: join(root, '.env'), quiet: true }); print(await doctor(realExec, root, process.env)); }));

program.parseAsync().catch(fail);
