/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { BaseElement } from "./base";

export const FRAME_ZERO_OFFSET = 1;

export const ICONS = Object.freeze({
  play:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath fill="rgb(238, 238, 238)" d="M8 5v14l11-7z"/%3E%3Cpath d="M0 0h24v24H0z" fill="none"/%3E%3C/svg%3E',
  pause:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24"%3E%3Cpath fill="rgb(238, 238, 238)" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/%3E%3Cpath d="M0 0h24v24H0z" fill="none"/%3E%3C/svg%3E',
  options:
    'data:image/svg+xml,%0A%3Csvg xmlns="http://www.w3.org/2000/svg" enable-background="new 0 0 24 24" height="24" viewBox="0 0 24 24" width="24"%3E%3Cg%3E%3Cpath d="M0,0h24v24H0V0z" fill="none"/%3E%3Cpath fill="rgb(238, 238, 238)" d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/%3E%3C/g%3E%3C/svg%3E',
});

export const makeWrapper = function (children) {
  const wrapper = document.createElement("div");
  wrapper.className = "p51-opt-input";
  for (const child of children) {
    wrapper.appendChild(child);
  }
  return wrapper;
};

export const makeCheckboxRow = function (
  text,
  checked
): [HTMLLabelElement, HTMLInputElement] {
  const label = document.createElement("label");
  label.className = "p51-label";
  label.innerHTML = text;

  const checkbox = document.createElement("input");
  checkbox.setAttribute("type", "checkbox");
  checkbox.checked = checked;
  const span = document.createElement("span");
  span.className = "p51-checkbox";
  label.appendChild(checkbox);
  label.appendChild(span);

  return [label, checkbox];
};

interface ElementsTemplate {
  node: new (
    update: (state: any) => void,
    dispatchEvent: (eventType: string, details?: any) => void,
    children?: BaseElement[]
  ) => BaseElement;
  children?: ElementsTemplate[];
}

export function createElementsTree(
  root: ElementsTemplate,
  update: (state: any) => void,
  dispatchEvent: (eventType: string, details?: any) => void
) {
  let children = new Array<BaseElement>();
  children = root.children
    ? root.children.map((child) =>
        createElementsTree(child, update, dispatchEvent)
      )
    : children;

  return new root.node(update, dispatchEvent, children);
}

const secondsToHhmmss = function (number: number): string {
  let str = "";
  if (number == 0) {
    str = "00";
  } else if (number < 10) {
    str += "0" + number;
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
  const frameDuration = 1 / frameRate;

  // account for exact end of video
  if (time === duration) {
    time -= frameDuration / 2;
  }
  return Math.floor(time * frameRate + FRAME_ZERO_OFFSET);
};

export const getFrameString = (
  currentTime: number,
  duration: number,
  frameRate: number
) => {
  const current = getFrameNumber(currentTime, duration, frameRate);
  const total = getFrameNumber(duration, duration, frameRate);
  return `${current} / ${total}`;
};

export const getTimeString = (
  currentTime: number,
  duration: number
): string => {
  const renderHours = Math.floor(duration / 3600) > 0;
  let hours = 0;
  if (renderHours) {
    hours = Math.floor(currentTime / 3600);
  }
  currentTime = currentTime % 3600;
  const minutes = Math.floor(currentTime / 60);
  const seconds = currentTime % 60;

  const mmss =
    secondsToHhmmss(minutes) + ":" + secondsToHhmmss(+seconds.toFixed(2));

  if (renderHours) {
    return secondsToHhmmss(hours) + ":" + mmss;
  }
  return mmss;
};
