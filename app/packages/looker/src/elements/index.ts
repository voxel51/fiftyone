/**
 * Copyright 2017-2025, Voxel51, Inc.
 */
import type {
  BaseState,
  FrameState,
  ImaVidState,
  ImageState,
  StateUpdate,
  ThreeDState,
  VideoState,
} from "../state";
import type { BaseElement } from "./base";
import * as common from "./common";
import * as frame from "./frame";
import * as image from "./image";
import * as imavid from "./imavid";
import * as pcd from "./three-d";
import type { ElementsTemplate } from "./util";
import { createElementsTree, withEvents } from "./util";
import * as video from "./video";

export type GetElements<State extends BaseState> = (params: {
  abortController: AbortController;
  batchUpdate?: (cb: () => unknown) => void;
  config: Readonly<State["config"]>;
  dispatchEvent: (eventType: string, details?: any) => void;
  update: StateUpdate<State>;
}) => common.LookerElement<State>;

export const getFrameElements: GetElements<FrameState> = (params) => {
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
        node: common.ControlsElement,
        children: [
          { node: frame.FrameNumberElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.CropToContentButtonElement },
          { node: common.ToggleOverlaysButtonElement },
          { node: common.JSONButtonElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
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

  return createElementsTree<FrameState, common.LookerElement<FrameState>>({
    ...params,
    root: elements,
  });
};

export const getImageElements: GetElements<ImageState> = (params) => {
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
        node: common.ControlsElement,
        children: [
          { node: frame.FrameNumberElement },
          { node: common.PlusElement },
          { node: common.MinusElement },
          { node: common.CropToContentButtonElement },
          { node: common.ToggleOverlaysButtonElement },
          { node: common.JSONButtonElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
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

  return createElementsTree<ImageState, common.LookerElement<ImageState>>({
    ...params,
    root: elements,
  });
};

export const getVideoElements: GetElements<VideoState> = (params) => {
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
        node: video.LoaderBar,
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
          { node: common.ToggleOverlaysButtonElement },
          { node: common.JSONButtonElement },
          { node: common.OptionsButtonElement },
          { node: common.HelpButtonElement },
        ],
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

  return createElementsTree<VideoState, common.LookerElement<VideoState>>({
    ...params,
    root: elements,
  });
};

export const getImaVidElements: GetElements<ImaVidState> = (params) => {
  const isThumbnail = params.config.thumbnail;
  const children: ElementsTemplate<
    ImaVidState,
    BaseElement<ImaVidState>
  >["children"] = [
    {
      node: imavid.ImaVidElement,
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
  ];

  if (isThumbnail) {
    children.push({
      node: imavid.LoaderBar,
    });
  }

  children.push(
    {
      node: imavid.ImaVidControlsElement,
      children: [
        { node: common.PlusElement },
        { node: common.MinusElement },
        { node: common.CropToContentButtonElement },
        { node: common.ToggleOverlaysButtonElement },
        { node: common.JSONButtonElement },
        { node: common.OptionsButtonElement },
        { node: common.HelpButtonElement },
      ],
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
      ],
    }
  );

  const elements = {
    node: withEvents(common.LookerElement, imavid.withImaVidLookerEvents()),
    children,
  };

  return createElementsTree<ImaVidState, common.LookerElement<ImaVidState>>({
    ...params,
    root: elements,
  });
};

export const get3dElements: GetElements<ThreeDState> = (params) => {
  const elements = {
    node: common.LookerElement,
    children: [
      {
        node: pcd.ThreeDElement,
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

  return createElementsTree<ThreeDState, common.LookerElement<ThreeDState>>({
    ...params,
    root: elements,
  });
};
