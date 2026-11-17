import { execFile, type ChildProcess } from 'node:child_process';

export type Exec = (cmd: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

const live = new Set<ChildProcess>();
/** Stops every program this process started and has not finished (called when the process is told to stop). */
export function killChildren(): void {
  for (const child of live) child.kill('SIGTERM');
  live.clear();
}

/** Runs a program and resolves with its output; rejects with its error text on a non-zero exit. */
export const realExec: Exec = (cmd, args) =>
  new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      live.delete(child);
      if (err) {
        const reason = (err as NodeJS.ErrnoException).code === 'ENOENT' ? `${cmd} is not installed` : stderr.trim().split('\n').pop() || err.message;
        reject(Object.assign(new Error(`${cmd} failed: ${reason}`), { stdout }));
      } else resolve({ stdout, stderr });
    });
    live.add(child);
  });
