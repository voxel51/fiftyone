import { useTrackEvent } from "@fiftyone/analytics";
import {
  AdaptiveMenu,
  AdaptiveMenuItemComponentPropsType,
  LoadingDots,
  PillButton,
  useTheme,
} from "@fiftyone/components";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import {
  OperatorPlacementWithErrorBoundary,
  OperatorPlacements,
  types,
  useOperatorBrowser,
  useOperatorPlacements,
} from "@fiftyone/operators";
import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOutsideClick } from "@fiftyone/state";
import { useItemsWithOrderPersistence } from "@fiftyone/utilities";
import {
  Bookmark,
  Check,
  ColorLens,
  FlipToBack,
  Fullscreen,
  FullscreenExit,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  List,
  LocalOffer,
  Search,
  Settings,
  VisibilityOff,
  Wallpaper,
} from "@mui/icons-material";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import { Box } from "@mui/material";
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Draggable from "react-draggable";
import {
  selector,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import { activeColorEntry } from "../ColorModal/state";
import { ACTIVE_FIELD } from "../ColorModal/utils";
import { useModalContext } from "../Modal/hooks";
import { DynamicGroupAction } from "./DynamicGroupAction";
import { GroupMediaVisibilityContainer } from "./GroupMediaVisibilityContainer";
import OptionsActions from "./Options";
import Patcher, { patchesFields } from "./Patcher";
import Selector from "./Selected";
import Tagger from "./Tagger";
import SortBySimilarity from "./similar/Similar";
import { ActionDiv, getStringAndNumberProps } from "./utils";

const MODAL_ACTION_BAR_HANDLE_CLASS = "fo-modal-action-bar-handle";

export const shouldToggleBookMarkIconOnSelector = selector<boolean>({
  key: "shouldToggleBookMarkIconOn",
  get: ({ get }) => {
    const hasFiltersValue = get(fos.hasFilters(false));
    const { selection } = get(fos.extendedSelection);
    const selectedSampleSet = get(fos.selectedSamples);
    const isSimilarityOn = get(fos.similarityParameters);

    const excludedFields = get(fos.excludedPathsState({}));
    const datasetName = get(fos.datasetName);
    const affectedPathCount = datasetName
      ? excludedFields?.[datasetName]?.size
      : 0;

    const isAttributeVisibilityOn = affectedPathCount > 0;

    const isExtendedSelectionOn =
      (selection && selection.length > 0) || isSimilarityOn;

    return Boolean(
      isExtendedSelectionOn ||
        hasFiltersValue ||
        selectedSampleSet.size > 0 ||
        isAttributeVisibilityOn
    );
  },
});

const Loading = ({ style }: { style?: React.CSSProperties }) => {
  const theme = useTheme();
  return (
    <LoadingDots
      text=""
      style={{ color: theme.text.primary, ...(style ?? {}) }}
    />
  );
};

const Patches = ({ adaptiveMenuItemProps }: ActionProps) => {
  const [open, setOpen] = useState(false);
  const loading = useRecoilValue(fos.patching);
  const isVideo = useRecoilValue(fos.isVideoDataset);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const fields = useRecoilValue(patchesFields);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        icon={loading ? <Loading /> : <FlipToBack />}
        open={open}
        onClick={() => !loading && setOpen(!open)}
        highlight={open || Boolean(fields.length)}
        title={isVideo ? "Clips" : "Patches"}
        style={{ cursor: loading ? "default" : "pointer" }}
        data-cy="action-clips-patches"
      />
      {open && <Patcher close={() => setOpen(false)} anchorRef={ref} />}
    </ActionDiv>
  );
};

