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
  update: StateUpdate<State>,
  dispatchEvent: (eventType: string, details?: any) => void
) => common.LookerElement<State>;

export const getFrameElements: GetElements<FrameState> = (
  update,
  dispatchEvent
) => {
  const elements = {
    node: common.LookerElement,
    children: [
      {
        node: frame.FrameElement,
      },
      {
        node: common.CanvasElement,
      },
      {
        node: common.HelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: frame.FrameNumberElement },
          { node: common.FullscreenButtonElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
      },
      {
        node: common.PreviousElement,
      },
      {
        node: common.NextElement,
      },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree<FrameState, common.LookerElement<FrameState>>(
    elements,
    update,
    dispatchEvent
  );
};

export const getImageElements: GetElements<ImageState> = (
  update,
  dispatchEvent
) => {
  const elements = {
    node: common.LookerElement,
    children: [
      {
        node: image.ImageElement,
      },
      {
        node: common.CanvasElement,
      },
      {
        node: common.HelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: common.FullscreenButtonElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
      },
      {
        node: common.PreviousElement,
      },
      {
        node: common.NextElement,
      },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree<ImageState, common.LookerElement<ImageState>>(
    elements,
    update,
    dispatchEvent
  );
};

export const getVideoElements: GetElements<VideoState> = (
  update,
  dispatchEvent
) => {
  const elements = {
    node: withEvents(common.LookerElement, video.withVideoLookerEvents()),
    children: [
      {
        node: video.VideoElement,
      },
      {
        node: common.CanvasElement,
      },
      {
        node: common.VideoHelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: video.SeekBarElement },
          { node: video.PlayButtonElement },
          { node: video.TimeElement },
          { node: video.VolumBarElement },
          { node: video.PlaybackRateElement },
          { node: common.FullscreenButtonElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
      },
      {
        node: common.PreviousElement,
      },
      {
        node: common.NextElement,
      },
      {
        node: common.OptionsPanelElement,
        children: [
          { node: common.UseFrameNumberOptionElement },
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
      {
        node: video.LoaderBar,
      },
    ],
  };

  return createElementsTree<VideoState, common.LookerElement<VideoState>>(
    elements,
    update,
    dispatchEvent
  );
};
