// @ts-expect-error mp4box ships no types
import MP4Box, { DataStream } from "mp4box";

const W = 51;
const H = 51;
// Canvas elements are 51×51 internally (so getImageData reads native pixels
// for the diff) but displayed at 10× via CSS with pixelated rendering so
// the watermark digits are actually visible.
const DISPLAY_SCALE = 10;
const CANVAS_STYLE = `background:#000;image-rendering:pixelated;width:${W * DISPLAY_SCALE}px;height:${H * DISPLAY_SCALE}px`;
const SRC = "/frame_indexed.mp4";
// FO's `to_frames` nests outputs under the video basename.
const SDK_FRAME_URL = (n: number) =>
  `/frames/frame_indexed/${String(n).padStart(6, "0")}.png`;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing #app");
app.innerHTML = `
  <label>Frame: <input id="frame" type="number" min="1" value="1" /></label>
  <label style="margin-left:16px;font-family:monospace">
    <input id="use-draw-image" type="checkbox" /> use drawImage (Chromium YUV→RGB)
  </label>
  <div id="meta" style="font-family:monospace;margin:8px 0"></div>
  <div id="diff" style="font-family:monospace;margin:8px 0"></div>
  <div style="display:flex;gap:16px">
    <figure style="margin:0">
      <figcaption style="font-family:monospace">browser (VideoDecoder)</figcaption>
      <canvas id="browser-canvas" width="${W}" height="${H}" style="${CANVAS_STYLE}"></canvas>
    </figure>
    <figure style="margin:0">
      <figcaption style="font-family:monospace">SDK (ffmpeg PNG)</figcaption>
      <canvas id="sdk-canvas" width="${W}" height="${H}" style="${CANVAS_STYLE}"></canvas>
    </figure>
    <figure style="margin:0">
      <figcaption style="font-family:monospace">delta heatmap (red ∝ max |Δchannel|)</figcaption>
      <canvas id="diff-canvas" width="${W}" height="${H}" style="${CANVAS_STYLE}"></canvas>
    </figure>
  </div>
`;

const input = document.querySelector<HTMLInputElement>("#frame")!;
const useDrawImage =
  document.querySelector<HTMLInputElement>("#use-draw-image")!;
const meta = document.querySelector<HTMLDivElement>("#meta")!;
const diff = document.querySelector<HTMLDivElement>("#diff")!;
const browserCtx = document
  .querySelector<HTMLCanvasElement>("#browser-canvas")!
  .getContext("2d")!;
const sdkCtx = document
  .querySelector<HTMLCanvasElement>("#sdk-canvas")!
  .getContext("2d")!;
const diffCtx = document
  .querySelector<HTMLCanvasElement>("#diff-canvas")!
  .getContext("2d")!;

// 1:1 draws into 510x510 canvases — disable smoothing on both contexts so
// the pixel-diff isn't measuring any browser-side interpolation artifact.
browserCtx.imageSmoothingEnabled = false;
sdkCtx.imageSmoothingEnabled = false;
diffCtx.imageSmoothingEnabled = false;

// biome-ignore lint/suspicious/noExplicitAny: mp4box ships no types
type Sample = any;

const file = MP4Box.createFile();
const samples: Sample[] = [];
let config: VideoDecoderConfig;
let totalSamples = 0;

const ready = new Promise<void>((resolve, reject) => {
  file.onError = reject;
  // biome-ignore lint/suspicious/noExplicitAny: mp4box ships no types
  file.onReady = (info: any) => {
    const track = info.videoTracks[0];
    totalSamples = track.nb_samples;
    input.max = String(totalSamples);
    const trak = file.getTrackById(track.id);
    config = {
      codec: track.codec,
      codedWidth: track.video.width,
      codedHeight: track.video.height,
      description: buildDescription(trak),
    };
    file.setExtractionOptions(track.id);
    file.start();
  };
  file.onSamples = (_id: number, _user: unknown, ss: Sample[]) => {
    for (const s of ss) samples.push(s);
    if (samples.length >= totalSamples) resolve();
  };
});

