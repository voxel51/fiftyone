/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import * as common from "./common";
import * as frame from "./frame";
import * as image from "./image";
import { createElementsTree } from "./util";
import * as video from "./video";

export const getFrameElements = (update: (state: any) => void) => {
  const elements = {
    node: common.PlayerBaseElement,
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

  return createElementsTree(elements, update);
};

export const getImageElements = (update: (state: any) => void) => {
  const elements = {
    node: common.PlayerBaseElement,
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

  return createElementsTree(elements, update);
};

export const getVideoElements = (update: (state: any) => void) => {
  const elements = {
    node: common.PlayerBaseElement,
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

  return createElementsTree(elements, update);
};
