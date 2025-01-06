/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { BaseState, StateUpdate } from "../state";
import type { BaseElement, Events } from "./base";

export const FRAME_ZERO_OFFSET = 1;

export const ICONS = Object.freeze({
  arrowLeft:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M20,10V14H11L14.5,17.5L12.08,19.92L4.16,12L12.08,4.08L14.5,6.5L11,10H20Z' /%3E%3C/svg%3E",
  arrowRight:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M4,10V14H13L9.5,17.5L11.92,19.92L19.84,12L11.92,4.08L9.5,6.5L13,10H4Z' /%3E%3C/svg%3E",
  help: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z' /%3E%3C/svg%3E",
  minus:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M20 14H4V10H20V14Z' /%3E%3C/svg%3E",
  plus: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' height='24' viewBox='0 0 24 24' width='24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M20 14H14V20H10V14H4V10H10V4H14V10H20V14Z' /%3E%3C/svg%3E",
  options:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z' /%3E%3C/svg%3E",
  overlaysVisible:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M2,4.27L3.28,3L20,19.72L18.73,21L16.63,18.9C16.43,18.96 16.22,19 16,19H5A2,2 0 0,1 3,17V7C3,6.5 3.17,6.07 3.46,5.73L2,4.27M5,17H14.73L5,7.27V17M19.55,12L16,7H9.82L7.83,5H16C16.67,5 17.27,5.33 17.63,5.84L22,12L19,16.2L17.59,14.76L19.55,12Z' /%3E%3C/svg%3E",
  overlaysHidden:
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' version='1.1' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath fill='rgb(238, 238, 238)' d='M16,17H5V7H16L19.55,12M17.63,5.84C17.27,5.33 16.67,5 16,5H5A2,2 0 0,0 3,7V17A2,2 0 0,0 5,19H16C16.67,19 17.27,18.66 17.63,18.15L22,12L17.63,5.84Z' /%3E%3C/svg%3E",
});

export type DispatchEvent = (eventType: string, details?: any) => void;

type ElementConstructor<
  State extends BaseState,
  Element extends BaseElement<State>
> = new () => Element;

export interface ElementsTemplate<
  State extends BaseState,
  Element extends BaseElement<State> = BaseElement<State>
> {
  node: ElementConstructor<State, Element>;
  children?: ElementsTemplate<State>[];
}

export function createElementsTree<
  State extends BaseState,
  Element extends BaseElement<State> = BaseElement<State>
>(params: {
  abortController: AbortController;
  batchUpdate?: (cb: () => unknown) => void;
  config: Readonly<State["config"]>;
  dispatchEvent: (eventType: string, details?: any) => void;
  root: ElementsTemplate<State, Element>;
  update: StateUpdate<State>;
}): Element {
  const element = new params.root.node();
  element.boot(params);

  if (!element.isShown(params.config)) {
    return element;
  }

  let children = new Array<BaseElement<State>>();
  children = params.root.children
    ? params.root.children.map((child) =>
        createElementsTree<State>({ ...params, root: child })
      )
    : children;

  element.applyChildren(children);

  return element;
}

const stringifyNumber = (number: number, pad = false): string => {
  let str = "";
  if (pad && number < 10) {
    str += "0" + number;
  } else if (number === 0) {
    str = "0";
  } else {
    str = `${number}`;
  }
  return str;
};

export const getFrameNumber = (
  time: number,
  duration: number,
  frameRate: number
): number => {
  let stamp = time;
  const frameDuration = 1 / frameRate;

  // account for exact end of video
  if (time === duration) {
    stamp -= 0.1 * frameDuration;
  }
  return Math.floor(stamp * frameRate + FRAME_ZERO_OFFSET);
};

export const getClampedTime = (
  currentTime: number,
  duration: number,
  frameRate: number
) => {
  return getTime(getFrameNumber(currentTime, duration, frameRate), frameRate);
};

