/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import * as common from "./common";
import * as frame from "./frame";
import * as image from "./image";
import {
  BaseState,
  FrameState,
  ImageState,
  StateUpdate,
  VideoState,
} from "../state";
import { createElementsTree, withEvents } from "./util";
import * as video from "./video";

export type GetElements<State extends BaseState> = (
  state: Readonly<State>,
  update: StateUpdate<State>,
  dispatchEvent: (eventType: string, details?: any) => void
) => common.LookerElement<State>;

export const getFrameElements: GetElements<FrameState> = (
  state,
  update,
  dispatchEvent
) => {
  const elements = {
    node: common.LookerElement,
    children: [
      {
        node: common.WindowElement,
        children: [
          { node: frame.FrameElement },
          { node: common.CanvasElement },
        ],
      },
      {
        node: common.ControlsElement,
        children: [
          { node: common.OptionsButtonElement },
          { node: frame.FrameNumberElement },
        ],
      },
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

  return createElementsTree<FrameState, common.LookerElement<FrameState>>(
    elements,
    state,
    update,
    dispatchEvent
  );
};

export const getImageElements: GetElements<ImageState> = (
  state,
  update,
  dispatchEvent
) => {
  const elements = {
    node: common.LookerElement,
    children: [
      {
        node: common.WindowElement,
        children: [
          { node: image.ImageElement },
          { node: common.CanvasElement },
        ],
      },
      {
        node: common.ControlsElement,
        children: [{ node: common.OptionsButtonElement }],
      },
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

  return createElementsTree<ImageState, common.LookerElement<ImageState>>(
    elements,
    state,
    update,
    dispatchEvent
  );
};

export const getVideoElements: GetElements<VideoState> = (
  state,
  update,
  dispatchEvent
) => {
  const elements = {
    node: withEvents(common.LookerElement, video.withVideoLookerEvents()),
    children: [
      {
        node: common.WindowElement,
        children: [
          { node: video.VideoElement },
          { node: common.CanvasElement },
        ],
      },
      {
        node: common.ControlsElement,
        children: [
          { node: common.OptionsButtonElement },
          { node: video.PlayButtonElement },
          { node: video.SeekBarElement },
          { node: video.TimeElement },
        ],
      },
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

  return createElementsTree<VideoState, common.LookerElement<VideoState>>(
    elements,
    state,
    update,
    dispatchEvent
  );
};
