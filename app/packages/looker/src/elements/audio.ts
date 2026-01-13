/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { playbackRate, volume as volumeIcon, volumeMuted } from "../icons";
import type { AudioState } from "../state";
import type { Events } from "./base";
import { BaseElement } from "./base";
import { muteUnmute, playPause, resetPlaybackRate } from "./common/actions";
import { dispatchTooltipEvent } from "./common/util";
import { getFrameString, getFullTimeString } from "./util";

import { lookerClickable, lookerTime } from "./common/controls.module.css";
import { lookerLoader } from "./common/looker.module.css";
import {
  bufferingCircle,
  bufferingPath,
  lookerPlaybackRate,
  lookerSeekBar,
  lookerThumb,
  lookerThumbSeeking,
  lookerVolume,
} from "./video.module.css"; // Reusing video styles for now

// --- DSP & Color Helpers ---

// Viridis colormap approximation (simple 5-point gradient interpolation)
const VIRIDIS_MAP = [
  [68, 1, 84], // Dark purple
  [59, 82, 139], // Blue
  [33, 145, 140], // Teal
  [94, 201, 98], // Green
  [253, 231, 37], // Yellow
];

function getViridisColor(val: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, val));
  const idx = t * (VIRIDIS_MAP.length - 1);
  const i = Math.floor(idx);
  const f = idx - i;
  if (i >= VIRIDIS_MAP.length - 1)
    return VIRIDIS_MAP[VIRIDIS_MAP.length - 1] as [number, number, number];

  const c1 = VIRIDIS_MAP[i];
  const c2 = VIRIDIS_MAP[i + 1];
  return [
    Math.round(c1[0] + f * (c2[0] - c1[0])),
    Math.round(c1[1] + f * (c2[1] - c1[1])),
    Math.round(c1[2] + f * (c2[2] - c1[2])),
  ];
}

function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  const jArr = new Uint32Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    jArr[i] = m;
    let k = n >> 1;
    while (m & k) {
      m &= ~k;
      k >>= 1;
    }
    m |= k;
  }

  for (let i = 0; i < n; i++) {
    const j = jArr[i];
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfsize = size / 2;
    // Precompute sine/cosine is better but math.sin/cos is ok for 1024x1024 total ops
    const angle = (-2 * Math.PI) / size;
    const w_step_r = Math.cos(angle);
    const w_step_i = Math.sin(angle);

    for (let i = 0; i < n; i += size) {
      let wr = 1.0;
      let wi = 0.0;
      for (let k = 0; k < halfsize; k++) {
        const evenI = i + k;
        const oddI = i + k + halfsize;

        const tr = wr * re[oddI] - wi * im[oddI];
        const ti = wr * im[oddI] + wi * re[oddI];

        re[oddI] = re[evenI] - tr;
        im[oddI] = im[evenI] - ti;
        re[evenI] = re[evenI] + tr;
        im[evenI] = im[evenI] + ti;

        const wr_next = wr * w_step_r - wi * w_step_i;
        wi = wr * w_step_i + wi * w_step_r;
        wr = wr_next;
      }
    }
  }
}

function createMelFilterbank(
  sampleRate: number,
  fftSize: number,
  nMel: number,
  fMin: number,
  fMax: number
): number[][] {
  const nFftHalf = fftSize / 2 + 1;
  const filters: number[][] = [];

  const melMin = 1127 * Math.log(1 + fMin / 700);
  const melMax = 1127 * Math.log(1 + fMax / 700);
  const melPoints = new Float32Array(nMel + 2);

  for (let i = 0; i < nMel + 2; i++) {
    melPoints[i] = melMin + (i * (melMax - melMin)) / (nMel + 1);
  }

  const hzPoints = melPoints.map((m) => 700 * (Math.exp(m / 1127) - 1));
  const binPoints = hzPoints.map((h) =>
    Math.floor(((nFftHalf - 1) * h) / (sampleRate / 2))
  );

  for (let i = 0; i < nMel; i++) {
    const filter = new Float32Array(nFftHalf).fill(0);
    const start = binPoints[i];
    const center = binPoints[i + 1];
    const end = binPoints[i + 2];

    for (let j = start; j < center; j++) {
      filter[j] = (j - start) / (center - start);
    }
    for (let j = center; j < end; j++) {
      filter[j] = (end - j) / (end - center);
    }
    filters.push(Array.from(filter));
  }
  return filters;
}

