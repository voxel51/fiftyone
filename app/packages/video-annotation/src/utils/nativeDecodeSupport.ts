/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Cheap, synchronous gates for whether a source video is worth probing for
 * WebCodecs decode. The authoritative answer comes from the worker probe
 * (`probeNativeDecode`); these just avoid probing when it's pointless.
 */

/** WebCodecs `VideoDecoder` is present in this environment. */
export function webCodecsAvailable(): boolean {
  return typeof globalThis !== "undefined" && "VideoDecoder" in globalThis;
}

/**
 * Containers mp4box can't demux — probing them wastes a fetch (mp4box would
 * read looking for a `moov` that never comes). We only skip a container we're
 * *sure* about: an unknown/absent extension still gets probed (presigned URLs
 * often carry no extension), and the probe is authoritative + cached.
 */
const NON_ISOBMFF_EXTENSIONS = new Set([
  "webm",
  "mkv",
  "ogg",
  "ogv",
  "avi",
  "flv",
  "wmv",
  "ts",
  "mpg",
  "mpeg",
]);

/**
 * Whether `url` plausibly holds an ISO-BMFF (MP4/MOV) stream mp4box can demux.
 * Extension-based and deliberately permissive: only a *known* non-ISO-BMFF
 * extension returns false; no extension → true (let the probe decide).
 */
export function looksDemuxable(url: string): boolean {
  const path = url.split("?")[0].split("#")[0];
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;

  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return true;
  }

  const ext = name.slice(dot + 1).toLowerCase();
  return !NON_ISOBMFF_EXTENSIONS.has(ext);
}
