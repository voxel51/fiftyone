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

// Reusing LoaderBar from video logic
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
  private src: string;
  private volume: number;
  private loop = false;
  private playbackRate = 1;
  private requestCallback: (callback: (time: number) => void) => void;
  private audioContext: AudioContext;
  private audioBuffer: AudioBuffer;

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
    const step = Math.ceil(data.length / width);
    const amp = height / 2;

    ctx.fillStyle = "rgb(238, 238, 238)";
    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      for (let j = 0; j < step; j++) {
        const datum = data[i * step + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      ctx.fillRect(i, (1 + min) * amp, 1, Math.max(1, (max - min) * amp));
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
