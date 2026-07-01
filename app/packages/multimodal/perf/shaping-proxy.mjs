#!/usr/bin/env node
/**
 * Network-shaping reverse proxy for MCAP playback performance capture.
 *
 * Emulates object-storage-like transport (per-request first-byte latency and
 * a shared link bandwidth cap) in front of a local FiftyOne server, so remote
 * playback behavior can be measured deterministically and repeatably.
 *
 * Shaping applies only to matched paths (default: /media). Everything else
 * (GraphQL, SSE events, plugins) streams through unshaped so app chrome does
 * not add noise to media measurements.
 *
 * Every request is logged as JSONL for ground-truth timeline analysis
 * (request concurrency, serialization, and byte pressure independent of
 * in-app instrumentation).
 *
 * Usage:
 *   node shaping-proxy.mjs --listen 5153 --target http://127.0.0.1:5152 \
 *     --profile remote-typical --log ./runs/proxy.jsonl
 *
 * Profiles can be overridden piecemeal with --latency-ms and --mbps.
 */

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { URL } from "node:url";

const SHAPE_PROFILES = {
  // Control profile: proxy in the path (so logging is identical) but no
  // added latency or bandwidth cap.
  local: { latencyMs: 0, mbps: Infinity },
  // Same-region object storage on a strong corporate link.
  "remote-fast": { latencyMs: 40, mbps: 1000 },
  // Cross-region object storage or VPN-fronted link.
  "remote-typical": { latencyMs: 100, mbps: 200 },
  // Distant region / constrained home link.
  "remote-slow": { latencyMs: 180, mbps: 60 },
};

const args = parseArgs(process.argv.slice(2));
const listenPort = Number(args["listen"] ?? 5153);
const target = new URL(args["target"] ?? "http://127.0.0.1:5152");
const profileName = args["profile"] ?? "local";
const profile = SHAPE_PROFILES[profileName];
if (!profile) {
  console.error(
    `Unknown profile '${profileName}'. Known: ${Object.keys(
      SHAPE_PROFILES,
    ).join(", ")}`,
  );
  process.exit(1);
}
const latencyMs = args["latency-ms"]
  ? Number(args["latency-ms"])
  : profile.latencyMs;
const mbps = args["mbps"] ? Number(args["mbps"]) : profile.mbps;
const shapePrefixes = (args["shape-path"] ?? "/media")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
const logPath = args["log"] ?? null;

const bytesPerSecond =
  mbps === Infinity ? Infinity : (mbps * 1_000_000) / 8;
// Write quantum: small enough that pacing is smooth, large enough that the
// event loop is not saturated at high rates.
const WRITE_QUANTUM_BYTES = 64 * 1024;

const logStream = logPath
  ? fs.createWriteStream(ensureDir(logPath), { flags: "a" })
  : null;

/**
 * Shared token bucket so all shaped responses contend for one emulated link,
 * matching how one user's downlink behaves under parallel range requests.
 */
const linkBucket = {
  capacityBytes: bytesPerSecond === Infinity ? Infinity : bytesPerSecond / 4,
  tokens: bytesPerSecond === Infinity ? Infinity : bytesPerSecond / 4,
  lastRefillMs: Date.now(),

  take(requested) {
    if (bytesPerSecond === Infinity) return requested;
    const now = Date.now();
    const elapsed = (now - this.lastRefillMs) / 1000;
    this.lastRefillMs = now;
    this.tokens = Math.min(
      this.capacityBytes,
      this.tokens + elapsed * bytesPerSecond,
    );
    const granted = Math.min(requested, Math.max(0, Math.floor(this.tokens)));
    this.tokens -= granted;
    return granted;
  },
};

const upstreamAgent = new http.Agent({ keepAlive: true, maxSockets: 256 });

let requestCounter = 0;

