import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Status } from './types';

export type Job = {
  id: string; dir: string;
  path(name: string): string;
  readJson<T>(name: string): T;
  writeJson(name: string, value: unknown): void;
  has(name: string): boolean;
  setStatus(s: Status): void;
  status(): Status | null;
};

function make(root: string, id: string): Job {
  const dir = join(root, id);
  const path = (name: string) => join(dir, name);
  const job: Job = {
    id, dir, path,
    readJson: <T>(name: string) => JSON.parse(readFileSync(path(name), 'utf8')) as T,
    writeJson: (name, value) => writeFileSync(path(name), JSON.stringify(value, null, 2)),
    has: name => existsSync(path(name)),
    setStatus: s => job.writeJson('status.json', s),
    status: () => (job.has('status.json') ? job.readJson<Status>('status.json') : null),
  };
  return job;
}

export function createJob(root: string, url: string, now = new Date()): Job {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const job = make(root, `${stamp}-${randomBytes(3).toString('hex')}`);
  mkdirSync(job.dir, { recursive: true });
  job.writeJson('job.json', { url });
  return job;
}

export function openJob(root: string, id: string): Job {
  const job = make(root, id);
  if (!existsSync(job.dir)) throw new Error(`Job not found: ${id}`);
  return job;
}
