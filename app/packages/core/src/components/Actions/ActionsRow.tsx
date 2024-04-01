import {
  PillButton,
  scrollable,
  scrollableSm,
  useTheme,
} from "@fiftyone/components";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { OperatorPlacements, types } from "@fiftyone/operators";
import { useOperatorBrowser } from "@fiftyone/operators/src/state";
import { subscribe } from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOutsideClick } from "@fiftyone/state";
import {
  Bookmark,
  Check,
  ColorLens,
  FlipToBack,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  List,
  LocalOffer,
  Search,
  Settings,
  VisibilityOff,
  Wallpaper,
} from "@mui/icons-material";
import React, {
  MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  selector,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";
import LoadingDots from "../../../../components/src/components/Loading/LoadingDots";
import { activeColorEntry } from "../ColorModal/state";
import { ACTIVE_FIELD } from "../ColorModal/utils";
import { DynamicGroupAction } from "./DynamicGroupAction";
import { GroupMediaVisibilityContainer } from "./GroupMediaVisibilityContainer";
import OptionsActions from "./Options";
import Patcher, { patchesFields } from "./Patcher";
import Selector from "./Selected";
import Tagger from "./Tagger";
import SortBySimilarity from "./similar/Similar";
import { ActionDiv } from "./utils";

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

const Loading = () => {
  const theme = useTheme();
  return <LoadingDots text="" style={{ color: theme.text.primary }} />;
};

const Patches = () => {
  const [open, setOpen] = useState(false);
  const loading = useRecoilValue(fos.patching);
  const isVideo = useRecoilValue(fos.isVideoDataset);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const fields = useRecoilValue(patchesFields);

  return (
    <ActionDiv ref={ref}>
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

const Similarity = ({ modal }: { modal: boolean }) => {
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
    <ActionDiv ref={ref}>
      <PillButton
        key={"button"}
        icon={showImageSimilarityIcon ? <Wallpaper /> : <Search />}
        open={open}
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
}: {
  modal: boolean;
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
}) => {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const labels = useRecoilValue(fos.selectedLabelIds);
  const samples = useRecoilValue(fos.selectedSamples);
  const readOnly = useRecoilValue(fos.readOnly);

  const selected = labels.size > 0 || samples.size > 0;
  const tagging = useRecoilValue(fos.anyTagging);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const disabled = tagging;

  lookerRef &&
    useEventHandler(lookerRef.current, "play", () => {
      open && setOpen(false);
      setAvailable(false);
    });
  lookerRef &&
    useEventHandler(lookerRef.current, "pause", () => setAvailable(true));

  const baseTitle = `Tag sample${modal ? "" : "s"} or labels`;
  const title = readOnly
    ? `Can not ${baseTitle.toLowerCase()} in read-only mode.`
    : baseTitle;

  return (
    <ActionDiv ref={ref}>
      <PillButton
        style={{
          cursor: readOnly
            ? "not-allowed"
            : disabled || !available
            ? "default"
            : "pointer",
        }}
        icon={tagging ? <Loading /> : <LocalOffer />}
        open={open}
        onClick={() => !disabled && available && !readOnly && setOpen(!open)}
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
}: {
  modal: boolean;
  lookerRef?: MutableRefObject<fos.Lookers | undefined>;
}) => {
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
    <ActionDiv ref={ref}>
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

const Options = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <ActionDiv ref={ref}>
      <PillButton
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

const Colors = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [activeField, setActiveField] = useRecoilState(activeColorEntry);

  const onOpen = () => {
    setOpen(!open);
    setActiveField(ACTIVE_FIELD.GLOBAL);
  };

  useEffect(() => {
    if (activeField) {
      !open && setOpen(true);
    } else {
      open && setOpen(false);
    }
  }, [Boolean(activeField)]);

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<ColorLens />}
        open={open}
        onClick={onOpen}
        highlight={open}
        title={"Color settings"}
        data-cy="action-color-settings"
      />
    </ActionDiv>
  );
};

