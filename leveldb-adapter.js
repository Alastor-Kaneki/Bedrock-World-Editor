/**
 * Minimal browser-side LevelDB reader/writer for Minecraft Bedrock world DBs.
 *
 * Scope:
 * - Reads standard LevelDB WAL records.
 * - Reads exact keys from live .ldb/.sst tables (no compression, Snappy, and
 *   best-effort compression type 2 via browser decompression streams).
 * - Parses CURRENT/MANIFEST enough to identify live tables, the current log
 *   floor, next file number, and last sequence.
 * - Writes edits safely as a NEW write-ahead log file. LevelDB recovery scans
 *   newer eligible log files on the next open, so this avoids rewriting SSTs.
 *
 * It is intentionally not a full arbitrary-key/chunk database engine yet.
 */

const BLOCK_SIZE = 32768;
const LOG_HEADER = 7;
const TABLE_FOOTER = 48;
const TABLE_MAGIC = 0xdb4775248b80fb57n;
const enc = new TextEncoder();
const dec = new TextDecoder();

function asU8(v) {
  if (v instanceof Uint8Array) return v;
  if (typeof v === 'string') return enc.encode(v);
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  return Uint8Array.from(v || []);
}

function concat(parts) {
  const size = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(size);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function compareBytes(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
  return a.length === b.length ? 0 : a.length < b.length ? -1 : 1;
}

function readFixed32(bytes, o) {
  if (o + 4 > bytes.length) throw new Error('Unexpected EOF reading fixed32');
  return (bytes[o] | (bytes[o + 1] << 8) | (bytes[o + 2] << 16) | (bytes[o + 3] << 24)) >>> 0;
}

function readFixed64(bytes, o) {
  if (o + 8 > bytes.length) throw new Error('Unexpected EOF reading fixed64');
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[o + i]);
  return v;
}

function fixed32(v) {
  v >>>= 0;
  return Uint8Array.of(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255);
}

function fixed64(v) {
  v = BigInt(v);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { out[i] = Number(v & 255n); v >>= 8n; }
  return out;
}

function readVarint(bytes, start = 0, maxBytes = 10) {
  let v = 0n, shift = 0n, o = start;
  for (let i = 0; i < maxBytes && o < bytes.length; i++, o++) {
    const b = bytes[o];
    v |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value: v, next: o + 1 };
    shift += 7n;
  }
  throw new Error('Malformed varint');
}

function writeVarint(v) {
  v = BigInt(v);
  if (v < 0n) throw new Error('Varint cannot be negative');
  const a = [];
  do {
    let b = Number(v & 0x7fn); v >>= 7n;
    if (v) b |= 0x80;
    a.push(b);
  } while (v);
  return Uint8Array.from(a);
}

function readLengthPrefixed(bytes, start) {
  const n = readVarint(bytes, start, 5);
  const len = Number(n.value);
  if (!Number.isSafeInteger(len) || n.next + len > bytes.length) throw new Error('Bad length-prefixed slice');
  return { value: bytes.subarray(n.next, n.next + len), next: n.next + len };
}

function writeLengthPrefixed(bytes) {
  bytes = asU8(bytes);
  return concat([writeVarint(bytes.length), bytes]);
}

// CRC32C (Castagnoli), matching LevelDB's pre/post-conditioning.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0x82f63b78 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32cExtend(init, bytes) {
  let c = (init ^ 0xffffffff) >>> 0;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}
function crc32c(bytes) { return crc32cExtend(0, bytes); }
function crcMask(crc) { return ((((crc >>> 15) | (crc << 17)) >>> 0) + 0xa282ead8) >>> 0; }
function crcUnmask(masked) {
  const rot = (masked - 0xa282ead8) >>> 0;
  return ((rot >>> 17) | (rot << 15)) >>> 0;
}

function parseLogRecords(bytes, { verify = true } = {}) {
  bytes = asU8(bytes);
  const logical = [];
  let fragments = null;
  let o = 0;
  while (o + LOG_HEADER <= bytes.length) {
    const blockOff = o % BLOCK_SIZE;
    const leftover = BLOCK_SIZE - blockOff;
    if (leftover < LOG_HEADER) { o += leftover; continue; }
    const storedCrc = readFixed32(bytes, o);
    const len = bytes[o + 4] | (bytes[o + 5] << 8);
    const type = bytes[o + 6];
    if (type === 0 && len === 0) {
      // Preallocated/padding area. Jump to the next physical block.
      o += leftover;
      continue;
    }
    if (len > leftover - LOG_HEADER || o + LOG_HEADER + len > bytes.length) break;
    const payload = bytes.slice(o + LOG_HEADER, o + LOG_HEADER + len);
    o += LOG_HEADER + len;
    if (verify) {
      const calc = crc32cExtend(crc32c(Uint8Array.of(type)), payload);
      if (calc !== crcUnmask(storedCrc)) { fragments = null; continue; }
    }
    if (type === 1) { logical.push(payload); fragments = null; }
    else if (type === 2) fragments = [payload];
    else if (type === 3 && fragments) fragments.push(payload);
    else if (type === 4 && fragments) { fragments.push(payload); logical.push(concat(fragments)); fragments = null; }
    else fragments = null;
  }
  return logical;
}