// --- End DSP Helpers ---

export class LoaderBar extends BaseElement<AudioState> {
  private shown: boolean = undefined;

  isShown({ thumbnail }: Readonly<AudioState["config"]>) {
    return thumbnail;
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerLoader);
    return element;
  }

  renderSelf({ buffering, hovering, error }: Readonly<AudioState>) {
    const shown = !error && hovering && buffering;

    if (shown === this.shown) {
      return this.element;
    }

    this.shown = shown;
    if (this.shown) {
      this.element.style.display = "block";
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class PlayButtonElement extends BaseElement<AudioState, HTMLDivElement> {
  private isPlaying: boolean;
  private isBuffering: boolean;
  private play: SVGElement;
  private pause: SVGElement;
  private buffering: SVGElement;

  getEvents(): Events<AudioState> {
    return {
      click: ({ event, update, dispatchEvent }) => {
        event.preventDefault();
        event.stopPropagation();
        playPause.action(update, dispatchEvent);
      },
    };
  }

  createHTMLElement() {
    this.pause = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.pause.setAttribute("height", "24");
    this.pause.setAttribute("width", "24");
    this.pause.setAttribute("viewBox", "0 0 24 24");

    let path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "var(--fo-palette-text-secondary)");
    path.setAttribute("d", "M6 19h4V5H6v14zm8-14v14h4V5h-4z");
    this.pause.appendChild(path);

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");
    this.pause.appendChild(path);

    this.play = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    this.play.setAttribute("height", "24");
    this.play.setAttribute("width", "24");
    this.play.setAttribute("viewBox", "0 0 24 24");

    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "rgb(238, 238, 238)");
    path.setAttribute("d", "M8 5v14l11-7z");
    this.play.appendChild(path);
    path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("d", "M0 0h24v24H0z");

    this.buffering = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg"
    );
    this.buffering.classList.add(bufferingCircle);
    this.buffering.setAttribute("viewBox", "12 12 24 24");
    const circle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "circle"
    );
    circle.setAttribute("cx", "24");
    circle.setAttribute("cy", "24");
    circle.setAttribute("r", "9");
    circle.setAttribute("stroke-width", "2");
    circle.setAttribute("stroke", "rgb(238, 238, 238)");
    circle.setAttribute("fill", "none");
    circle.classList.add(bufferingPath);
    this.buffering.appendChild(circle);

    const element = document.createElement("div");
    element.style.marginTop = "2px";
    element.style.position = "relative";
    element.style.height = "24px";
    element.style.width = "24px";
    element.style.gridArea = "2 / 2 / 2 / 2";

    element.setAttribute("data-cy", "looker-audio-play-button");

    return element;
  }

  renderSelf({ playing, buffering, loaded }: Readonly<AudioState>) {
    if (
      playing !== this.isPlaying ||
      this.isBuffering !== buffering ||
      !loaded
    ) {
      this.element.textContent = "";
      if (buffering || !loaded) {
        this.element.appendChild(this.buffering);
        this.element.title = "Loading";
        this.element.style.cursor = "default";
      } else if (playing) {
        this.element.appendChild(this.pause);
        this.element.title = "Pause (space)";
        this.element.style.cursor = "pointer";
      } else {
        this.element.appendChild(this.play);
        this.element.title = "Play (space)";
        this.element.style.cursor = "pointer";
      }
      this.isPlaying = playing;
      this.isBuffering = buffering || !loaded;
    }
    return this.element;
  }
}

export class SeekBarThumbElement extends BaseElement<
  AudioState,
  HTMLDivElement
