import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { Writable } from "stream";

const app = express();
const PORT = 3001;

// Default delay for all routes (ms) - configurable via UPLOAD_DELAY env var
const DEFAULT_DELAY = parseInt(process.env.UPLOAD_DELAY || "0", 10);

// Chunk delay (ms per chunk) - configurable via CHUNK_DELAY env var
// This throttles incoming data to show progress bar
const CHUNK_DELAY = parseInt(process.env.CHUNK_DELAY || "0", 10);

// Helper to get delay from query param or use default
const getDelay = (req: express.Request): number => {
  const queryDelay = req.query.delay;
  if (queryDelay !== undefined) {
    return parseInt(queryDelay as string, 10) || 0;
  }
  return DEFAULT_DELAY;
};

// Helper to get chunk delay from query param or use default
const getChunkDelay = (req: express.Request): number => {
  const queryDelay = req.query.chunkDelay;
  if (queryDelay !== undefined) {
    return parseInt(queryDelay as string, 10) || 0;
  }
  return CHUNK_DELAY;
};

// Delay helper
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

app.use(cors());

// Health check (no delay)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

/**
 * Pipe the raw request body (binary) to disk, optionally throttling chunks.
 * Returns the written file size.
 */
function writeBodyToDisk(
  req: express.Request,
  filePath: string,
  chunkDelayMs: number
): Promise<number> {
  return new Promise((resolve, reject) => {
    const writeStream = fs.createWriteStream(filePath);
    let size = 0;

    if (chunkDelayMs > 0) {
      const throttled = new Writable({
        async write(chunk: Buffer, _encoding, callback) {
          await delay(chunkDelayMs);
          writeStream.write(chunk, callback);
          size += chunk.length;
        },
        final(callback) {
          writeStream.end(callback);
        },
      });

      req.pipe(throttled);
      throttled.on("finish", () => resolve(size));
      throttled.on("error", reject);
    } else {
      req.pipe(writeStream);
      writeStream.on("finish", () => {
        resolve(fs.statSync(filePath).size);
      });
      writeStream.on("error", reject);
    }
  });
}

// File upload endpoint — expects raw binary body with ?path=<destination>
app.post("/api/upload", async (req, res) => {
  const delayMs = getDelay(req);
  const chunkDelayMs = getChunkDelay(req);
  const destPath = req.query.path as string | undefined;

  if (req.query.fail === "true") {
    await delay(delayMs);
    res.status(500).json({ error: { message: "Simulated upload failure" } });
    return;
  }

  if (!destPath) {
    res.status(400).json({ error: { message: "Missing ?path= query param" } });
    return;
  }

  const filename = `${Date.now()}-${path.basename(destPath)}`;
  const filePath = path.join(uploadsDir, filename);

  try {
    const size = await writeBodyToDisk(req, filePath, chunkDelayMs);
    await delay(delayMs);

    res.json({
      path: `/uploads/${filename}`,
      originalName: path.basename(destPath),
      size,
      mimetype: req.headers["content-type"] || "application/octet-stream",
    });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to write file" } });
  }
});

// Delete file endpoint (1s minimum delay so the "deleting" UI state is visible)
// buildDeleteUrl strips "/upload" from the endpoint, so this is DELETE /api?path=...
app.delete("/api", async (req, res) => {
  const delayMs = Math.max(getDelay(req), 1000);
  await delay(delayMs);

  const remotePath = req.query.path as string | undefined;
  if (!remotePath) {
    res.status(400).json({ error: { message: "Missing ?path= query param" } });
    return;
  }

  const filename = path.basename(remotePath);
  const filePath = path.join(uploadsDir, filename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: { message: "File not found" } });
    return;
  }

  fs.unlinkSync(filePath);
  res.json({ deleted: true });
});

// List uploaded files (useful for e2e tests)
app.get("/api/files", async (req, res) => {
  const delayMs = getDelay(req);
  await delay(delayMs);

  const files = fs.readdirSync(uploadsDir).map((name) => {
    const stat = fs.statSync(path.join(uploadsDir, name));
    return {
      name,
      size: stat.size,
      createdAt: stat.birthtime,
    };
  });
  res.json(files);
});

// Clear all uploads (useful for e2e test cleanup)
app.delete("/api/files", async (req, res) => {
  const delayMs = getDelay(req);
  await delay(delayMs);

  const files = fs.readdirSync(uploadsDir);
  files.forEach((file) => {
    fs.unlinkSync(path.join(uploadsDir, file));
  });
  res.json({ deleted: files.length });
});

app.listen(PORT, () => {
  console.log(`Upload server running at http://localhost:${PORT}`);
  console.log(`Uploads directory: ${uploadsDir}`);
  console.log(
    `Response delay: ${DEFAULT_DELAY}ms (UPLOAD_DELAY env or ?delay=<ms>)`
  );
  console.log(
    `Chunk delay: ${CHUNK_DELAY}ms (CHUNK_DELAY env or ?chunkDelay=<ms>)`
  );
  if (CHUNK_DELAY > 0) {
    console.log(`Progress bar will be visible during uploads!`);
  }
});