function parseWriteBatch(record) {
  record = asU8(record);
  if (record.length < 12) throw new Error('WriteBatch is too short');
  const sequence = readFixed64(record, 0);
  const count = readFixed32(record, 8);
  const entries = [];
  let o = 12;
  for (let i = 0; i < count; i++) {
    if (o >= record.length) throw new Error('Truncated WriteBatch');
    const type = record[o++];
    const key = readLengthPrefixed(record, o); o = key.next;
    if (type === 1) {
      const value = readLengthPrefixed(record, o); o = value.next;
      entries.push({ type: 'put', key: key.value.slice(), value: value.value.slice(), sequence: sequence + BigInt(i) });
    } else if (type === 0) {
      entries.push({ type: 'del', key: key.value.slice(), value: null, sequence: sequence + BigInt(i) });
    } else throw new Error(`Unknown WriteBatch entry type ${type}`);
  }
  return { sequence, count, entries };
}

function buildWriteBatch(sequence, operations) {
  const parts = [fixed64(sequence), fixed32(operations.length)];
  for (const op of operations) {
    const key = asU8(op.key);
    if (op.type === 'del') parts.push(Uint8Array.of(0), writeLengthPrefixed(key));
    else parts.push(Uint8Array.of(1), writeLengthPrefixed(key), writeLengthPrefixed(asU8(op.value)));
  }
  return concat(parts);
}

function buildLogFile(record) {
  record = asU8(record);
  const out = [];
  let o = 0, blockOff = 0, begin = true;
  do {
    let leftover = BLOCK_SIZE - blockOff;
    if (leftover < LOG_HEADER) {
      if (leftover) out.push(new Uint8Array(leftover));
      blockOff = 0; leftover = BLOCK_SIZE;
    }
    const avail = leftover - LOG_HEADER;
    const len = Math.min(record.length - o, avail);
    const end = o + len === record.length;
    const type = begin && end ? 1 : begin ? 2 : end ? 4 : 3;
    const payload = record.subarray(o, o + len);
    const crc = crcMask(crc32cExtend(crc32c(Uint8Array.of(type)), payload));
    out.push(fixed32(crc), Uint8Array.of(len & 255, (len >>> 8) & 255, type), payload.slice());
    blockOff += LOG_HEADER + len;
    o += len; begin = false;
  } while (o < record.length || (record.length === 0 && begin));
  return concat(out);
}

function decodeBlockHandle(bytes, start = 0) {
  const a = readVarint(bytes, start); const b = readVarint(bytes, a.next);
  const offset = Number(a.value), size = Number(b.value);
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size)) throw new Error('Table block offset is too large for this browser');
  return { offset, size, next: b.next };
}

function parseBlockEntries(block) {
  block = asU8(block);
  if (block.length < 4) throw new Error('LevelDB block is too small');
  const restartCount = readFixed32(block, block.length - 4);
  const restartBytes = (restartCount + 1) * 4;
  if (restartBytes > block.length) throw new Error('Invalid LevelDB restart table');
  const dataEnd = block.length - restartBytes;
  const entries = [];
  let o = 0, previous = new Uint8Array();
  while (o < dataEnd) {
    const s = readVarint(block, o, 5); o = s.next;
    const n = readVarint(block, o, 5); o = n.next;
    const v = readVarint(block, o, 5); o = v.next;
    const shared = Number(s.value), nonShared = Number(n.value), valueLen = Number(v.value);
    if (shared > previous.length || o + nonShared + valueLen > dataEnd) throw new Error('Invalid LevelDB block entry');
    const key = new Uint8Array(shared + nonShared);
    key.set(previous.subarray(0, shared)); key.set(block.subarray(o, o + nonShared), shared); o += nonShared;
    const value = block.slice(o, o + valueLen); o += valueLen;
    entries.push({ key, value }); previous = key;
  }
  return entries;
}