const server = http.createServer((req, res) => {
  const requestId = ++requestCounter;
  const startMs = Date.now();
  const shaped = shapePrefixes.some((prefix) =>
    req.url.startsWith(prefix),
  );

  if (req.url.startsWith("/__shape__/status")) {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        latencyMs,
        listenPort,
        mbps,
        profile: profileName,
        requests: requestCounter,
        shapePrefixes,
        target: target.href,
      }),
    );
    return;
  }

  const upstreamHeaders = { ...req.headers, host: target.host };
  const upstream = http.request(
    {
      agent: upstreamAgent,
      headers: upstreamHeaders,
      hostname: target.hostname,
      method: req.method,
      path: req.url,
      port: target.port,
    },
    (upstreamRes) => {
      const entry = {
        file: fileTail(req.url),
        id: requestId,
        method: req.method,
        path: truncatePath(req.url),
        range: req.headers.range ?? null,
        shaped,
        status: upstreamRes.statusCode,
        tsStart: startMs,
      };

      if (!shaped) {
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);
        upstreamRes.pipe(res);
        upstreamRes.on("end", () => {
          logEntry({ ...entry, tsEnd: Date.now(), tsFirstByte: startMs });
        });
        return;
      }

      // Shaped path: hold first byte by the emulated round trip, then pace
      // the body through the shared link bucket.
      setTimeout(() => {
        const firstByteMs = Date.now();
        res.writeHead(upstreamRes.statusCode, upstreamRes.headers);

        let bytesSent = 0;
        const queue = [];
        let upstreamEnded = false;
        let draining = false;
        let waitingForDrain = false;
        let finished = false;

        const finish = () => {
          // Bucket-wait retries stack drain timers; every one of them can
          // observe the drained-and-ended state, so finishing must be
          // idempotent or each timer logs a duplicate row.
          if (finished) return;
          finished = true;
          res.end();
          logEntry({
            ...entry,
            bytes: bytesSent,
            tsEnd: Date.now(),
            tsFirstByte: firstByteMs,
          });
        };

        const drain = () => {
          if (draining || waitingForDrain) return;
          draining = true;
          while (queue.length > 0) {
            const head = queue[0];
            const want = Math.min(head.length, WRITE_QUANTUM_BYTES);
            const granted = linkBucket.take(want);
            if (granted === 0) {
              draining = false;
              setTimeout(drain, 5);
              return;
            }
            const slice = head.subarray(0, granted);
            if (granted === head.length) {
              queue.shift();
            } else {
              queue[0] = head.subarray(granted);
            }
            bytesSent += slice.length;
            const ok = res.write(slice);
            if (!ok) {
              waitingForDrain = true;
              draining = false;
              res.once("drain", () => {
                waitingForDrain = false;
                drain();
              });
              return;
            }
          }
          draining = false;
          if (upstreamEnded) {
            finish();
          } else {
            upstreamRes.resume();
          }
        };

        upstreamRes.on("data", (chunk) => {
          queue.push(chunk);
          // Backpressure the upstream so unbounded buffering cannot hide
          // link contention from the emulation.
          if (queue.length > 8) upstreamRes.pause();
          drain();
        });
        upstreamRes.on("end", () => {
          upstreamEnded = true;
          if (queue.length === 0 && !draining && !waitingForDrain) finish();
        });
      }, latencyMs);
    },
  );

  upstream.on("error", (error) => {
    logEntry({
      error: error.message,
      id: requestId,
      path: truncatePath(req.url),
      tsEnd: Date.now(),
      tsStart: startMs,
    });
    if (!res.headersSent) {
      res.writeHead(502, { "content-type": "text/plain" });
    }
    res.end("shaping proxy upstream error");
  });

  req.pipe(upstream);

  res.on("close", () => {
    upstream.destroy();
  });
});

server.listen(listenPort, () => {
  console.log(
    `[shaping-proxy] listening on :${listenPort} -> ${target.href} ` +
      `profile=${profileName} latency=${latencyMs}ms rate=${
        mbps === Infinity ? "unlimited" : `${mbps}Mbps`
      } shaped=${shapePrefixes.join(",")}${logPath ? ` log=${logPath}` : ""}`,
  );
});

function logEntry(entry) {
  if (!logStream) return;
  logStream.write(`${JSON.stringify(entry)}\n`);
}

function truncatePath(url) {
  // Keep filepath query params readable but bounded.
  return url.length > 160 ? `${url.slice(0, 157)}...` : url;
}

function fileTail(url) {
  // The basename of the media filepath param distinguishes per-file traffic
  // even when the full encoded path would blow up log size.
  try {
    const filepath = new URL(url, "http://x").searchParams.get("filepath");
    if (!filepath) return null;
    const segments = filepath.split("/");
    return segments[segments.length - 1] || null;
  } catch {
    return null;
  }
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  return filePath;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = "1";
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}
