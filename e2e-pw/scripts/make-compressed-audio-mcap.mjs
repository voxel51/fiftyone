/**
 * Generates an MCAP fixture carrying `foxglove.CompressedAudio` (Opus).
 *
 * ffmpeg produces Ogg-Opus; Foxglove's CompressedAudio wants ONE RAW OPUS
 * PACKET per message, so the Ogg container is unwrapped here (pages ->
 * segment table -> packets) and the two Opus header packets (OpusHead /
 * OpusTags) are dropped — they are container metadata, not audio.
 *
 * Usage:
 *   ffmpeg -f lavfi -i "sine=frequency=440:duration=8:sample_rate=48000" \
 *     -ac 2 -c:a libopus -frame_duration 20 tone.opus
 *   node scripts/make-compressed-audio-mcap.mjs tone.opus out.mcap
 */
import fs from "node:fs";
import { createRequire } from "node:module";

// `@mcap/core` ships CJS here; resolve it from the app workspace where it
// is installed rather than depending on this script's own node_modules.
const require = createRequire(
  new URL("../../app/package.json", import.meta.url),
);
const { McapWriter } = require("@mcap/core");

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error(
    "usage: node scripts/make-compressed-audio-mcap.mjs <input.opus> <out.mcap>",
  );
  process.exit(1);
}

/** Splits an Ogg stream into its constituent packets. */
function oggPackets(buffer) {
  const packets = [];
  let offset = 0;
  let pending = [];

  while (offset + 27 <= buffer.length) {
    if (buffer.toString("latin1", offset, offset + 4) !== "OggS") break;
    const segmentCount = buffer[offset + 26];
    const table = buffer.subarray(offset + 27, offset + 27 + segmentCount);
    let dataOffset = offset + 27 + segmentCount;

    for (const segmentLength of table) {
      pending.push(buffer.subarray(dataOffset, dataOffset + segmentLength));
      dataOffset += segmentLength;
      // A segment shorter than 255 terminates the current packet; a run of
      // 255s means the packet continues into the next segment.
      if (segmentLength < 255) {
        packets.push(Buffer.concat(pending));
        pending = [];
      }
    }
    offset = dataOffset;
  }
  return packets;
}

const packets = oggPackets(fs.readFileSync(input))
  // Drop OpusHead / OpusTags — container metadata, not encoded audio.
  .filter((p) => {
    const tag = p.toString("latin1", 0, 8);
    return tag !== "OpusHead" && tag !== "OpusTags";
  });

if (packets.length === 0) {
  console.error("no Opus packets found — is the input Ogg-Opus?");
  process.exit(1);
}

// libopus was invoked with -frame_duration 20, so each packet is 20ms.
const FRAME_NS = 20_000_000n;

class BufferWritable {
  #chunks = [];
  #size = 0n;
  position() {
    return this.#size;
  }
  async write(data) {
    this.#chunks.push(Buffer.from(data));
    this.#size += BigInt(data.byteLength);
  }
  buffer() {
    return Buffer.concat(this.#chunks);
  }
}

const writable = new BufferWritable();
const writer = new McapWriter({ writable, useStatistics: true, useChunks: true });

await writer.start({ profile: "", library: "fiftyone-audio-fixture" });

const schemaId = await writer.registerSchema({
  name: "foxglove.CompressedAudio",
  encoding: "jsonschema",
  data: new TextEncoder().encode(
    JSON.stringify({
      title: "foxglove.CompressedAudio",
      description: "A single block of a compressed audio bitstream",
      type: "object",
      properties: {
        timestamp: {
          type: "object",
          title: "time",
          properties: { sec: { type: "integer" }, nsec: { type: "integer" } },
        },
        data: { type: "string", contentEncoding: "base64" },
        format: { type: "string", description: "Audio format (opus)" },
      },
    }),
  ),
});

const channelId = await writer.registerChannel({
  schemaId,
  topic: "/audio/compressed",
  messageEncoding: "json",
  metadata: new Map(),
});

for (const [index, packet] of packets.entries()) {
  const timeNs = BigInt(index) * FRAME_NS;
  await writer.addMessage({
    channelId,
    sequence: index,
    logTime: timeNs,
    publishTime: timeNs,
    data: new TextEncoder().encode(
      JSON.stringify({
        timestamp: {
          sec: Number(timeNs / 1_000_000_000n),
          nsec: Number(timeNs % 1_000_000_000n),
        },
        data: packet.toString("base64"),
        format: "opus",
      }),
    ),
  });
}

await writer.end();
fs.writeFileSync(output, writable.buffer());

console.log(
  `wrote ${output}: ${packets.length} opus packets, ` +
    `${(Number(packets.length) * 20) / 1000}s, ${fs.statSync(output).size} bytes`,
);