function internalKeyInfo(key) {
  if (key.length < 8) return { userKey: key, sequence: 0n, type: 1 };
  const packed = readFixed64(key, key.length - 8);
  return { userKey: key.subarray(0, key.length - 8), sequence: packed >> 8n, type: Number(packed & 255n) };
}

function snappyDecompress(input) {
  input = asU8(input);
  let h = readVarint(input, 0, 5), expected = Number(h.value), o = h.next, out = new Uint8Array(expected), w = 0;
  if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('Invalid Snappy length');
  while (o < input.length && w < expected) {
    const tag = input[o++], kind = tag & 3;
    if (kind === 0) {
      let len = tag >>> 2;
      if (len < 60) len += 1;
      else {
        const extra = len - 59; if (o + extra > input.length) throw new Error('Truncated Snappy literal');
        len = 0; for (let i = 0; i < extra; i++) len |= input[o++] << (8 * i); len += 1;
      }
      if (o + len > input.length || w + len > out.length) throw new Error('Invalid Snappy literal');
      out.set(input.subarray(o, o + len), w); o += len; w += len;
    } else {
      let len, offset;
      if (kind === 1) { len = 4 + ((tag >>> 2) & 7); if (o >= input.length) throw new Error('Truncated Snappy copy'); offset = ((tag & 0xe0) << 3) | input[o++]; }
      else if (kind === 2) { len = 1 + (tag >>> 2); if (o + 2 > input.length) throw new Error('Truncated Snappy copy'); offset = input[o] | (input[o + 1] << 8); o += 2; }
      else { len = 1 + (tag >>> 2); if (o + 4 > input.length) throw new Error('Truncated Snappy copy'); offset = readFixed32(input, o); o += 4; }
      if (!offset || offset > w || w + len > out.length) throw new Error('Invalid Snappy copy offset');
      for (let i = 0; i < len; i++) out[w + i] = out[w - offset + i];
      w += len;
    }
  }
  if (w !== expected) throw new Error(`Snappy output length mismatch (${w}/${expected})`);
  return out;
}

async function streamDecompress(bytes, format) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Browser DecompressionStream is unavailable');
  const ds = new DecompressionStream(format);
  const ab = await new Response(new Blob([bytes]).stream().pipeThrough(ds)).arrayBuffer();
  return new Uint8Array(ab);
}

async function decompressBlock(bytes, type) {
  if (type === 0) return bytes.slice();
  if (type === 1) return snappyDecompress(bytes);
  if (type === 2) {
    // Some Bedrock LevelDB builds use a custom compression mode at this slot;
    // newer upstream LevelDB uses Zstd. Try what the current browser supports.
    for (const format of ['zstd', 'deflate', 'deflate-raw']) {
      try { return await streamDecompress(bytes, format); } catch (_) {}
    }
    throw new Error('Compression type 2 is not supported by this browser build');
  }
  throw new Error(`Unsupported LevelDB block compression type ${type}`);
}

async function readTableBlock(file, handle) {
  if (handle.offset < 0 || handle.size < 0 || handle.offset + handle.size + 5 > file.length) throw new Error('Invalid LevelDB block handle');
  const stored = file.subarray(handle.offset, handle.offset + handle.size);
  const type = file[handle.offset + handle.size];
  return decompressBlock(stored, type);
}

async function tableGet(file, target) {
  file = asU8(file); target = asU8(target);
  if (file.length < TABLE_FOOTER) return null;
  const magic = readFixed64(file, file.length - 8);
  if (magic !== TABLE_MAGIC) return null;
  const footer = file.subarray(file.length - TABLE_FOOTER, file.length - 8);
  let h = decodeBlockHandle(footer, 0); // metaindex
  h = decodeBlockHandle(footer, h.next); // index
  const indexBlock = await readTableBlock(file, h);
  const index = parseBlockEntries(indexBlock);
  if (!index.length) return null;
  let chosen = index[index.length - 1];
  for (const e of index) {
    const ik = internalKeyInfo(e.key);
    if (compareBytes(ik.userKey, target) >= 0) { chosen = e; break; }
  }
  const handle = decodeBlockHandle(chosen.value, 0);
  const dataBlock = await readTableBlock(file, handle);
  let best = null;
  for (const e of parseBlockEntries(dataBlock)) {
    const ik = internalKeyInfo(e.key);
    if (!bytesEqual(ik.userKey, target)) continue;
    if (!best || ik.sequence > best.sequence) best = { sequence: ik.sequence, type: ik.type, value: e.value.slice() };
  }
  return best;
}