const Hidden = () => {
  const [hiddenObjects, setHiddenObjects] = useRecoilState(fos.hiddenLabels);
  const count = Object.keys(hiddenObjects).length;

  if (count < 1) {
    return null;
  }

  return (
    <PillButton
      icon={<VisibilityOff />}
      open={true}
      onClick={() => setHiddenObjects({})}
      highlight={true}
      text={`${count}`}
      title={"Clear hidden labels"}
      data-cy="action-clear-hidden-labels"
    />
  );
};

const SaveFilters = () => {
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
    <ActionDiv>
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

const ToggleSidebar: React.FC<{
  modal: boolean;
}> = React.forwardRef(({ modal }, ref) => {
  const [visible, setVisible] = useRecoilState(fos.sidebarVisible(modal));

  return (
    <PillButton
      onClick={() => {
        setVisible(!visible);
      }}
      title={`${visible ? "Hide" : "Show"} sidebar`}
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
    />
  );
});

const ActionsRowDiv = styled.div`
  position: relative;
  display: flex;
  justify-content: ltr;
  row-gap: 0.5rem;
  column-gap: 0.5rem;
  align-items: center;
  overflow-x: hidden;
  &:hover {
    overflow-x: auto;
  }
`;

export const BrowseOperations = () => {
  const browser = useOperatorBrowser();
  return (
    <ActionDiv>
      <PillButton
        open={false}
        highlight={true}
        icon={<List />}
        onClick={() => browser.toggle()}
        title={"Browse operations"}
        data-cy="action-browse-operations"
      />
    </ActionDiv>
  );
};

export const GridActionsRow = () => {
  const actionsRowDivRef = useRef<HTMLDivElement>();

  useEffect(() => {
    const actionsRowDivElem = actionsRowDivRef.current;
    if (actionsRowDivElem) {
      const handleWheel = (e) => {
        const leftEnd = actionsRowDivElem.offsetWidth;
        const rightEnd = actionsRowDivElem.scrollWidth;
        const scrollLeft = actionsRowDivElem.scrollLeft;
        const leftScrolledEnd = leftEnd + scrollLeft;
        const allowLeftScroll = leftScrolledEnd === leftEnd;
        const allowRightScroll = leftScrolledEnd === rightEnd;

        if (
          e.deltaY == 0 ||
          (e.deltaY < 0 && allowLeftScroll) ||
          (e.deltaY > 0 && allowRightScroll)
        )
          return;

        e.preventDefault();
        actionsRowDivElem.scrollLeft = actionsRowDivElem.scrollLeft + e.deltaY;
      };
      actionsRowDivElem.addEventListener("wheel", handleWheel);
      return () => actionsRowDivElem.removeEventListener("wheel", handleWheel);
    }
  }, []);

  return (
    <ActionsRowDiv
      className={`${scrollable} ${scrollableSm}`}
      ref={actionsRowDivRef}
    >
      <ToggleSidebar modal={false} />
      <Colors />
      <Tag modal={false} />
      <Patches />
      <Similarity modal={false} />
      <SaveFilters />
      <Selected modal={false} />
      <DynamicGroupAction />
      <BrowseOperations />
      <Options modal={false} />
      <OperatorPlacements place={types.Places.SAMPLES_GRID_ACTIONS} />
      <OperatorPlacements place={types.Places.SAMPLES_GRID_SECONDARY_ACTIONS} />
    </ActionsRowDiv>
  );
};

export const ModalActionsRow = ({
  lookerRef,
  isGroup,
}: {
  lookerRef?: MutableRefObject<fos.Lookers | undefined>;
  isGroup?: boolean;
}) => {
  return (
    <ActionsRowDiv
      style={{
        justifyContent: "rtl",
        right: 0,
      }}
    >
      <Hidden />
      <Selected modal={true} lookerRef={lookerRef} />
      <Colors />
      <Similarity modal={true} />
      <Tag modal={true} lookerRef={lookerRef} />
      <Options modal={true} />
      {isGroup && <GroupMediaVisibilityContainer modal={true} />}
      <BrowseOperations />
      <OperatorPlacements place={types.Places.SAMPLES_VIEWER_ACTIONS} />
      <ToggleSidebar modal={true} />
    </ActionsRowDiv>
  );
};