// biome-ignore lint/suspicious/noExplicitAny: mp4box ships no types
function buildDescription(trak: any): Uint8Array {
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) continue;
    const stream = new DataStream(undefined, 0, DataStream.BIG_ENDIAN);
    box.write(stream);
    // Strip 8-byte box header (size + type) — VideoDecoder expects only
    // the inner descriptor (e.g. AVCDecoderConfigurationRecord).
    return new Uint8Array(stream.buffer.slice(8));
  }
  throw new Error("no codec description in mp4 stsd");
}

const buf = await fetch(SRC).then((r) => r.arrayBuffer());
// biome-ignore lint/suspicious/noExplicitAny: mp4box wants fileStart on buffer
(buf as any).fileStart = 0;
file.appendBuffer(buf);
file.flush();
await ready;

// `samples` is in decode order; sort by CTS to get display order so the
// input maps to the watermarked frame number, not the decode index.
// H.264 with B-frames reorders frames (e.g. decode I,P,B,B → display I,B,B,P),
// so without this typing "3" returned whichever frame happened to land 3rd
// in decode order rather than the 3rd one to display.
const displayOrder = samples
  .map((s, i) => ({ decodeIdx: i, cts: s.cts }))
  .sort((a, b) => a.cts - b.cts);

// Latest-wins: track the most recently requested frame; cancel decode work
// for stale requests by checking the token after each output frame.
let token = 0;