function parseVersionEdit(record, state) {
  let o = 0;
  try {
    while (o < record.length) {
      let r = readVarint(record, o, 5); const tag = Number(r.value); o = r.next;
      if (tag === 1) { r = readLengthPrefixed(record, o); o = r.next; }
      else if (tag === 2 || tag === 3 || tag === 4 || tag === 9) {
        r = readVarint(record, o); o = r.next;
        if (tag === 2) state.logNumber = r.value;
        if (tag === 3) state.nextFileNumber = r.value;
        if (tag === 4) state.lastSequence = r.value;
        if (tag === 9) state.prevLogNumber = r.value;
      } else if (tag === 5) {
        r = readVarint(record, o, 5); o = r.next; r = readLengthPrefixed(record, o); o = r.next;
      } else if (tag === 6) {
        let level = readVarint(record, o, 5); o = level.next; let num = readVarint(record, o); o = num.next;
        state.liveFiles.delete(`${Number(level.value)}:${num.value}`);
      } else if (tag === 7) {
        let level = readVarint(record, o, 5); o = level.next;
        let num = readVarint(record, o); o = num.next;
        let size = readVarint(record, o); o = size.next;
        let smallest = readLengthPrefixed(record, o); o = smallest.next;
        let largest = readLengthPrefixed(record, o); o = largest.next;
        state.liveFiles.set(`${Number(level.value)}:${num.value}`, { level: Number(level.value), number: num.value, size: size.value });
      } else break;
    }
  } catch (_) {
    // A partially understood manifest should still be useful for its earlier fields.
  }
}

