import { MIN_PIXELS } from "./constants";
import { POINTS_FROM_FO } from "./overlays";
import { Overlay } from "./overlays/base";
import {
  BoundingBox,
  Coordinates,
  Dimensions,
  FrameState,
  ImageState,
  VideoState,
} from "./state";
import { getContainingBox, mergeUpdates, snapBox } from "./util";

const adjustBox = (
  [w, h]: Dimensions,
  [obtlx, obtly, obw, obh]: BoundingBox
): {
  center: Coordinates;
  box: BoundingBox;
} => {
  const ar = obw / obh;
  let [btlx, btly, bw, bh] = [obtlx, obtly, obw, obh];

  if (bw * w < MIN_PIXELS) {
    bw = MIN_PIXELS / w;
    bh = bw / ar;
    btlx = obtlx + obw / 2 - bw / 2;
    btly = obtly + obh / 2 - bh / 2;
  }

  if (bh * h < MIN_PIXELS) {
    bh = MIN_PIXELS / h;
    bw = bh * ar;
    btlx = obtlx + obw / 2 - bw / 2;
    btly = obtly + obh / 2 - bh / 2;
  }

  return {
    center: [obtlx + obw / 2, obtly + obh / 2],
    box: [btlx, btly, bw, bh],
  };
};

export const zoomToContent = <
  State extends FrameState | ImageState | VideoState
>(
  state: Readonly<State>,
  overlays: Overlay<State>[]
): State => {
  const points = overlays.map((o) => o.getPoints(state)).flat();
  const [iw, ih] = state.dimensions;
  let [w, h] = [iw, ih];
  const iAR = w / h;
  const {
    center: [cw, ch],
    box: [_, __, bw, bh],
  } = adjustBox([w, h], getContainingBox(points));

  const [___, ____, ww, wh] = state.windowBBox;
  const wAR = ww / wh;

  let scale = 1;
  let pan: Coordinates = [0, 0];
  const squeeze = 1 - state.options.zoomPad;

  if (wAR < iAR) {
    scale = Math.max(1, 1 / bw);
    w = ww * scale;
    h = w / iAR;
    if (!state.config.thumbnail && bh * h > wh) {
      scale = Math.max(1, (wh * scale) / (bh * h));
      w = ww * scale;
      h = w / iAR;
    }
  } else {
    scale = Math.max(1, 1 / bh);
    h = wh * scale;
    w = h * iAR;
    if (!state.config.thumbnail && bw * w > ww) {
      scale = Math.max(1, (ww * scale) / (bw * w));
      h = wh * scale;
      w = h * iAR;
    }
  }

  const marginX = (scale * ww - w) / 2;
  const marginY = (scale * wh - h) / 2;
  pan = [-w * cw - marginX + ww / 2, -h * ch - marginY + wh / 2];

  // Scale down and reposition for a centered patch with padding
  if ((w * squeeze > ww && h * squeeze > wh) || !state.config.thumbnail) {
    scale = squeeze * scale;
    pan[0] = pan[0] * squeeze + (bw * w * (1 - squeeze)) / 2;
    pan[1] = pan[1] * squeeze + (bh * h * (1 - squeeze)) / 2;
  }

  pan = snapBox(scale, pan, [ww, wh], [iw, ih], !state.config.thumbnail);

  return mergeUpdates(state, { scale: scale, pan });
};

export const zoomAspectRatio = (
  sample: object,
  mediaAspectRatio: number
): number => {
  let points = [];
  Object.entries(sample).forEach(([_, label]) => {
    if (label && label._cls in POINTS_FROM_FO) {
      points = [...points, ...POINTS_FROM_FO[label._cls](label)];
    }
  });
  let [_, __, width, height] = getContainingBox(points);

  if (width === 0 || height === 0) {
    if (width === height) {
      width = 1;
      height = 1;
    } else if (height === 0) {
      height = width;
    } else {
      width = height;
    }
  }
  return (width / height) * mediaAspectRatio;
};