async function paintFrameManually(frame: VideoFrame) {
  // Toggle path: let Chromium do the YUV→RGB conversion via drawImage. This
  // is the "what does the browser give you out of the box" rendering — use
  // it to see how it compares to both the manual path and the ffmpeg PNG.
  if (useDrawImage.checked) {
    browserCtx.clearRect(0, 0, W, H);
    browserCtx.drawImage(frame, 0, 0, W, H);
    meta.textContent += " · drawImage (Chromium YUV→RGB)";
    return;
  }

  // Pull raw YUV planes in the frame's *native* format — copyTo with an
  // explicit `format` only supports some conversions and Chromium often
  // gives us NV12 (hw decode) or I420 (sw decode). Doing the YUV→RGB step
  // here in JS instead of going through `drawImage(VideoFrame)` lets us
  // control the chroma-upsample filter, which is the source of the
  // per-edge pixel deltas vs the ffmpeg-decoded reference PNG.
  const fmt = frame.format;
  const size = frame.allocationSize();
  const buf = new Uint8Array(size);
  const layout = await frame.copyTo(buf);

  // Materialize deinterleaved U and V planes regardless of source layout
  // so the YUV→RGB loop below has one shape to handle. `chromaW`/`chromaH`
  // are the resolutions of the chroma planes — equal to W/H for I444 (4:4:4),
  // half for I420/NV12 (4:2:0).
  let yL: PlaneLayout;
  let uPlane: Uint8Array;
  let vPlane: Uint8Array;
  let cStride: number;
  let chromaW: number;
  let chromaH: number;
  if (fmt === "I444") {
    const [y, u, v] = layout;
    yL = y;
    chromaW = W;
    chromaH = H;
    uPlane = new Uint8Array(buf.buffer, buf.byteOffset + u.offset, u.stride * H);
    vPlane = new Uint8Array(buf.buffer, buf.byteOffset + v.offset, v.stride * H);
    cStride = u.stride;
  } else if (fmt === "I420" || fmt === "I420A") {
    const [y, u, v] = layout;
    yL = y;
    chromaW = W >> 1;
    chromaH = H >> 1;
    uPlane = new Uint8Array(buf.buffer, buf.byteOffset + u.offset, u.stride * chromaH);
    vPlane = new Uint8Array(buf.buffer, buf.byteOffset + v.offset, v.stride * chromaH);
    cStride = u.stride;
  } else if (fmt === "NV12") {
    // NV12: chroma is half-res with U and V interleaved one byte at a time.
    const [y, uv] = layout;
    yL = y;
    chromaW = W >> 1;
    chromaH = H >> 1;
    uPlane = new Uint8Array(chromaW * chromaH);
    vPlane = new Uint8Array(chromaW * chromaH);
    cStride = chromaW;
    for (let cy = 0; cy < chromaH; cy++) {
      const row = uv.offset + cy * uv.stride;
      const dst = cy * chromaW;
      for (let cx = 0; cx < chromaW; cx++) {
        uPlane[dst + cx] = buf[row + cx * 2];
        vPlane[dst + cx] = buf[row + cx * 2 + 1];
      }
    }
  } else {
    // RGBA / BGRA / etc — Chromium has already done YUV→RGB internally, so
    // there's nothing left to control here. Fall back to drawImage and tag
    // the meta line so the residual deltas are explained.
    browserCtx.clearRect(0, 0, W, H);
    browserCtx.drawImage(frame, 0, 0, W, H);
    meta.textContent += ` · format=${fmt} (native RGB — drawImage fallback)`;
    return;
  }

  const out = new Uint8ClampedArray(W * H * 4);

  // BT.601 limited-range YUV→RGB (libx264 default for SD ≤ 576p when no
  // VUI signalling is present; ffmpeg's swscale uses the same defaults).
  const KR = 1.16438; // (255/219), luma scale
  const KRV = 1.59603;
  const KGV = -0.81297;
  const KGU = -0.39176;
  const KBU = 2.01723;

  // Chroma siting / subsampling parameterization. For 4:4:4 chroma is at
  // luma resolution so cxF=x, cyF=y and the bilinear below collapses to
  // identity. For 4:2:0 H.264 default siting: cosited horizontal (cxF=x/2)
  // and centered vertical (cyF=y/2 - 0.25).
  const xScale = chromaW / W;
  const yScale = chromaH / H;
  const yOffset = chromaH === H ? 0 : -0.25;

  for (let y = 0; y < H; y++) {
    const cyF = y * yScale + yOffset;
    const cy0 = Math.max(0, Math.floor(cyF));
    const cy1 = Math.min(chromaH - 1, cy0 + 1);
    const fy = Math.max(0, Math.min(1, cyF - cy0));

    const yRow = yL.offset + y * yL.stride;
    const uRow0 = cy0 * cStride;
    const uRow1 = cy1 * cStride;
    const vRow0 = cy0 * cStride;
    const vRow1 = cy1 * cStride;

    for (let x = 0; x < W; x++) {
      const cxF = x * xScale;
      const cx0 = Math.floor(cxF);
      const cx1 = Math.min(chromaW - 1, cx0 + 1);
      const fx = cxF - cx0;

      // Bilinear sample U and V at the (fx, fy) sub-position.
      const u00 = uPlane[uRow0 + cx0];
      const u10 = uPlane[uRow0 + cx1];
      const u01 = uPlane[uRow1 + cx0];
      const u11 = uPlane[uRow1 + cx1];
      const U =
        (1 - fy) * ((1 - fx) * u00 + fx * u10) +
        fy * ((1 - fx) * u01 + fx * u11);

      const v00 = vPlane[vRow0 + cx0];
      const v10 = vPlane[vRow0 + cx1];
      const v01 = vPlane[vRow1 + cx0];
      const v11 = vPlane[vRow1 + cx1];
      const V =
        (1 - fy) * ((1 - fx) * v00 + fx * v10) +
        fy * ((1 - fx) * v01 + fx * v11);

      const Y = buf[yRow + x];
      const yp = Y - 16;
      const up = U - 128;
      const vp = V - 128;

      const o = (y * W + x) * 4;
      out[o] = KR * yp + KRV * vp;
      out[o + 1] = KR * yp + KGU * up + KGV * vp;
      out[o + 2] = KR * yp + KBU * up;
      out[o + 3] = 255;
    }
  }

  browserCtx.putImageData(new ImageData(out, W, H), 0, 0);
}

