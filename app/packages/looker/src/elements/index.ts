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
  config: Readonly<State["config"]>,
  update: StateUpdate<State>,
  dispatchEvent: (eventType: string, details?: any) => void
) => common.LookerElement<State>;

export const getFrameElements: GetElements<FrameState> = (
  config,
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
        node: common.ErrorElement,
      },
      { node: common.TagsElement },
      {
        node: common.ThumbnailSelectorElement,
      },
      {
        node: common.JSONPanelElement,
      },
      {
        node: common.HelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: frame.FrameNumberElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.CropToContentButtonElement },
          { node: common.FullscreenButtonElement },
          { node: common.JSONButtonElement },
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
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowIndexOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree<FrameState, common.LookerElement<FrameState>>(
    config,
    elements,
    update,
    dispatchEvent
  );
};

export const getImageElements: GetElements<ImageState> = (
  config,
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
        node: common.ErrorElement,
      },
      { node: common.TagsElement },
      {
        node: common.ThumbnailSelectorElement,
      },
      {
        node: common.JSONPanelElement,
      },
      {
        node: common.HelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: frame.FrameNumberElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.CropToContentButtonElement },
          { node: common.FullscreenButtonElement },
          { node: common.JSONButtonElement },
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
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowIndexOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowTooltipOptionElement },
        ],
      },
    ],
  };

  return createElementsTree<ImageState, common.LookerElement<ImageState>>(
    config,
    elements,
    update,
    dispatchEvent
  );
};

export const getVideoElements: GetElements<VideoState> = (
  config,
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
        node: common.ErrorElement,
      },
      { node: common.TagsElement },
      {
        node: common.ThumbnailSelectorElement,
      },
      {
        node: common.JSONPanelElement,
      },
      {
        node: video.LoaderBar,
      },
      {
        node: common.VideoHelpPanelElement,
      },
      {
        node: common.ControlsElement,
        children: [
          { node: video.SeekBarElement },
          { node: video.SeekBarThumbElement },
          { node: video.PlayButtonElement },
          { node: video.TimeElement },
          video.PLAYBACK_RATE,
          video.VOLUME,
          { node: video.SupportLockButtonElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.CropToContentButtonElement },
          { node: common.FullscreenButtonElement },
          { node: common.JSONButtonElement },
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
          { node: common.LoopVideoOptionElement },
          { node: common.OnlyShowHoveredOnLabelOptionElement },
          { node: common.ShowConfidenceOptionElement },
          { node: common.ShowIndexOptionElement },
          { node: common.ShowLabelOptionElement },
          { node: common.ShowTooltipOptionElement },
          { node: common.UseFrameNumberOptionElement },
        ],
      },
    ],
  };

  return createElementsTree<VideoState, common.LookerElement<VideoState>>(
    config,
    elements,
    update,
    dispatchEvent
  );
};