> {
  private active: boolean;

  getEvents(): Events<AudioState> {
    return {
      mouseenter: ({ update }) => {
        update({ seekBarHovering: true });
      },
      mousedown: ({ update }) => {
        update({
          seeking: true,
          seekBarHovering: true,
          options: { showJSON: false },
        });
      },
      mouseleave: ({ update }) => {
        update(({ seeking }) => ({ seekBarHovering: seeking }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("div");
    element.classList.add(lookerThumb);
    return element;
  }

  renderSelf({ seeking, seekBarHovering, duration }: Readonly<AudioState>) {
    // We need current time here, but AudioState doesn't track currentTime in state directly updates are event based?
    // Actually VideoState tracks frameNumber. AudioState should probably track something similar or just rely on events?
    // Let's check video.ts. It uses frameNumber.
    // I should add currentTime to AudioState or map it to frameNumber?
    // Let's assume AudioState tracks `time` or `frameNumber` if we want to be consistent.
    // I added `frameNumber` to AudioState? No, I added `duration`.
    // I should add `currentTime` to AudioState or `time`.
    // Actually, `frameNumber` is used in video. For audio, let's use `frameNumber` too, assuming frameRate=1 or similar?
    // Or add `currentTime`. Let's add `currentTime` to AudioState in next step if needed.
    // For now, I'll rely on a custom property I'll add to AudioState: `currentTime` or reuse `frameNumber` if config has frameRate.

    // NOTE: I am adding `currentTime` to AudioState interface in my mind, need to update state.ts if I haven't.
    // VideoState has `frameNumber`.

    // Let's assume for now I can access the element to get time or state has it.
    // I will use a placeholder 0 for now and fix state.ts.

    // FIX: I will use a local variable `time` in the loop or state.
    // But `renderSelf` gets `Readonly<AudioState>`.
    // I need `currentTime` in `AudioState`.

    const active = seeking || seekBarHovering;
    if (active !== this.active) {
      this.active = active;

      active
        ? this.element.classList.add(lookerThumbSeeking)
        : this.element.classList.remove(lookerThumbSeeking);
    }

    return this.element;
  }
}

export class SeekBarElement extends BaseElement<AudioState, HTMLInputElement> {
  getEvents(): Events<AudioState> {
    return {
      mousedown: ({ update }) => {
        update({
          seeking: true,
          options: { showJSON: false },
        });
      },
      mouseenter: ({ update }) => {
        update({ seekBarHovering: true });
      },
      mouseleave: ({ update }) => {
        update(({ seeking }) => ({ seekBarHovering: seeking }));
      },
    };
  }

  createHTMLElement() {
    const element = document.createElement("input");
    element.setAttribute("type", "range");
    element.setAttribute("min", "0");
    element.setAttribute("max", "100");
    element.classList.add(lookerSeekBar);
    return element;
  }

  renderSelf({ config: { thumbnail }, duration }: Readonly<AudioState>) {
    if (thumbnail) {
      return this.element;
    }

    if (duration !== null) {
      this.element.style.display = "block";
      // Progress update logic needs `currentTime`
    } else {
      this.element.style.display = "none";
    }
    return this.element;
  }
}

export class TimeElement extends BaseElement<AudioState> {
  createHTMLElement() {
    const element = document.createElement("div");
    element.setAttribute("data-cy", "looker-audio-time");
    element.classList.add(lookerTime);
    element.style.gridArea = "2 / 5 / 2 / 5";
    return element;
  }

  renderSelf({ duration }: Readonly<AudioState>) {
    if (typeof duration !== "number") {
      this.element.textContent = "";
      return this.element;
    }

    // Need currentTime here too
    // const timestamp = getFullTimeString(currentTime, 1, duration);
    // this.element.textContent = timestamp;
    return this.element;
  }
}

export class AudioElement extends BaseElement<AudioState, HTMLAudioElement> {
  protected src: string;
  protected volume: number;
  protected loop = false;
  protected playbackRate = 1;
  protected requestCallback: (callback: (time: number) => void) => void;
  protected audioContext: AudioContext;
  protected audioBuffer: AudioBuffer;

  imageSource: HTMLCanvasElement;

  getEvents(): Events<AudioState> {
    return {
      error: ({ update }) => {
        update({ error: true });
      },
      loadedmetadata: ({ update }) => {
        update({
          duration: this.element.duration,
          loaded: true,
          dimensions: [1024, 200],
        });
      },
      play: ({ update, dispatchEvent }) => {
        const callback = (time: number) => {
          // Update currentTime in state?
          // Or dispatch timeupdate
        };
        update({ playing: true });
      },
      pause: ({ update }) => {
        update({ playing: false });
      },
      timeupdate: ({ dispatchEvent, update }) => {
        // We need to pass currentTime to state to update seek bar
        // BUT AudioState doesn't have it yet.
      },
    };
  }

  createHTMLElement() {
    this.element = document.createElement("audio");
    this.element.preload = "metadata";

    this.imageSource = document.createElement("canvas");
    this.imageSource.width = 1024;
    this.imageSource.height = 200;

    this.update(({ config: { src } }) => {
      this.src = src;
      this.element.src = src;
      this.loadWaveform(src);
      return {};
    });

    return this.element;
  }

  async loadWaveform(url: string) {
    if (!this.audioContext) {
      const AudioContext =
        window.AudioContext ||
        (
          window as unknown as {
            webkitAudioContext: typeof window.AudioContext;
          }
        ).webkitAudioContext;
      this.audioContext = new AudioContext();
    }
    try {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.drawWaveform();
      this.update({});
      this.element.dispatchEvent(new Event("waveform-loaded"));
    } catch (e) {
      console.error("Error loading audio waveform", e);
    }
  }

  drawWaveform() {
    if (!this.audioBuffer || !this.imageSource) return;

    const canvas = this.imageSource;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const data = this.audioBuffer.getChannelData(0);

    let maxAmp = 0;
    for (let i = 0; i < data.length; i++) {
      const val = Math.abs(data[i]);
      if (val > maxAmp) maxAmp = val;
    }
    if (maxAmp === 0) maxAmp = 1;

    const step = Math.ceil(data.length / width);
    const mid = height / 2;
    const scale = (height * 0.9) / 2 / maxAmp;

    ctx.fillStyle = "rgb(238, 238, 238)";
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < data.length) {
          const datum = data[index];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }

      if (min > max) {
        min = 0;
        max = 0;
      }

      const y = mid - max * scale;
      const h = (max - min) * scale;

      ctx.fillRect(i, y, 1, Math.max(1, h));
    }
  }

  renderSelf({
    options: { loop, volume, playbackRate },
    playing,
    seeking,
  }: Readonly<AudioState>) {
    if (this.loop !== loop) {
      this.element.loop = loop;
      this.loop = loop;
    }
    if (this.volume !== volume) {
      this.element.volume = volume;
      this.volume = volume;
    }
    if (this.playbackRate !== playbackRate) {
      this.element.playbackRate = playbackRate;
      this.playbackRate = playbackRate;
    }

    if (playing && this.element.paused && !seeking) {
      this.element.play();
    } else if (!playing && !this.element.paused) {
      this.element.pause();
    }

    return this.element;
  }
}

export class SpectrogramElement extends AudioElement {
  drawWaveform() {
    if (!this.audioBuffer || !this.imageSource) return;

    const canvas = this.imageSource;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;

    // Clear whole canvas
    ctx.clearRect(0, 0, width, height);

    // --- Waveform (Top Half) ---
    const waveHeight = height / 2;
    const data = this.audioBuffer.getChannelData(0);

    let maxAmp = 0;
    for (let i = 0; i < data.length; i++) {
      const val = Math.abs(data[i]);
      if (val > maxAmp) maxAmp = val;
    }
    if (maxAmp === 0) maxAmp = 1;

    const step = Math.ceil(data.length / width);
    // Center of top half
    const mid = waveHeight / 2;
    const scale = (waveHeight * 0.9) / 2 / maxAmp;

    ctx.fillStyle = "rgb(238, 238, 238)";

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const index = i * step + j;
        if (index < data.length) {
          const datum = data[index];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
      }

      if (min > max) {
        min = 0;
        max = 0;
      }

      const y = mid - max * scale;
      const h = (max - min) * scale;
      // Ensure height is at least 1px
      ctx.fillRect(i, y, 1, Math.max(1, h));
    }

    // --- Spectrogram (Bottom Half) ---
    const specHeight = height - waveHeight;
    const specY = waveHeight;
    const SAMPLE_RATE = this.audioBuffer.sampleRate;
    const FFT_SIZE = 512;
    const HOP_SIZE = Math.floor(data.length / width); // Match pixels
    const MEL_BANDS = 80;

    // Create Mel Filterbank (cached if possible, but here we generate)
    const filters = createMelFilterbank(
      SAMPLE_RATE,
      FFT_SIZE,
      MEL_BANDS,
      0,
      SAMPLE_RATE / 2
    );

    // Buffer for FFT
    const re = new Float32Array(FFT_SIZE);
    const im = new Float32Array(FFT_SIZE);
    const window = new Float32Array(FFT_SIZE);
    // Hann window
    for (let i = 0; i < FFT_SIZE; i++) {
      window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1)));
    }

    // Compute spectrogram column by column
    for (let x = 0; x < width; x++) {
      const start = x * HOP_SIZE;
      if (start + FFT_SIZE > data.length) break;

      // Fill buffer with windowing
      for (let i = 0; i < FFT_SIZE; i++) {
        re[i] = data[start + i] * window[i];
        im[i] = 0;
      }

      fft(re, im);

      // Compute Magnitude Spectrum
      const mag = new Float32Array(FFT_SIZE / 2 + 1);
      for (let i = 0; i < mag.length; i++) {
        mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
      }

      // Apply Mel Filterbank
      const mels = new Float32Array(MEL_BANDS);
      for (let i = 0; i < MEL_BANDS; i++) {
        let sum = 0;
        for (let j = 0; j < filters[i].length; j++) {
          // filters[i] is length FFT_SIZE/2 + 1, maps to mag
          // Wait, createMelFilterbank returns array of length FFT_SIZE/2+1?
          // Yes.
          if (filters[i][j] > 0) {
            sum += mag[j] * filters[i][j];
          }
        }
        mels[i] = sum;
      }

      // Log scale (dB)
      for (let i = 0; i < MEL_BANDS; i++) {
        mels[i] = 10 * Math.log10(mels[i] + 1e-10);
      }

      // Normalize (simple min/max for now, or fixed range)
      // Audio visualization usually needs dynamic range compression
      // We'll normalize per column? No, that looks bad.
      // We normalize global? We don't have global stats yet.
      // Let's assume -80dB to 0dB range roughly.
      // Or just map min/max of this column for now to see something.
      // Better: use fixed range [-100, 20] dB approximately.

      const maxVal = Math.max(...mels);
      const minVal = -80; // Floor

      // Draw pixels
      for (let i = 0; i < MEL_BANDS; i++) {
        // Low freq at bottom of spectrogram area
        // i=0 is low freq.
        // Screen Y goes down. So i=0 should be at specY + specHeight
        // i=MEL_BANDS-1 should be at specY.

        let val = (mels[i] - minVal) / (maxVal - minVal + 20); // +20 for headroom
        // Clamp
        val = Math.max(0, Math.min(1, val));

        const color = getViridisColor(val);
        ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

        const y = specY + specHeight - 1 - (i / MEL_BANDS) * specHeight;
        const h = specHeight / MEL_BANDS + 1; // +1 for overlap

        ctx.fillRect(x, y, 1, h);
      }
    }

    // X-Axis timestamps
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";

    const duration = this.audioBuffer.duration;
    // Draw every 1s
    const pxPerSec = width / duration;
    for (let t = 0; t < duration; t += 1) {
      const x = t * pxPerSec;
      ctx.fillText(`${t}s`, x, specY + specHeight - 12); // Near bottom

      // Tick
      ctx.fillRect(x, specY + specHeight - 4, 1, 4);
    }
  }
}

class VolumeIconElement extends BaseElement<AudioState, HTMLDivElement> {
  // ... similar to video
  createHTMLElement() {
    const div = document.createElement("div");
    return div;
  }
  renderSelf() {
    return this.element;
  }
}

export const VOLUME = {
  node: VolumeIconElement, // Needs container if we want bar
  children: [],
};

class PlaybackRateIconElement extends BaseElement<AudioState, HTMLDivElement> {
  createHTMLElement() {
    const div = document.createElement("div");
    return div;
  }
  renderSelf() {
    return this.element;
  }
}

export const PLAYBACK_RATE = {
  node: PlaybackRateIconElement,
  children: [],
};