async function decodeBrowserFrame(target: number) {
  const myToken = ++token;
  const displayIdx = Math.max(1, Math.min(totalSamples, target)) - 1;

  const { decodeIdx, cts: targetCts } = displayOrder[displayIdx];
  const timescale = samples[decodeIdx].timescale;

  // Walk back to the nearest keyframe (in decode order) — H.264 frames decode
  // relative to the previous sync sample, so we must replay every sample
  // from there through `decodeIdx`. Feeding through `decodeIdx` is enough
  // even for B-frames: any forward reference a B-frame needs has an earlier
  // decode index by spec.
  let keyIdx = decodeIdx;
  while (keyIdx > 0 && !samples[keyIdx].is_sync) keyIdx--;

  let painted: Promise<void> | null = null;
  await new Promise<void>((resolve, reject) => {
    const decoder = new VideoDecoder({
      output: (frame) => {
        if (myToken !== token) return frame.close();
        // VideoDecoder emits frames in display order with timestamp in
        // microseconds; map back to CTS to pick the requested one.
        const cts = Math.round((frame.timestamp * timescale) / 1_000_000);
        if (cts === targetCts) {
          painted = paintFrameManually(frame).finally(() => frame.close());
          meta.textContent = `display ${
            displayIdx + 1
          }/${totalSamples} · decode sample ${decodeIdx + 1} · keyframe at ${
            keyIdx + 1
          }`;
        } else {
          frame.close();
        }
      },
      error: reject,
    });
    decoder.configure(config);
    for (let i = keyIdx; i <= decodeIdx; i++) {
      const s = samples[i];
      decoder.decode(
        new EncodedVideoChunk({
          type: s.is_sync ? "key" : "delta",
          timestamp: (s.cts * 1_000_000) / s.timescale,
          duration: (s.duration * 1_000_000) / s.timescale,
          data: s.data,
        }),
      );
    }
    decoder
      .flush()
      .then(() => {
        decoder.close();
        resolve();
      })
      .catch(reject);
  });
  if (painted) await painted;
}

async function drawSdkFrame(n: number) {
  const img = new Image();
  img.src = SDK_FRAME_URL(Math.max(1, Math.min(totalSamples, n)));
  await img.decode();
  sdkCtx.clearRect(0, 0, W, H);
  // No size args — PNG is already 510×510, so this is a 1:1 byte-copy
  // and the browser can't pick a scaling/smoothing path.
  sdkCtx.drawImage(img, 0, 0);
}

function diffAndPaintHeatmap(): {
  differing: number;
  total: number;
  maxDelta: number;
} {
  const a = browserCtx.getImageData(0, 0, W, H).data;
  const b = sdkCtx.getImageData(0, 0, W, H).data;
  const heat = diffCtx.createImageData(W, H);
  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    const dr = Math.abs(a[i] - b[i]);
    const dg = Math.abs(a[i + 1] - b[i + 1]);
    const db = Math.abs(a[i + 2] - b[i + 2]);
    const m = Math.max(dr, dg, db);
    if (m > 0) differing++;
    if (m > maxDelta) maxDelta = m;
    // Scale: 1-unit delta is visible (≥64), max channel delta saturates red.
    heat.data[i] = m === 0 ? 0 : Math.min(255, 64 + m * 4);
    heat.data[i + 1] = 0;
    heat.data[i + 2] = 0;
    heat.data[i + 3] = 255;
  }
  diffCtx.putImageData(heat, 0, 0);
  return { differing, total: W * H, maxDelta };
}

async function showFrame(n: number) {
  diff.textContent = "comparing…";
  await Promise.all([decodeBrowserFrame(n), drawSdkFrame(n)]);
  const { differing, total, maxDelta } = diffAndPaintHeatmap();
  const pct = ((differing / total) * 100).toFixed(2);
  diff.textContent = `${differing.toLocaleString()} / ${total.toLocaleString()} pixels differ (${pct}%) · max channel delta: ${maxDelta}`;
}

function refresh() {
  const n = Number.parseInt(input.value, 10);
  if (Number.isFinite(n)) showFrame(n);
}

input.addEventListener("input", refresh);
useDrawImage.addEventListener("change", refresh);

await showFrame(1);
