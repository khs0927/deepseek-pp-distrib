// Background task provider: long-running commands that must NOT block the
// shell. A task is a detached child whose stdout/stderr are captured into a
// bounded tail window; task_status reports the window and task_kill tears down
// the whole process tree.
//
// This module is a reference implementation of the Native Host feature-module
// contract (see docs/private-project/FEATURE_FRAMEWORK_KO.md):
//   - every tool name it handles MUST be declared in contracts.mjs
//     TOOL_DEFINITIONS (the router fails closed otherwise), and
//   - it is assembled in shell-mcp-host.mjs through toolHandlerGroups, and
//   - it owns its whole lifecycle, including a shutdown() used at host exit.

import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { homedir, platform } from 'node:os';
import { DEFAULT_SHELL, MAX_TASKS, MAX_TASK_OUTPUT_BYTES } from './contracts.mjs';
import { createChildEnv, createShellInvocation } from './os-adapter.mjs';
import { terminateProcessTree } from './process-lifecycle.mjs';

export function createTaskToolHandlers({ logLine }) {
  // task_id -> task record. Bounded by MAX_TASKS so a runaway caller cannot
  // grow the host without limit; the oldest task is reaped (its process tree
  // is killed) to make room, mirroring an LRU eviction.
  const tasks = new Map();

  async function spawnTask(args) {
    const command = typeof args?.command === 'string' ? args.command.trim() : '';
    if (!command) return toolError('command is required and must be a non-empty string.');

    const name = typeof args?.name === 'string' && args.name.trim()
      ? args.name.trim().slice(0, 120)
      : command.slice(0, 80);
    const cwd = typeof args?.cwd === 'string' && args.cwd.trim() ? args.cwd.trim() : homedir();
    const env = createChildEnv(args?.env);

    if (tasks.size >= MAX_TASKS) {
      const oldest = [...tasks.values()].find((candidate) => candidate.state !== 'running')
        ?? tasks.values().next().value;
      if (oldest) {
        if (oldest.state === 'running') await killTaskTree(oldest.id, 'max_tasks_reached');
        if (oldest.state === 'outcome_unknown' || oldest.state === 'terminating') {
          return toolError('Task capacity is full and an existing process could not be confirmed as terminated. Retry after task_status confirms an inactive task.');
        }
        tasks.delete(oldest.id);
      }
    }

    const { shellBin, shellArgs } = createShellInvocation(command);
    let child;
    try {
      // detached on POSIX puts the task in its own process group so the tree
      // can be signalled with a negative PID and the task survives the host's
      // own stdio plumbing. Windows has no process groups; tree kill goes
      // through taskkill /T instead (see killTaskProcessTree).
      const spawnOptions = {
        cwd,
        env,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      };
      if (platform() !== 'win32') spawnOptions.detached = true;
      child = spawn(shellBin, shellArgs, spawnOptions);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logLine(`task_spawn ERROR command=${command.slice(0, 80)} error=${message}`);
      return toolError(`Failed to spawn background task: ${message}`);
    }

    const taskId = randomUUID();
    let resolveExit;
    const exitPromise = new Promise((resolve) => { resolveExit = resolve; });
    const task = {
      id: taskId,
      name,
      command,
      shell: shellBin,
      cwd,
      pid: typeof child.pid === 'number' ? child.pid : null,
      state: 'running',
      exitCode: null,
      signal: null,
      startedAt: Date.now(),
      finishedAt: null,
      stdoutBuf: Buffer.alloc(0),
      stderrBuf: Buffer.alloc(0),
      stdoutBytes: 0,
      stderrBytes: 0,
      child,
      exitPromise,
      resolveExit,
    };
    tasks.set(taskId, task);
    logLine(`task_spawn OK id=${taskId} pid=${task.pid} command=${command.slice(0, 120)}`);

    // Incremental capture: append and keep only the trailing window so memory
    // stays bounded for tasks that log continuously (dev servers, watchers).
    const capture = (target) => (chunk) => {
      task[`${target}Bytes`] += chunk.length;
      const combined = Buffer.concat([task[`${target}Buf`], chunk]);
      task[`${target}Buf`] = combined.length > MAX_TASK_OUTPUT_BYTES
        ? combined.subarray(combined.length - MAX_TASK_OUTPUT_BYTES)
        : combined;
    };
    child.stdout.on('data', capture('stdout'));
    child.stderr.on('data', capture('stderr'));

    child.on('exit', (exitCode, signal) => {
      if (task.state === 'running') {
        task.state = exitCode === 0 ? 'exited' : 'failed';
        if (task.state === 'failed' && exitCode === null && signal) task.state = 'killed';
      } else if (task.state === 'terminating') {
        task.state = 'killed';
      }
      task.exitCode = exitCode ?? null;
      task.signal = signal;
      task.finishedAt = Date.now();
      task.resolveExit?.();
      logLine(`task ended id=${taskId} state=${task.state} exitCode=${exitCode} signal=${signal ?? 'none'}`);
    });
    child.on('error', (error) => {
      task.state = 'failed';
      task.finishedAt = Date.now();
      task.resolveExit?.();
      const message = error instanceof Error ? error.message : String(error);
      appendText(task, 'stderr', `[task spawn error] ${message}\n`);
      logLine(`task error id=${taskId} error=${message}`);
    });

    return {
      content: [{ type: 'text', text: `Background task ${taskId} started (${name}).` }],
      structuredContent: {
        ok: true,
        data: {
          task_id: taskId,
          name,
          command,
          shell: shellBin,
          cwd,
          pid: task.pid,
          state: task.state,
          startedAt: task.startedAt,
        },
      },
    };
  }

  function appendText(task, target, text) {
    const chunk = Buffer.from(text, 'utf8');
    task[`${target}Bytes`] += chunk.length;
    const combined = Buffer.concat([task[`${target}Buf`], chunk]);
    task[`${target}Buf`] = combined.length > MAX_TASK_OUTPUT_BYTES
      ? combined.subarray(combined.length - MAX_TASK_OUTPUT_BYTES)
      : combined;
  }

  function taskStatus(args) {
    const taskId = typeof args?.task_id === 'string' ? args.task_id.trim() : '';
    if (!taskId) return toolError('task_id is required and must be a non-empty string.');

    const task = tasks.get(taskId);
    if (!task) {
      return toolError(`Task not found: ${taskId}. Use task_list to see current tasks; finished tasks are kept until the task window is full.`);
    }

    const tailBytes = typeof args?.tail_bytes === 'number' && args.tail_bytes >= 0
      ? Math.min(Math.floor(args.tail_bytes), MAX_TASK_OUTPUT_BYTES)
      : MAX_TASK_OUTPUT_BYTES;

    const stdout = tailWindow(task.stdoutBuf, tailBytes);
    const stderr = tailWindow(task.stderrBuf, tailBytes);
    return {
      content: [{ type: 'text', text: formatTaskSummary(task) }],
      structuredContent: {
        ok: true,
        data: {
          task_id: task.id,
          name: task.name,
          command: task.command,
          state: task.state,
          exitCode: task.exitCode,
          signal: task.signal,
          pid: task.pid,
          startedAt: task.startedAt,
          finishedAt: task.finishedAt,
          stdout,
          stderr,
          stdoutBytes: task.stdoutBytes,
          stderrBytes: task.stderrBytes,
          truncated: task.stdoutBytes > MAX_TASK_OUTPUT_BYTES || task.stderrBytes > MAX_TASK_OUTPUT_BYTES,
        },
      },
    };
  }

  function taskList() {
    const summary = [...tasks.values()].map((task) => ({
      task_id: task.id,
      name: task.name,
      command: task.command,
      state: task.state,
      exitCode: task.exitCode,
      pid: task.pid,
      startedAt: task.startedAt,
      finishedAt: task.finishedAt,
      stdoutBytes: task.stdoutBytes,
      stderrBytes: task.stderrBytes,
    }));
    return {
      content: [{ type: 'text', text: `${summary.length} task(s).` }],
      structuredContent: { ok: true, data: { tasks: summary, count: summary.length } },
    };
  }

  async function taskKill(args) {
    const taskId = typeof args?.task_id === 'string' ? args.task_id.trim() : '';
    if (!taskId) return toolError('task_id is required and must be a non-empty string.');

    const task = tasks.get(taskId);
    if (!task) return toolError(`Task not found: ${taskId}.`);
    if (task.state !== 'running') {
      return {
        content: [{ type: 'text', text: `Task ${taskId} is already ${task.state} (exitCode ${task.exitCode}).` }],
        structuredContent: { ok: true, data: { task_id: taskId, state: task.state, closed: false } },
      };
    }
    const termination = await killTaskTree(taskId, 'task_kill');
    const after = tasks.get(taskId);
    const closed = after?.state === 'killed' || after?.state === 'exited';
    return {
      isError: !closed,
      content: [{ type: 'text', text: closed ? `Task ${taskId} killed.` : `Task ${taskId} termination is unconfirmed.` }],
      structuredContent: {
        ok: closed,
        data: { task_id: taskId, state: after?.state ?? 'outcome_unknown', closed, termination },
      },
    };
  }

  // Kill one task's process tree and mark it killed. Idempotent: safe to call
  // for an already-exited task (the record simply reflects the prior state).
  async function killTaskTree(taskId, reason) {
    const task = tasks.get(taskId);
    if (!task) return { attempted: false, method: 'none', guaranteed: false };
    if (task.state === 'running') {
      task.state = 'terminating';
      task.finishedAt = Date.now();
    }
    const termination = task.child.exitCode === null && typeof task.child.pid === 'number'
      ? await terminateProcessTree(task.child, { logLine, reason })
      : { attempted: false, method: 'already-exited', guaranteed: false };
    let exited = true;
    if (task.state === 'terminating') {
      exited = await Promise.race([
        task.exitPromise.then(() => true),
        new Promise((resolve) => setTimeout(() => resolve(false), 5_000)),
      ]);
      task.state = exited ? 'killed' : 'outcome_unknown';
    }
    logLine(`task killed id=${taskId} reason=${reason}`);
    return { ...termination, exited };
  }

  async function shutdown() {
    await Promise.all([...tasks.keys()].map(taskId => killTaskTree(taskId, 'host_shutdown')));
    tasks.clear();
  }

  return {
    handlers: [
      { name: 'task_spawn', handle: spawnTask },
      { name: 'task_status', handle: taskStatus },
      { name: 'task_kill', handle: async (args) => taskKill(args) },
      { name: 'task_list', handle: taskList },
    ],
    shutdown,
  };
}

function tailWindow(buffer, maxBytes) {
  if (maxBytes <= 0) return '';
  if (buffer.length <= maxBytes) return buffer.toString('utf8');
  // Start at a UTF-8 character boundary: a leading continuation byte would
  // decode to U+FFFD and corrupt the reported log window.
  let start = buffer.length - maxBytes;
  while (start < buffer.length && (buffer[start] & 0xC0) === 0x80) start++;
  return buffer.subarray(start).toString('utf8');
}

function formatTaskSummary(task) {
  const parts = [`# ${task.name} [${task.state}]`];
  parts.push(`$ ${task.command}`);
  if (task.exitCode !== null && task.exitCode !== 0) parts.push(`[exit ${task.exitCode}]`);
  if (task.stdoutBuf.length) parts.push(task.stdoutBuf.toString('utf8').slice(-4000));
  if (task.stderrBuf.length) parts.push(`STDERR: ${task.stderrBuf.toString('utf8').slice(-2000)}`);
  return parts.join('\n') || '(no output yet)';
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}
