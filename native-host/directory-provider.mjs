// Directory and file-search tools: read-only, shell-free helpers that return
// structured JSON without the latency of a full shell round-trip.
//
// Reference implementation of the Native Host feature-module contract (see
// docs/private-project/FEATURE_FRAMEWORK_KO.md): tool names must be declared in
// contracts.mjs TOOL_DEFINITIONS and the module is wired through
// shell-mcp-host.mjs toolHandlerGroups.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  MAX_DIR_LIST_ENTRIES,
  MAX_FILE_SEARCH_HITS,
  MAX_FILE_SEARCH_BYTES_PER_FILE,
  MAX_FILE_SEARCH_NAME_LENGTH,
} from './contracts.mjs';
import { resolveLocalPath, safeStat } from './file-provider.mjs';

export function createDirectoryToolHandlers({ logLine }) {
  function dirList(args) {
    const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
    if (!inputPath) return toolError('path is required and must be a non-empty string.');

    try {
      const resolvedPath = resolveLocalPath(inputPath);
      const stat = safeStat(resolvedPath);
      if (!stat) throw new Error(`Local path does not exist: ${resolvedPath}`);
      if (!stat.isDirectory()) throw new Error(`Local path is not a directory: ${resolvedPath}`);

      const entries = readdirSync(resolvedPath, { withFileTypes: true });
      const limit = typeof args?.limit === 'number' && args.limit >= 1
        ? Math.min(Math.floor(args.limit), MAX_DIR_LIST_ENTRIES)
        : MAX_DIR_LIST_ENTRIES;

      let matched = 0;
      const items = [];
      for (const entry of entries) {
        if (matched >= limit) break;
        let entryStat = null;
        try {
          entryStat = statSync(join(resolvedPath, entry.name));
        } catch (error) {
          // Broken symlink, EPERM, or vanished mid-scan: report the entry with
          // null metadata rather than failing the whole listing.
          entryStat = null;
        }
        items.push({
          name: entry.name,
          type: entry.isDirectory() ? 'directory' : entry.isFile() ? 'file' : 'other',
          sizeBytes: entryStat?.size ?? null,
          modifiedAt: entryStat?.mtimeMs ?? null,
          isSymlink: entry.isSymbolicLink(),
        });
        matched++;
      }

      return {
        content: [{ type: 'text', text: `Listed ${items.length} entr${items.length === 1 ? 'y' : 'ies'} in ${resolvedPath}` }],
        structuredContent: {
          ok: true,
          data: {
            path: resolvedPath,
            entries: items,
            count: items.length,
            truncated: entries.length > items.length,
            totalEntries: entries.length,
            limit,
          },
        },
      };
    } catch (error) {
      return toolError(errorMessage(error));
    }
  }

  function fileSearch(args) {
    const inputPath = typeof args?.path === 'string' ? args.path.trim() : '';
    if (!inputPath) return toolError('path is required and must be a non-empty string.');
    const pattern = typeof args?.pattern === 'string' && args.pattern.trim()
      ? args.pattern.trim()
      : '';
    if (!pattern) return toolError('pattern is required and must be a non-empty string.');
    const inContent = args?.content === true;

    try {
      const resolvedPath = resolveLocalPath(inputPath);
      const stat = safeStat(resolvedPath);
      if (!stat) throw new Error(`Local path does not exist: ${resolvedPath}`);
      if (!stat.isDirectory()) throw new Error(`Local path is not a directory: ${resolvedPath}`);

      let regex;
      try {
        regex = new RegExp(pattern);
      } catch (error) {
        return toolError(`Invalid regular expression: ${pattern} (${errorMessage(error)})`);
      }

      // Depth-bounded traversal: the walk is capped, so a huge tree can never
      // run away. Two passes keep content grep from reading unbounded bytes.
      const maxDepth = typeof args?.max_depth === 'number' && args.max_depth >= 0
        ? Math.min(Math.floor(args.max_depth), MAX_FILE_SEARCH_DEPTH)
        : MAX_FILE_SEARCH_DEPTH;

      const hits = [];
      const limits = {
        maxHits: MAX_FILE_SEARCH_HITS,
        maxBytesPerFile: MAX_FILE_SEARCH_BYTES_PER_FILE,
      };

      walk(resolvedPath, 0, maxDepth, regex, inContent, hits, limits, logLine);

      return {
        content: [{ type: 'text', text: `Found ${hits.length} match${hits.length === 1 ? '' : 'es'} under ${resolvedPath}` }],
        structuredContent: {
          ok: true,
          data: {
            path: resolvedPath,
            pattern,
            content: inContent,
            matches: hits.map((hit) => ({
              path: hit.path,
              ...(hit.lineNumber ? { lineNumber: hit.lineNumber, line: hit.line } : { matchedName: hit.matchedName }),
            })),
            count: hits.length,
            truncated: hits.length >= limits.maxHits,
          },
        },
      };
    } catch (error) {
      return toolError(errorMessage(error));
    }
  }

  return [
    { name: 'local_dir_list', handle: dirList },
    { name: 'local_file_search', handle: fileSearch },
  ];
}

const MAX_FILE_SEARCH_DEPTH = 6;

function walk(rootPath, depth, maxDepth, regex, inContent, hits, limits, logLine) {
  if (hits.length >= limits.maxHits) return;
  if (depth > maxDepth) return;

  let entries;
  try {
    entries = readdirSync(rootPath, { withFileTypes: true });
  } catch (error) {
    // Unreadable directory: skip silently, the caller asked for matches, not
    // a permission audit.
    return;
  }

  for (const entry of entries) {
    if (hits.length >= limits.maxHits) return;
    const entryPath = join(rootPath, entry.name);

    if (entry.isDirectory()) {
      walk(entryPath, depth + 1, maxDepth, regex, inContent, hits, limits, logLine);
      continue;
    }
    if (!entry.isFile()) continue;

    // Name match is cheap and needs no read.
    if (!inContent && regex.test(entry.name)) {
      hits.push({ path: entryPath, matchedName: entry.name });
      continue;
    }
    if (!inContent) continue;

    // Content match: bounded read only. A file larger than the per-file cap is
    // skipped rather than partially scanned, so a match cannot hide in the
    // unread tail while the caller believes the tree was searched.
    let stat;
    try {
      stat = statSync(entryPath);
    } catch (error) {
      continue;
    }
    if (stat.size > limits.maxBytesPerFile) continue;

    let text;
    try {
      text = readFileSync(entryPath, 'utf8');
    } catch (error) {
      continue;
    }

    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (hits.length >= limits.maxHits) return;
      if (regex.test(lines[i])) {
        hits.push({
          path: entryPath,
          lineNumber: i + 1,
          line: lines[i].slice(0, MAX_FILE_SEARCH_NAME_LENGTH),
        });
      }
    }
  }
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
