// @ts-expect-error mp4box ships no types
import MP4Box, { DataStream } from "mp4box";

const W = 510;
const H = 510;
const SRC = "/frame_indexed.mp4";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("missing #app");
app.innerHTML = `
  <label>Frame: <input id="frame" type="number" min="1" value="1" /></label>
  <div id="meta" style="font-family:monospace;margin:8px 0"></div>
  <canvas id="canvas" width="${W}" height="${H}" style="background:#000"></canvas>
`;

const input = document.querySelector<HTMLInputElement>("#frame")!;
const meta = document.querySelector<HTMLDivElement>("#meta")!;
const ctx = document
  .querySelector<HTMLCanvasElement>("#canvas")!
  .getContext("2d")!;

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

async function decodeFrame(target: number) {
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

  await new Promise<void>((resolve, reject) => {
    const decoder = new VideoDecoder({
      output: (frame) => {
        if (myToken !== token) return frame.close();
        // VideoDecoder emits frames in display order with timestamp in
        // microseconds; map back to CTS to pick the requested one.
        const cts = Math.round((frame.timestamp * timescale) / 1_000_000);
        if (cts === targetCts) {
          ctx.clearRect(0, 0, W, H);
          ctx.drawImage(frame, 0, 0, W, H);
          meta.textContent = `display ${
            displayIdx + 1
          }/${totalSamples} · decode sample ${decodeIdx + 1} · keyframe at ${
            keyIdx + 1
          }`;
        }
        frame.close();
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
        })
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
}

input.addEventListener("input", () => {
  const n = Number.parseInt(input.value, 10);
  if (Number.isFinite(n)) decodeFrame(n);
});

await decodeFrame(1);
