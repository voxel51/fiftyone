import type { Lookers } from "@fiftyone/looker";
import { VideoLooker } from "@fiftyone/looker";
import {
  useIsPlaybackPlaying,
  useRequestPlaybackPause,
} from "@fiftyone/playback";
import * as fos from "@fiftyone/state";
import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect } from "react";
import { useRecoilValue } from "recoil";
import type { ActionOptionProps } from "../Common";
import { ActionOption } from "../Common";
import Popout from "../Popout";
import {
  useClearSampleSelection,
  useClearSelectedLabels,
  useHideOthers,
  useHideSelected,
  useSelectVisible,
  useUnselectVisible,
  useVisibleFrameLabels,
  useVisibleSampleLabels,
} from "./hooks";
import { hasSetDiff, hasSetInt, toIds } from "./utils";

export default ({
  anchorRef,
  close,
  lookerRef,
}: {
  anchorRef: MutableRefObject<HTMLDivElement | null>;
  close: () => void;
  /**
   * Optional: video Explore renders through Lighter and mounts no `Looker`,
   * so every read below degrades to a looker-free source rather than gating
   * this whole menu off (which silently fell back to the Grid variant).
   */
  lookerRef?: MutableRefObject<Lookers | undefined>;
}) => {
  const selected = useRecoilValue(fos.selectedSamples);
  const clearSelection = useClearSampleSelection(close);
  const selectedLabels = useRecoilValue(fos.selectedLabelIds);
  const visibleSampleLabels = useVisibleSampleLabels(lookerRef);
  const isRoot = useRecoilValue(fos.isRootView);
  const isVideo = useRecoilValue(fos.isVideoDataset) && isRoot;
  const lighterFrameLabels = useVisibleFrameLabels();
  const requestPlaybackPause = useRequestPlaybackPause();
  const visibleFrameLabels =
    lookerRef?.current instanceof VideoLooker
      ? lookerRef.current.getCurrentFrameLabels()
      : lighterFrameLabels;

  // Freeze the frame while the menu is open: "select visible labels in this
  // frame" is meaningless if the frame advances underneath the choice. The
  // looker path pauses itself; the timeline surface publishes its `pause`
  // through an atom because this menu renders outside its provider.
  //
  // Once per mount. Without a dependency list this ran on EVERY render of the
  // menu, re-issuing the pause each time — which on the multimodal surface
  // meant opening this menu repeatedly stopped episode playback.
  useLayoutEffect(() => {
    if (lookerRef?.current instanceof VideoLooker) {
      lookerRef.current.pause?.();
      return;
    }

    requestPlaybackPause();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close if playback starts anyway, so the menu cannot act on a moving frame.
  //
  // Two ways in, because the two surfaces announce it differently: the looker
  // fires its own `play` event, while the timeline surface has no looker at
  // all — there, `TimelineControls` binds Space in `KnownContexts.Modal` and
  // `CommandContextManager` dispatches from `document` unless the target is a
  // text input, which this popout is not. So Space reaches playback with the
  // menu open, and only the playing flag reports it.
  fos.useEventHandler(lookerRef?.current, "play", close);

  const isPlaying = useIsPlaybackPlaying();

  useEffect(() => {
    if (isPlaying) {
      close();
    }
  }, [isPlaying, close]);

  const closeAndCall = (callback) => {
    return useCallback(() => {
      close();
      callback();
    }, [callback, close]);
  };
  const elementNames = useRecoilValue(fos.elementNames);

  const hasVisibleUnselected = hasSetDiff(
    toIds(visibleSampleLabels),
    selectedLabels,
  );
  const hasFrameVisibleUnselected = hasSetDiff(
    toIds(visibleFrameLabels),
    selectedLabels,
  );
  const hasVisibleSelection = hasSetInt(
    selectedLabels,
    toIds(visibleSampleLabels),
  );
  const hasFrameVisibleSelection = hasSetInt(
    selectedLabels,
    toIds(visibleFrameLabels),
  );

  const items: ({ key: string } & ActionOptionProps)[] = [];
  if (selected.size > 0) {
    items.push({
      key: "clear",
      text: `Clear selected ${elementNames.plural}`,
      title: `Deselect all selected ${elementNames.plural}`,
      onClick: clearSelection,
    });
  }

  items.push(
    {
      key: "select",
      text: `Select visible (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(null, visibleSampleLabels)),
    },
    {
      key: "unselect",
      text: `Unselect visible (current ${elementNames.singular})`,
      hidden: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(undefined, toIds(visibleSampleLabels)),
      ),
    },
  );

  if (isVideo) {
    items.push(
      {
        key: "select-frame",
        text: "Select visible labels (current frame)",
        hidden: !hasFrameVisibleUnselected,
        onClick: closeAndCall(useSelectVisible(null, visibleFrameLabels)),
      },
      {
        key: "unselect-frame",
        text: "Unselect visible labels (current frame)",
        hidden: !hasFrameVisibleSelection,
        onClick: closeAndCall(
          useUnselectVisible(undefined, toIds(visibleFrameLabels)),
        ),
      },
    );
  }

  items.push(
    {
      key: "clear-labels",
      text: "Clear selected labels",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useClearSelectedLabels(close)),
    },
    {
      key: "hide-labels",
      text: "Hide selected labels",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useHideSelected()),
    },
    {
      key: "hide-unselected-labels",
      text: `Hide unselected labels (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useHideOthers(undefined, visibleSampleLabels)),
    },
  );

  if (isVideo) {
    items.push({
      key: "hide-unselected-labels-frame",
      text: "Hide unselected labels (current frame)",
      hidden: !hasFrameVisibleUnselected,
      onClick: closeAndCall(useHideOthers(undefined, visibleFrameLabels)),
    });
  }

  return (
    <Popout modal={true} fixed anchorRef={anchorRef}>
      {items.map(({ key, ...props }) => (
        <ActionOption key={key} {...props} />
      ))}
    </Popout>
  );
};
