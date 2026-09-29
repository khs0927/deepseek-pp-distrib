import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WINDOWS_TREE_KILL_TIMEOUT_MS = 1_500;

const jobHelpers = new Map();
const jobHelperScript = join(dirname(fileURLToPath(import.meta.url)), 'windows-job-object-helper.ps1');

export function attachProcessToJobObject(child, { logLine = () => {} } = {}) {
  // The protocol suite uses this explicit diagnostic switch; production keeps
  // the Job Object path enabled unless the operator deliberately disables it.
  if (process.env.DEEPSEEK_PP_DISABLE_JOB_OBJECT === '1') {
    return Promise.resolve({ attached: false, guaranteed: false, method: 'disabled-by-environment' });
  }
  if (platform() !== 'win32' || !child || typeof child.pid !== 'number') {
    return Promise.resolve({ attached: false, guaranteed: false, method: 'not-applicable' });
  }
  if (!existsSync(jobHelperScript)) {
    return Promise.resolve({ attached: false, guaranteed: false, method: 'helper-missing' });
  }
  return new Promise(resolve => {
    let settled = false;
    const helper = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
      '-File', jobHelperScript, '-TargetPid', String(child.pid),
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let helperError = '';
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { helper.kill(); } catch { /* already closed */ }
      finish({ attached: false, guaranteed: false, method: 'helper-ready-timeout' });
    }, 2_000);
    timer.unref?.();
    helper.stdout?.on('data', chunk => {
      if (!String(chunk).includes('READY')) return;
      jobHelpers.set(child.pid, helper);
      finish({ attached: true, guaranteed: true, method: 'windows-job-object' });
    });
    helper.stderr?.on('data', chunk => {
      helperError = `${helperError}${String(chunk)}`.slice(-512);
    });
    helper.once('error', error => {
      logLine(`Windows Job Object helper failed for pid=${child.pid}: ${error.message}`);
      finish({ attached: false, guaranteed: false, method: 'helper-error' });
    });
    helper.once('close', () => {
      jobHelpers.delete(child.pid);
      if (!settled) finish({ attached: false, guaranteed: false, method: 'helper-exited', detail: helperError.trim() });
    });
    child.once('close', () => {
      jobHelpers.delete(child.pid);
      try { helper.kill(); } catch { /* already closed */ }
    });
  });
}

export function terminateProcessTree(child, { logLine = () => {}, reason = 'unknown' } = {}) {
  if (!child || typeof child.pid !== 'number') {
    return Promise.resolve({ attempted: false, method: 'none', guaranteed: false });
  }

  if (platform() !== 'win32') {
    try {
      process.kill(-child.pid, 'SIGKILL');
      return Promise.resolve({ attempted: true, method: 'process-group', guaranteed: true });
    } catch (error) {
      logLine(`Could not kill process group pid=${child.pid} reason=${reason}: ${error instanceof Error ? error.message : String(error)}`);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      return Promise.resolve({ attempted: true, method: 'direct-fallback', guaranteed: false });
    }
  }

  const jobHelper = jobHelpers.get(child.pid);
  if (jobHelper) {
    try { jobHelper.kill(); } catch { /* helper may have exited with the child */ }
    jobHelpers.delete(child.pid);
    return Promise.resolve({ attempted: true, method: 'windows-job-object', guaranteed: true });
  }

  return new Promise(resolve => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const fallback = (method, error) => {
      if (error) logLine(`taskkill failed pid=${child.pid} reason=${reason}: ${error instanceof Error ? error.message : String(error)}`);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      finish({ attempted: true, method, guaranteed: false });
    };
    const timer = setTimeout(() => fallback('direct-fallback-timeout'), WINDOWS_TREE_KILL_TIMEOUT_MS);
    timer.unref?.();
    try {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, error => {
        if (error) fallback('direct-fallback-error', error);
        else finish({ attempted: true, method: 'taskkill-tree', guaranteed: false });
      });
    } catch (error) {
      fallback('direct-fallback-throw', error);
    }
  });
}

export function destroyChildStreams(child) {
  try { child.stdin?.destroy(); } catch { /* already closed */ }
  try { child.stdout?.destroy(); } catch { /* already closed */ }
  try { child.stderr?.destroy(); } catch { /* already closed */ }
}
