/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

interface Control {
  eventKey?: string;
  title: string;
  shortcut: string;
  detail: string;
}

const next: Control = {
  title: "Next sample",
  shortcut: "&#8594;",
  detail: "Go to the next sample",
};

const previous: Control = {
  title: "Previous sample",
  shortcut: "&#8592;",
  detail: "Go to the previous sample",
};

const rotatePrevious: Control = {
  title: "Rotate label forward",
  shortcut: "&#8595;",
  detail: "Rotate the bottom label to the back",
};

const rotateNext: Control = {
  title: "Rotate label backward",
  shortcut: "&#8593;",
  detail: "Rotate the current label to the back",
};

const help: Control = {
  title: "Display help",
  shortcut: "?",
  detail: "Display this help window",
};

const zoomIn: Control = {
  title: "Zoom in",
  shortcut: "+",
  detail: "Zoom in on the sample",
};

const zoomOut: Control = {
  title: "Zoom out",
  shortcut: "-",
  detail: "Zoom out on the sample",
};

const settings: Control = {
  title: "Settings",
  shortcut: "s",
  detail: "Show the settings panel",
};

const fullscreen: Control = {
  title: "Fullscreen",
  shortcut: "f",
  detail: "Toggle fullscreen mode",
};

export const COMMON = {
  next,
  previous,
  rotateNext,
  rotatePrevious,
  help,
  zoomIn,
  zoomOut,
  settings,
  fullscreen,
};

const nextFrame: Control = {
  title: "Next frame",
  shortcut: ".",
  detail: "Seek to the next frame",
};

const previousFrame: Control = {
  title: "Previous frame",
  shortcut: ",",
  detail: "Seek to the previous frame",
};

const playPause: Control = {
  title: "Play / pause",
  shortcut: "Space",
  eventKey: " ",
  detail: "Play or pause the video",
};

export const VIDEO = {
  playPause,
  nextFrame,
  previousFrame,
};
