// Bounded, byte-oriented parser for persistent-shell output. The marker is
// scanned independently from the retained output window, so large command
// output cannot discard the marker and turn a completed command into a timeout.

export function createSentinelOutputParser({ marker, maxOutputBytes }) {
  const markerBytes = Buffer.from(marker, 'utf8');
  let scanTail = Buffer.alloc(0);
  let markerTail = Buffer.alloc(0);
  let outputBytes = 0;
  let retainedBytes = 0;
  let outputChunks = [];
  let result = null;

  function appendOutput(chunk) {
    if (!chunk || chunk.length === 0) return;
    outputBytes += chunk.length;
    if (maxOutputBytes <= 0) return;
    if (retainedBytes >= maxOutputBytes) return;
    const part = chunk.subarray(0, maxOutputBytes - retainedBytes);
    outputChunks.push(part);
    retainedBytes += part.length;
  }

  function finishMarker(bytes) {
    const newlineIndex = bytes.indexOf(0x0a);
    if (newlineIndex < 0) return null;
    const exitText = bytes.subarray(0, newlineIndex).toString('ascii').trim();
    const match = exitText.match(/^-?\d+/);
    const exitCode = match ? Number.parseInt(match[0], 10) : 0;
    result = {
      stdout: decodeUtf8Prefix(Buffer.concat(outputChunks)),
      exitCode,
      truncated: outputBytes > maxOutputBytes,
      outputBytes,
    };
    return result;
  }

  function push(chunk) {
    if (result) return result;
    const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    let combined = markerTail.length > 0
      ? Buffer.concat([markerTail, input])
      : Buffer.concat([scanTail, input]);

    if (markerTail.length > 0) {
      markerTail = Buffer.alloc(0);
      const parsed = finishMarker(combined);
      if (parsed) return parsed;
      markerTail = combined;
      if (markerTail.length > 256) markerTail = markerTail.subarray(-256);
      return null;
    }

    const markerIndex = combined.indexOf(markerBytes);
    if (markerIndex < 0) {
      const keep = Math.max(markerBytes.length - 1, 0);
      const split = Math.max(0, combined.length - keep);
      appendOutput(combined.subarray(0, split));
      scanTail = combined.subarray(split);
      return null;
    }

    appendOutput(combined.subarray(0, markerIndex));
    scanTail = Buffer.alloc(0);
    markerTail = combined.subarray(markerIndex + markerBytes.length);
    const parsed = finishMarker(markerTail);
    if (parsed) return parsed;
    if (markerTail.length > 256) markerTail = markerTail.subarray(-256);
    return null;
  }

  return {
    push,
    snapshot() {
      return {
        stdout: decodeUtf8Prefix(Buffer.concat(outputChunks)),
        outputBytes,
        truncated: outputBytes > maxOutputBytes,
      };
    },
  };
}

export function createBoundedUtf8Collector(maxBytes) {
  let totalBytes = 0;
  let chunks = [];
  return {
    push(chunk) {
      const input = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += input.length;
      if (maxBytes <= 0) return;
      const retained = Buffer.concat(chunks);
      if (retained.length >= maxBytes) return;
      chunks = [Buffer.concat([retained, input.subarray(0, maxBytes - retained.length)])];
    },
    snapshot() {
      return {
        text: decodeUtf8Prefix(Buffer.concat(chunks)),
        totalBytes,
        truncated: totalBytes > maxBytes,
      };
    },
  };
}

export function decodeUtf8Prefix(buffer) {
  let end = buffer.length;
  if (end === 0) return '';
  // Drop an incomplete final UTF-8 sequence instead of returning U+FFFD.
  let start = end - 1;
  while (start >= 0 && (buffer[start] & 0xc0) === 0x80) start--;
  if (start >= 0) {
    const lead = buffer[start];
    const expected = lead < 0x80 ? 1 : lead >= 0xf0 ? 4 : lead >= 0xe0 ? 3 : 2;
    if (end - start < expected) end = start;
  }
  return buffer.subarray(0, end).toString('utf8');
}