const Similarity = ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [isImageSearch, setIsImageSearch] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  const { showImageSimilarityIcon } = fos.useSimilarityType({
    isImageSearch,
  });

  const toggleSimilarity = useCallback(() => {
    setOpen((open) => !open);
    setIsImageSearch(showImageSimilarityIcon);
  }, [showImageSimilarityIcon]);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        key={"button"}
        icon={showImageSimilarityIcon ? <Wallpaper /> : <Search />}
        open={open}
        tooltipPlacement={modal ? "bottom" : "top"}
        onClick={toggleSimilarity}
        highlight={true}
        title={`Sort by ${
          showImageSimilarityIcon ? "image" : "text"
        } similarity`}
        style={{ cursor: "pointer" }}
        data-cy="action-sort-by-similarity"
      />
      {open && (
        <SortBySimilarity
          key={`similary-${showImageSimilarityIcon ? "image" : "text"}`}
          modal={modal}
          close={() => setOpen(false)}
          isImageSearch={isImageSearch}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};

const Tag = ({
  modal,
  lookerRef,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
}) => {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const labels = useRecoilValue(fos.selectedLabelIds);
  const samples = useRecoilValue(fos.selectedSamples);
  const canTag = useRecoilValue(fos.canTagSamplesOrLabels);
  const disableTag = !canTag.enabled;

  const selected = labels.size > 0 || samples.size > 0;
  const tagging = useRecoilValue(fos.anyTagging);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const disabled = tagging || disableTag;

  lookerRef &&
    useEventHandler(lookerRef.current, "play", () => {
      open && setOpen(false);
      setAvailable(false);
    });
  lookerRef &&
    useEventHandler(lookerRef.current, "pause", () => setAvailable(true));

  const baseTitle = `Tag sample${modal ? "" : "s"} or labels`;

  const title = disabled
    ? (canTag.message || "").replace("#action", baseTitle.toLowerCase())
    : baseTitle;

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        tooltipPlacement={modal ? "bottom" : "top"}
        style={{
          cursor: disableTag
            ? "not-allowed"
            : disabled || !available
            ? "default"
            : "pointer",
        }}
        icon={tagging ? <Loading /> : <LocalOffer />}
        open={open}
        onClick={() => !disabled && available && !disableTag && setOpen(!open)}
        highlight={(selected || open) && available}
        title={title}
        data-cy="action-tag-sample-labels"
      />
      {open && available && (
        <Tagger
          modal={modal}
          close={() => setOpen(false)}
          lookerRef={lookerRef}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};

const Selected = ({
  modal,
  lookerRef,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
  lookerRef?: MutableRefObject<fos.Lookers | undefined>;
}) => {
  const { refresh } = adaptiveMenuItemProps || {};
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const samples = useRecoilValue(fos.selectedSamples);
  const labels = useRecoilValue(fos.selectedLabelIds);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  lookerRef &&
    useEventHandler(lookerRef.current, "buffering", (e) =>
      setLoading(e.detail)
    );

  useEffect(() => {
    refresh?.();
  }, [samples.size, refresh]);

  useEffect(() => {
    return () => {
      setLoading(false);
    };
  }, []);

  if (samples.size < 1 && !modal) {
    return null;
  }

  let text = samples.size.toLocaleString();
  if (samples.size > 0 && labels.size > 0 && modal) {
    text = `${text} | ${labels.size.toLocaleString()}`;
  } else if (labels.size > 0 && modal) {
    text = labels.size.toLocaleString();
  }

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        icon={loading ? <Loading /> : <Check />}
        open={open}
        onClick={() => {
          if (loading) {
            return;
          }
          setOpen(!open);
        }}
        highlight={samples.size > 0 || open || (labels.size > 0 && modal)}
        text={text}
        title={`Manage selected`}
        tooltipPlacement={modal ? "bottom" : "top"}
        style={{
          cursor: loading ? "default" : "pointer",
        }}
        data-cy="action-manage-selected"
      />
      {open && (
        <Selector
          modal={modal}
          close={() => setOpen(false)}
          lookerRef={lookerRef}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};

const Options = ({
  modal,
  adaptiveMenuItemProps,
}: ActionProps & { modal?: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        tooltipPlacement={modal ? "bottom" : "top"}
        icon={<Settings />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open}
        title={"Display options"}
        data-cy="action-display-options"
      />
      {open && <OptionsActions modal={modal} anchorRef={ref} />}
    </ActionDiv>
  );
};

const Colors = ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const trackEvent = useTrackEvent();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [activeField, setActiveField] = useRecoilState(activeColorEntry);

  const onOpen = () => {
    trackEvent("open_color_settings");
    setOpen(!open);
    setActiveField(ACTIVE_FIELD.GLOBAL);
    adaptiveMenuItemProps?.closeOverflow?.();
  };

  useEffect(() => {
    if (activeField) {
      !open && setOpen(true);
    } else {
      open && setOpen(false);
    }
  }, [Boolean(activeField)]);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        data-cy="action-color-settings"
        highlight={open}
        icon={<ColorLens />}
        onClick={onOpen}
        open={open}
        title={"Color settings"}
        tooltipPlacement={modal ? "bottom" : "top"}
      />
    </ActionDiv>
  );
};

const Hidden = ({ modal }: { modal?: boolean }) => {
  const [hiddenObjects, setHiddenObjects] = useRecoilState(fos.hiddenLabels);
  const count = Object.keys(hiddenObjects).length;

  if (count < 1) {
    return null;
  }

  return (
    <PillButton
      icon={<VisibilityOff />}
      tooltipPlacement={modal ? "bottom" : "top"}
      open={true}
      onClick={() => setHiddenObjects({})}
      highlight={true}
      style={modal ? { padding: "0 0.5em" } : {}}
      text={`${count}`}
      title={"Clear hidden labels"}
      data-cy="action-clear-hidden-labels"
    />
  );
};

const SaveFilters = ({ adaptiveMenuItemProps }: ActionProps) => {
  const loading = useRecoilValue(fos.savingFilters);

  const saveFilters = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const loading = await snapshot.getPromise(fos.savingFilters);
        const selected = await snapshot.getPromise(fos.selectedSamples);
        const fvStage = await snapshot.getPromise(fos.fieldVisibilityStage);

        if (loading) {
          return;
        }

        const unsubscribe = subscribe((_, { set, reset }) => {
          set(fos.savingFilters, false);
          reset(fos.extendedSelection);
          reset(fos.viewStateForm_INTERNAL);
          unsubscribe();
        });

        set(fos.savingFilters, true);
        set(fos.viewStateForm_INTERNAL, {
          filters: await snapshot.getPromise(fos.filters),
          extended: await snapshot.getPromise(fos.extendedStages),
        });
        if (selected.size > 0) {
          set(fos.view, (v) => [
            ...v,
            {
              _cls: "fiftyone.core.stages.Select",
              kwargs: [["sample_ids", [...selected]]],
            } as fos.State.Stage,
          ]);
        } else {
          set(fos.view, (v) => v);
        }

        const fvFieldNames = fvStage?.kwargs?.field_names;
        if (fvFieldNames) {
          set(fos.view, (v) => [
            ...v,
            {
              _cls: "fiftyone.core.stages.ExcludeFields",
              kwargs: [["field_names", [...fvFieldNames]]],
            } as fos.State.Stage,
          ]);
        }
      },
    []
  );

  const shouldToggleBookMarkIconOn = useRecoilValue(
    shouldToggleBookMarkIconOnSelector
  );

  return shouldToggleBookMarkIconOn ? (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        open={false}
        highlight={true}
        icon={loading ? <Loading /> : <Bookmark />}
        style={{ cursor: loading ? "default" : "pointer" }}
        onClick={saveFilters}
        title={"Convert current filters and/or sorting to view stages"}
        data-cy="action-convert-filters-to-view-stages"
      />
    </ActionDiv>
  ) : null;
};

const ToggleModalFullScreen = () => {
  const [fullScreen, setFullScreen] = useRecoilState(fos.fullscreen);

  return (
    <PillButton
      icon={fullScreen ? <FullscreenExit /> : <Fullscreen />}
      open={fullScreen}
      highlight={fullScreen}
      onClick={() => setFullScreen(!fullScreen)}
      tooltipPlacement="bottom"
      title={fullScreen ? "Exit fullscreen (f)" : "Enter fullscreen (f)"}
      data-cy="action-toggle-fullscreen"
    />
  );
};

const ToggleSidebar: React.FC<
  ActionProps & {
    modal: boolean;
  }
> = React.forwardRef(({ modal, adaptiveMenuItemProps }, ref) => {
  const [visible, setVisible] = useRecoilState(fos.sidebarVisible(modal));

  return (
    <PillButton
      onClick={() => {
        setVisible(!visible);
      }}
      title={`${visible ? "Hide" : "Show"} sidebar`}
      tooltipPlacement={modal ? "bottom" : "top"}
      open={visible}
      icon={
        visible ? (
          modal ? (
            <KeyboardArrowRight />
          ) : (
            <KeyboardArrowLeft />
          )
        ) : modal ? (
          <KeyboardArrowLeft />
        ) : (
          <KeyboardArrowRight />
        )
      }
      highlight={!visible}
      ref={ref}
      data-cy="action-toggle-sidebar"
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
    />
  );
});

const ModalActionsRowContainer = styled.div`
  z-index: 100001;
  position: fixed;
  right: 3em;
  top: 0.16em;
  display: flex;
  row-gap: 0.5rem;
  column-gap: 0.5rem;
  align-items: center;
  opacity: 0.8;
  transition: opacity 0.1s ease-in;

  &:hover {
    opacity: 1;
    transition: opacity 0.1s ease-out;
  }

  svg {
    font-size: 18px;
  }

  > div {
    max-height: 24px;

    > div:first-child {
      max-height: 24px;
    }
  }
`;

const DraggableHandleIconContainer = styled.div`
  cursor: grab;
  display: flex;
  justify-content: center;
  align-items: center;

  &:active {
    cursor: grabbing;
  }
`;

export const BrowseOperations = ({
  adaptiveMenuItemProps,
  modal,
}: ActionProps & { modal?: boolean }) => {
  const browser = useOperatorBrowser();
  return (
    <ActionDiv {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}>
      <PillButton
        open={false}
        highlight={true}
        icon={<List />}
        onClick={() => {
          browser.toggle();
          adaptiveMenuItemProps?.closeOverflow?.();
        }}
        title={"Browse operations"}
        tooltipPlacement={modal ? "bottom" : "top"}
        data-cy="action-browse-operations"
      />
    </ActionDiv>
  );
};

export const GridActionsRow = () => {
  const { placements: primaryPlacements } = useOperatorPlacements(
    types.Places.SAMPLES_GRID_ACTIONS
  );
  const { placements: secondaryPlacements } = useOperatorPlacements(
    types.Places.SAMPLES_GRID_SECONDARY_ACTIONS
  );
  const initialItems = useMemo(() => {
    return [
      {
        id: "toggle-sidebar",
        Component: (props) => {
          return <ToggleSidebar modal={false} adaptiveMenuItemProps={props} />;
        },
        priority: 1, // always show this first
      },
      {
        id: "colors",
        Component: (props) => {
          return <Colors adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "tag",
        Component: (props) => {
          return <Tag modal={false} adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "patches",
        Component: (props) => {
          return <Patches adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "similarity",
        Component: (props) => {
          return <Similarity modal={false} adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "save-filters",
        Component: (props) => {
          return <SaveFilters adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "selected",
        Component: (props) => {
          return <Selected modal={false} adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "dynamic-group-action",
        Component: (props) => {
          return <DynamicGroupAction adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "browse-operations",
        Component: (props) => {
          return <BrowseOperations adaptiveMenuItemProps={props} />;
        },
      },
      {
        id: "options",
        Component: (props) => {
          return <Options modal={false} adaptiveMenuItemProps={props} />;
        },
      },
      ...primaryPlacements.map((placement) => {
        return {
          id: placement?.operator?.uri,
          Component: (props) => {
            return (
              <OperatorPlacementWithErrorBoundary
                place={types.Places.SAMPLES_GRID_ACTIONS}
                adaptiveMenuItemProps={props}
                {...placement}
              />
            );
          },
        };
      }),
      ...secondaryPlacements.map((placement) => {
        return {
          id: placement?.operator?.uri,
          Component: (props) => {
            return (
              <OperatorPlacementWithErrorBoundary
                place={types.Places.SAMPLES_GRID_SECONDARY_ACTIONS}
                adaptiveMenuItemProps={props}
                {...placement}
              />
            );
          },
        };
      }),
    ];
  }, [primaryPlacements, secondaryPlacements]);
  const { orderedItems, setOrder } = useItemsWithOrderPersistence(
    initialItems,
    "grid-actions-row"
  );

  return (
    <Box sx={{ width: "100%", minWidth: 100 }}>
      <AdaptiveMenu
        id="grid-actions-row"
        items={orderedItems}
        onOrderChange={(items) => {
          setOrder(items);
        }}
      />
    </Box>
  );
};

const DragActionsRow = () => {
  return (
    <DraggableHandleIconContainer className={MODAL_ACTION_BAR_HANDLE_CLASS}>
      <DragIndicatorIcon />
    </DraggableHandleIconContainer>
  );
};

export const ModalActionsRow = () => {
  const { activeLookerRef } = useModalContext();

  const isActualGroup = useRecoilValue(fos.isGroup);
  const isDynamicGroup = useRecoilValue(fos.isDynamicGroup);

  const isGroup = useMemo(
    () => isActualGroup || isDynamicGroup,
    [isActualGroup, isDynamicGroup]
  );

  const [defaultXCoord, setDefaultXCoord] = fos.useBrowserStorage<number>(
    "modal-actions-row-x-coord",
    0,
    false
  );

  return (
    <Draggable
      handle={`.${MODAL_ACTION_BAR_HANDLE_CLASS}`}
      axis="x"
      defaultPosition={{ x: defaultXCoord ?? 0, y: 0 }}
      onDrag={(_e, { x }) => {
        setDefaultXCoord(x);
      }}
    >
      <ModalActionsRowContainer>
        <DragActionsRow />
        <Hidden modal />
        <Selected modal={true} lookerRef={activeLookerRef} />
        <Colors modal />
        <Similarity modal={true} />
        <Tag modal={true} lookerRef={activeLookerRef} />
        <Options modal={true} />
        {isGroup && <GroupMediaVisibilityContainer modal={true} />}
        <BrowseOperations modal />
        <OperatorPlacements modal place={types.Places.SAMPLES_VIEWER_ACTIONS} />
        <ToggleModalFullScreen />
        <ToggleSidebar modal={true} />
      </ModalActionsRowContainer>
    </Draggable>
  );
};

type ActionProps = {
  adaptiveMenuItemProps?: AdaptiveMenuItemComponentPropsType;
};
