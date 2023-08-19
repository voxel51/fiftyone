import {
  AbstractLooker,
  FrameLooker,
  ImageLooker,
  VideoLooker,
} from "@fiftyone/looker";
import { useEventHandler, useSetSelected } from "@fiftyone/state";
import React, {
  MutableRefObject,
  RefObject,
  useCallback,
  useLayoutEffect,
} from "react";
import {
  RecoilValueReadOnly,
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";

import * as fos from "@fiftyone/state";
import { State } from "@fiftyone/state";
import { ActionOption } from "./Common";
import Popout from "./Popout";

const useClearSampleSelection = (close) => {
  const setSelected = useSetSelected();

  return useRecoilTransaction_UNSTABLE(
    ({ reset }) =>
      () => {
        reset(fos.selectedSamples);
        setSelected([]);
        close();
      },
    [close]
  );
};

const useGridActions = (close: () => void) => {
  const elementNames = useRecoilValue(fos.elementNames);
  const clearSelection = useClearSampleSelection(close);
  const setView = fos.useSetView();
  const selected = useRecoilValue(fos.selectedSamples);
  const addStage = useCallback(
    (name: string) => {
      setView((cur) => [
        ...cur,
        {
          _cls: `fiftyone.core.stages.${name}`,
          kwargs: [["sample_ids", [...selected]]],
        },
      ]);
      close();
    },
    [selected]
  );
  return [
    {
      text: `Clear selected ${elementNames.plural}`,
      title: `Deselect all selected ${elementNames.plural}`,
      onClick: clearSelection,
    },
    {
      text: `Only show selected ${elementNames.plural}`,
      title: `Hide all other ${elementNames.plural}`,
      onClick: () => addStage("Select"),
    },
    {
      text: `Hide selected ${elementNames.plural}`,
      title: `Show only unselected ${elementNames.plural}`,
      onClick: () => addStage("Exclude"),
    },
  ];
};

const toLabelMap = (
  labels: fos.State.SelectedLabel[]
): fos.State.SelectedLabelMap =>
  Object.fromEntries(labels.map(({ labelId, ...rest }) => [labelId, rest]));

const useSelectVisible = (
  visibleAtom?: RecoilValueReadOnly<fos.State.SelectedLabel[]> | null,
  visible?: fos.State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabels);
    visible = visibleAtom ? await snapshot.getPromise(visibleAtom) : visible;

    set(fos.selectedLabels, {
      ...selected,
      ...toLabelMap(visible || []),
    });
  });
};

const useUnselectVisible = (
  visibleIdsAtom?: RecoilValueReadOnly<Set<string>>,
  visibleIds?: Set<string>
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabels);
    visibleIds = visibleIdsAtom
      ? await snapshot.getPromise(visibleIdsAtom)
      : visibleIds;

    const filtered = Object.entries(selected).filter(
      ([label_id]) => !visibleIds.has(label_id)
    );
    set(fos.selectedLabels, Object.fromEntries(filtered));
  });
};

const useClearSelectedLabels = (close) => {
  return useRecoilCallback(
    ({ set }) =>
      async () => {
        set(fos.selectedLabels, {});
        close();
      },
    []
  );
};

const useHideSelected = () => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabels);
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    set(fos.selectedLabels, {});
    set(fos.hiddenLabels, { ...hidden, ...selected });
  });
};

const useHideOthers = (
  visibleAtom?: RecoilValueReadOnly<State.SelectedLabel[]>,
  visible?: State.SelectedLabel[]
) => {
  return useRecoilCallback(({ snapshot, set }) => async () => {
    const selected = await snapshot.getPromise(fos.selectedLabelIds);
    visible = visibleAtom ? await snapshot.getPromise(visibleAtom) : visible;
    const hidden = await snapshot.getPromise(fos.hiddenLabels);
    set(fos.hiddenLabels, {
      ...hidden,
      ...toLabelMap(visible.filter(({ labelId }) => !selected.has(labelId))),
    });
  });
};

const hasSetDiff = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => !b.has(e))).size > 0;

const hasSetInt = <T extends unknown>(a: Set<T>, b: Set<T>): boolean =>
  new Set([...a].filter((e) => b.has(e))).size > 0;

