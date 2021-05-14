/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import * as common from "./common";
import * as frame from "./frame";
import * as image from "./image";
import { Kind } from "../state";
import { createElementsTree } from "./util";
import * as video from "./video";

const getFrameElements = (
  update: (state: any) => void,
  dispatchEvent: (eventType: string, details?: any) => void
): common.LookerElement => {
  const elements = {
    node: common.LookerElement,
    children: [
      { node: frame.FrameElement },
      {
        node: common.ControlsElement,
        children: [
          { node: common.OptionsButtonElement },
          { node: frame.FrameNumberElement },
        ],
      },
      { node: common.CanvasElement },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowAttributesOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree(elements, update, dispatchEvent);
};

const getImageElements = (
  update: (state: any) => void,
  dispatchEvent: (eventType: string, details?: any) => void
): common.LookerElement => {
  const elements = {
    node: common.LookerElement,
    children: [
      { node: image.ImageElement },
      {
        node: common.ControlsElement,
        children: [{ node: common.OptionsButtonElement }],
      },
      { node: common.CanvasElement },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowAttributesOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree(elements, update, dispatchEvent);
};

const getVideoElements = (
  update: (state: any) => void,
  dispatchEvent: (eventType: string, details?: any) => void
): common.LookerElement => {
  const elements = {
    node: common.LookerElement,
    children: [
      { node: video.VideoElement },
      {
        node: common.ControlsElement,
        children: [
          { node: common.OptionsButtonElement },
          { node: video.PlayButtonElement },
          { node: video.SeekBarElement },
          { node: video.TimeElement },
        ],
      },
      { node: common.CanvasElement },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: video.UseFrameNumberOptionElement },
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowAttributesOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree(elements, update, dispatchEvent);
};

export const getElements = (
  kind: Kind,
  update: (state: any) => void,
  dispatchEvent: (eventType: string, details?: any) => void
): common.LookerElement => {
  switch (kind) {
    case Kind.Frame: {
      return getFrameElements(update, dispatchEvent);
    }
    case Kind.Image: {
      return getImageElements(update, dispatchEvent);
    }
    case Kind.Video: {
      return getVideoElements(update, dispatchEvent);
    }
    default: {
      throw new Error(`No elements tree found for kind: ${kind}`);
    }
  }
};