function detectDbPrefix(files) {
  for (const p of Object.keys(files || {})) {
    const m = p.match(/^(.*\/)?db\//);
    if (m) return m[0];
  }
  return null;
}

function numericFileNumber(name) {
  const m = name.match(/(?:^|\/)(\d+)\.(?:log|ldb|sst)$/i);
  return m ? BigInt(m[1]) : null;
}

function parseManifest(files, prefix) {
  const info = { manifestPath: null, logNumber: 0n, prevLogNumber: 0n, nextFileNumber: 0n, lastSequence: 0n, liveFiles: new Map(), warning: null };
  const current = files[`${prefix}CURRENT`];
  let manifestName = null;
  if (current) manifestName = dec.decode(current).trim().replace(/\0/g, '');
  if (!manifestName) {
    const manifests = Object.keys(files).filter(p => p.startsWith(prefix) && /MANIFEST-\d+$/i.test(p)).sort();
    if (manifests.length) manifestName = manifests[manifests.length - 1].slice(prefix.length);
  }
  if (!manifestName) { info.warning = 'CURRENT/MANIFEST not found; using conservative LevelDB fallbacks.'; return info; }
  const path = `${prefix}${manifestName}`; const bytes = files[path];
  if (!bytes) { info.warning = `${manifestName} is referenced but missing.`; return info; }
  info.manifestPath = path;
  for (const record of parseLogRecords(bytes)) parseVersionEdit(record, info);
  return info;
}

export class BedrockLevelDBAdapter {
  constructor() {
    this.files = null;
    this.prefix = null;
    this.info = null;
    this.pending = new Map();
    this.opened = false;
    this.maxLogSequence = 0n;
    this.tableWarnings = [];
  }

  async open(files) {
    this.files = files || {};
    this.prefix = detectDbPrefix(this.files);
    if (!this.prefix) throw new Error('No Bedrock db/ directory found.');
    this.info = parseManifest(this.files, this.prefix);
    this.maxLogSequence = 0n;
    this.tableWarnings = [];
    for (const p of this._eligibleLogs()) {
      try {
        for (const record of parseLogRecords(this.files[p])) {
          const batch = parseWriteBatch(record);
          if (batch.count) this.maxLogSequence = this.maxLogSequence > (batch.sequence + BigInt(batch.count) - 1n) ? this.maxLogSequence : (batch.sequence + BigInt(batch.count) - 1n);
        }
      } catch (_) {}
    }
    this.opened = true;
    return this.diagnostics();
  }

  _dbPaths(rx) { return Object.keys(this.files).filter(p => p.startsWith(this.prefix) && rx.test(p.slice(this.prefix.length))); }

  _eligibleLogs() {
    const all = this._dbPaths(/^\d+\.log$/i).sort((a, b) => Number(numericFileNumber(a) - numericFileNumber(b)));
    if (!this.info) return all;
    const min = this.info.logNumber || 0n, prev = this.info.prevLogNumber || 0n;
    return all.filter(p => { const n = numericFileNumber(p); return n !== null && (n >= min || n === prev); });
  }

  _tablePaths() {
    const all = this._dbPaths(/^\d+\.(?:ldb|sst)$/i);
    if (!this.info?.liveFiles?.size) return all;
    const live = new Set([...this.info.liveFiles.values()].map(x => x.number.toString()));
    const filtered = all.filter(p => live.has(numericFileNumber(p)?.toString()));
    return filtered.length ? filtered : all;
  }

  async keys() {
    // Full table scans can be enormous; expose keys observed in eligible WALs.
    const found = new Map();
    for (const p of this._eligibleLogs()) {
      try {
        for (const record of parseLogRecords(this.files[p])) for (const e of parseWriteBatch(record).entries) found.set(bytesToHex(e.key), e.key);
      } catch (_) {}
    }
    return [...found.values()];
  }

  async get(key) {
    if (!this.opened) throw new Error('LevelDB adapter is not open');
    key = asU8(key);
    let best = null;
    for (const p of this._tablePaths()) {
      try {
        const hit = await tableGet(this.files[p], key);
        if (hit && (!best || hit.sequence > best.sequence)) best = { ...hit, source: p };
      } catch (e) {
        if (this.tableWarnings.length < 8) this.tableWarnings.push(`${p}: ${e.message}`);
      }
    }
    for (const p of this._eligibleLogs()) {
      try {
        for (const record of parseLogRecords(this.files[p])) {
          for (const e of parseWriteBatch(record).entries) {
            if (!bytesEqual(e.key, key)) continue;
            if (!best || e.sequence > best.sequence) best = { sequence: e.sequence, type: e.type === 'put' ? 1 : 0, value: e.value, source: p };
          }
        }
      } catch (_) {}
    }
    const pending = this.pending.get(bytesToHex(key));
    if (pending) return pending.type === 'del' ? null : { key: key.slice(), value: pending.value.slice(), sequence: this._nextSequence(), source: 'pending WAL overlay', pending: true };
    if (!best || best.type === 0) return null;
    return { key: key.slice(), value: best.value.slice(), sequence: best.sequence, source: best.source };
  }

  async put(key, value) {
    if (!this.opened) throw new Error('LevelDB adapter is not open');
    key = asU8(key); value = asU8(value);
    this.pending.set(bytesToHex(key), { type: 'put', key: key.slice(), value: value.slice() });
  }

  async del(key) {
    if (!this.opened) throw new Error('LevelDB adapter is not open');
    key = asU8(key); this.pending.set(bytesToHex(key), { type: 'del', key: key.slice(), value: null });
  }

  _nextSequence() {
    const manifestSeq = this.info?.lastSequence || 0n;
    return (manifestSeq > this.maxLogSequence ? manifestSeq : this.maxLogSequence) + 1n;
  }

  _nextFileNumber() {
    let max = 0n;
    for (const p of this._dbPaths(/^\d+\.(?:log|ldb|sst)$/i)) { const n = numericFileNumber(p); if (n !== null && n > max) max = n; }
    const suggested = this.info?.nextFileNumber || 0n;
    if (suggested > max) max = suggested - 1n;
    return max + 1n;
  }

  async exportFiles() {
    if (!this.pending.size) return {};
    const operations = [...this.pending.values()];
    const sequence = this._nextSequence();
    const batch = buildWriteBatch(sequence, operations);
    const log = buildLogFile(batch);
    const fileNo = this._nextFileNumber();
    const name = `${fileNo.toString().padStart(6, '0')}.log`;
    return { [`${this.prefix}${name}`]: log };
  }

  diagnostics() {
    const tables = this._tablePaths(); const logs = this._eligibleLogs();
    return {
      prefix: this.prefix,
      manifestPath: this.info?.manifestPath || null,
      manifestWarning: this.info?.warning || null,
      logNumber: this.info?.logNumber || 0n,
      lastSequence: this.info?.lastSequence || 0n,
      maxLogSequence: this.maxLogSequence,
      nextFileNumber: this.info?.nextFileNumber || 0n,
      liveTableCount: this.info?.liveFiles?.size || tables.length,
      tableCount: tables.length,
      logCount: logs.length,
      pendingCount: this.pending.size,
      tableWarnings: [...this.tableWarnings],
    };
  }

  async close() { this.opened = false; }
}

function bytesToHex(bytes) { return [...bytes].map(b => b.toString(16).padStart(2, '0')).join(''); }

export const LevelDBInternals = {
  parseLogRecords,
  parseWriteBatch,
  buildWriteBatch,
  buildLogFile,
  parseBlockEntries,
  snappyDecompress,
  crc32c,
  crcMask,
  crcUnmask,
};