const toIds = (labels: State.SelectedLabel[]) =>
  new Set([...labels].map(({ labelId }) => labelId));

const useVisibleSampleLabels = (lookerRef: RefObject<AbstractLooker>) => {
  const isGroup = useRecoilValue(fos.isGroup);
  const activeLabels = useRecoilValue(fos.activeLabels({}));

  const currentSampleLabels = lookerRef.current
    ? lookerRef.current.getCurrentSampleLabels()
    : [];

  if (isGroup) {
    return activeLabels;
  }

  return currentSampleLabels;
};

const useModalActions = (
  lookerRef: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >,
  close
) => {
  const selected = useRecoilValue(fos.selectedSamples);
  const clearSelection = useClearSampleSelection(close);
  const selectedLabels = useRecoilValue(fos.selectedLabelIds);
  const visibleSampleLabels = useVisibleSampleLabels(lookerRef);
  const isVideo =
    useRecoilValue(fos.isVideoDataset) && useRecoilValue(fos.isRootView);
  const visibleFrameLabels =
    lookerRef.current instanceof VideoLooker
      ? lookerRef.current.getCurrentFrameLabels()
      : new Array<fos.State.SelectedLabel>();

  const closeAndCall = (callback) => {
    return React.useCallback(() => {
      close();
      callback();
    }, []);
  };
  const elementNames = useRecoilValue(fos.elementNames);

  const hasVisibleUnselected = hasSetDiff(
    toIds(visibleSampleLabels),
    selectedLabels
  );
  const hasFrameVisibleUnselected = hasSetDiff(
    toIds(visibleFrameLabels),
    selectedLabels
  );
  const hasVisibleSelection = hasSetInt(
    selectedLabels,
    toIds(visibleSampleLabels)
  );

  return [
    selected.size > 0 && {
      text: `Clear selected ${elementNames.plural}`,
      title: `Deselect all selected ${elementNames.plural}`,
      onClick: clearSelection,
    },
    {
      text: `Select visible (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(null, visibleSampleLabels)),
    },
    {
      text: `Unselect visible (current ${elementNames.singular})`,
      hidden: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(null, toIds(visibleSampleLabels))
      ),
    },
    isVideo && {
      text: "Select visible (current frame)",
      hidden: !hasFrameVisibleUnselected,
      onClick: closeAndCall(useSelectVisible(null, visibleFrameLabels)),
    },
    isVideo && {
      text: "Unselect visible (current frame)",
      hidden: !hasVisibleSelection,
      onClick: closeAndCall(
        useUnselectVisible(null, toIds(visibleFrameLabels))
      ),
    },
    {
      text: "Clear selection",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useClearSelectedLabels(close)),
    },
    {
      text: "Hide selected",
      hidden: !selectedLabels.size,
      onClick: closeAndCall(useHideSelected()),
    },
    {
      text: `Hide unselected (current ${elementNames.singular})`,
      hidden: !hasVisibleUnselected,
      onClick: closeAndCall(useHideOthers(null, visibleSampleLabels)),
    },
    isVideo && {
      text: "Hide unselected (current frame)",
      hidden: !hasFrameVisibleUnselected,
      onClick: closeAndCall(useHideOthers(null, visibleFrameLabels)),
    },
  ].filter(Boolean);
};

interface SelectionActionsProps {
  modal: boolean;
  close: () => void;
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
  bounds: any;
  anchorRef?: MutableRefObject<unknown>;
}

const SelectionActions = ({
  modal,
  close,
  lookerRef,
  bounds,
  anchorRef,
}: SelectionActionsProps) => {
  useLayoutEffect(() => {
    lookerRef &&
      lookerRef.current instanceof VideoLooker &&
      lookerRef.current.pause &&
      lookerRef.current.pause();
  });
  const actions = modal
    ? useModalActions(lookerRef, close)
    : useGridActions(close);

  lookerRef && useEventHandler(lookerRef.current, "play", close);

  return (
    <Popout modal={modal} bounds={bounds} fixed anchorRef={anchorRef} data-cy="selected-popout">
      {actions.map((props, i) => (
        <ActionOption {...props} key={i} />
      ))}
    </Popout>
  );
};

export default React.memo(SelectionActions);