export const getTime = (frameNumber: number, frameRate: number): number => {
  const time = (frameNumber - 1 + 0.01) / frameRate;
  return isFinite(time) ? time : 0.0;
};

export const getFrameString = (
  frameNumber: number,
  duration: number,
  frameRate: number
) => {
  const total = getFrameNumber(duration, duration, frameRate);
  return `${frameNumber} / ${total}`;
};

export const getTimeString = (
  frameNumber: number,
  frameRate: number,
  duration: number
): string => {
  const renderHours = Math.floor(duration / 3600) > 0;
  let hours = 0;
  let time = getTime(frameNumber, frameRate);
  if (renderHours) {
    hours = Math.floor(time / 3600);
  }
  time = time % 3600;
  const minutes = Math.floor(time / 60);
  const seconds = time % 60;

  if (renderHours) {
    return (
      stringifyNumber(hours) +
      ":" +
      stringifyNumber(minutes, true) +
      ":" +
      stringifyNumber(+seconds.toFixed(0), true)
    );
  }

  return (
    stringifyNumber(minutes) + ":" + stringifyNumber(+seconds.toFixed(0), true)
  );
};

export const getFullTimeString = (
  frameNumber: number,
  frameRate: number,
  duration: number
): string => {
  return `${getTimeString(frameNumber, frameRate, duration)} / ${getTimeString(
    getFrameNumber(duration, duration, frameRate),
    frameRate,
    duration
  )}`;
};

export function withEvents<
  State extends BaseState,
  Element extends BaseElement<State>
>(
  Base: ElementConstructor<State, Element>,
  addEvents: () => Events<State>
): ElementConstructor<State, Element> {
  // @ts-ignore
  class WithElement<State> extends Base {
    getEvents() {
      const newEvents = super.getEvents();
      const events = addEvents();

      Object.entries(events).forEach(([eventType, handler]) => {
        // @ts-ignore
        const parentHandler = newEvents[eventType];
        // @ts-ignore
        newEvents[eventType] = (args) => {
          parentHandler && parentHandler(args);
          handler && handler(args);
        };
      });
      return newEvents;
    }
  }

  // @ts-ignore
  return WithElement;
}

const makeAcquirer = (
  maxVideos: number
): [() => Promise<[HTMLVideoElement, () => void]>, () => void] => {
  let VIDEOS: HTMLVideoElement[] = [];
  let QUEUE = [];
  let FREE = [];

  const clearVideo = (video: HTMLVideoElement) => {
    video.muted = true;
    video.preload = "metadata";
    video.loop = false;
  };

  const release = (video: HTMLVideoElement) => {
    return () => {
      if (!video.paused) {
        throw new Error("Release playing video");
      }

      clearVideo(video);
      if (QUEUE.length) {
        const resolve = QUEUE.shift();
        resolve([video, release(video)]);
      } else {
        FREE.push(video);
      }
    };
  };

  return [
    (): Promise<[HTMLVideoElement, () => void]> => {
      if (FREE.length) {
        const video = FREE.shift();
        return Promise.resolve([video, release(video)]);
      }

      if (VIDEOS.length < maxVideos) {
        const video = document.createElement("video");
        video.crossOrigin = "Anonymous";
        video.preload = "metadata";
        video.muted = true;
        video.loop = false;

        VIDEOS.push(video);
        return Promise.resolve([video, release(video)]);
      }

      return new Promise<[HTMLVideoElement, () => void]>((resolve) => {
        QUEUE.push(resolve);
      });
    },
    () => {
      QUEUE.forEach(clearVideo);
      FREE = [];
      QUEUE = [];
      VIDEOS = [];
    },
  ];
};

const [acquirePlayer, freePlayer] = makeAcquirer(1);

const [acquireThumbnailer, freeThumbnailers] = makeAcquirer(6);

export { acquirePlayer, acquireThumbnailer };

export const freeVideos = () => {
  freePlayer();
  freeThumbnailers();
};
