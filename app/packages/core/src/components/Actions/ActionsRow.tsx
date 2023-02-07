import {
  Bookmark,
  Check,
  FlipToBack,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  LocalOffer,
  Settings,
  VisibilityOff,
  Wallpaper,
} from "@mui/icons-material";
import React, {
  MutableRefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import useMeasure from "react-use-measure";
import {
  selector,
  selectorFamily,
  useRecoilCallback,
  useRecoilState,
  useRecoilValue,
} from "recoil";
import styled from "styled-components";

import { useTheme } from "@fiftyone/components";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { useEventHandler, useOutsideClick, useSetView } from "@fiftyone/state";
import LoadingDots from "../../../../components/src/components/Loading/LoadingDots";
import { PillButton } from "../utils";
import OptionsActions from "./Options";
import Patcher, { patchesFields } from "./Patcher";
import Selector from "./Selected";
import Similar from "./Similar";
import Tagger from "./Tagger";

export const shouldToggleBookMarkIconOnSelector = selector<boolean>({
  key: "shouldToggleBookMarkIconOn",
  get: ({ get }) => {
    const hasFiltersValue = get(fos.hasFilters(false));
    const extendedSelectionList = get(fos.extendedSelection);
    const selectedSampleSet = get(fos.selectedSamples);
    const isSimilarityOn = get(fos.similarityParameters);

    const isExtendedSelectionOn =
      (extendedSelectionList && extendedSelectionList.length > 0) ||
      isSimilarityOn;

    return (
      isExtendedSelectionOn || hasFiltersValue || selectedSampleSet.size > 0
    );
  },
});

const Loading = () => {
  const theme = useTheme();
  return <LoadingDots text="" color={theme.text.primary} />;
};

const ActionDiv = styled.div`
  position: relative;
`;

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
      />
      {open && <Patcher close={() => setOpen(false)} />}
    </ActionDiv>
  );
};

const hasSimilarityKeys = selectorFamily<boolean, boolean>({
  key: "hasSimilarityKeys",
  get:
    (modal) =>
    ({ get }) => {
      if (modal) {
        return true;
      }
      return Boolean(get(fos.selectedSamples).size);
    },
});

const Similarity = ({ modal }: { modal: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const hasSimilarity = useRecoilValue(hasSimilarityKeys(modal));
  const hasSorting = useRecoilValue(fos.similarityParameters);
  const [mRef, bounds] = useMeasure();
  const close = false;

  useLayoutEffect(() => {
    close && setOpen(false);
  }, [close]);

  if (!hasSimilarity && !hasSorting) {
    return null;
  }
  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<Wallpaper />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={true}
        ref={mRef}
        title={"Sort by similarity"}
        style={{ cursor: "pointer" }}
      />
      {open && (
        <Similar modal={modal} close={() => setOpen(false)} bounds={bounds} />
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

  const selected = labels.size > 0 || samples.size > 0;
  const tagging = useRecoilValue(fos.anyTagging);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));

  const [mRef, bounds] = useMeasure();

  const disabled = tagging;

  lookerRef &&
    useEventHandler(lookerRef.current, "play", () => {
      open && setOpen(false);
      setAvailable(false);
    });
  lookerRef &&
    useEventHandler(lookerRef.current, "pause", () => setAvailable(true));

  return (
    <ActionDiv ref={ref}>
      <PillButton
        style={{ cursor: disabled || !available ? "default" : "pointer" }}
        icon={disabled ? <Loading /> : <LocalOffer />}
        open={open}
        onClick={() => !disabled && available && setOpen(!open)}
        highlight={(selected || open) && available}
        ref={mRef}
        title={`Tag sample${modal ? "" : "s"} or labels`}
      />
      {open && available && (
        <Tagger
          modal={modal}
          bounds={bounds}
          close={() => setOpen(false)}
          lookerRef={lookerRef}
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
  lookerRef?: MutableRefObject<
    VideoLooker | ImageLooker | FrameLooker | undefined
  >;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const samples = useRecoilValue(fos.selectedSamples);
  const labels = useRecoilValue(fos.selectedLabelIds);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

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
        ref={mRef}
        title={`Manage selected`}
        style={{
          cursor: loading ? "default" : "pointer",
        }}
      />
      {open && (
        <Selector
          modal={modal}
          close={() => setOpen(false)}
          lookerRef={lookerRef}
          bounds={bounds}
        />
      )}
    </ActionDiv>
  );
};

const Options = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<Settings />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open}
        ref={mRef}
        title={"Display options"}
      />
      {open && <OptionsActions modal={modal} bounds={bounds} />}
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
    />
  );
};

const SaveFilters = () => {
  const loading = useRecoilValue(fos.savingFilters);
  const onComplete = useRecoilCallback(({ set, reset }) => () => {
    set(fos.savingFilters, false);
    reset(fos.similarityParameters);
    reset(fos.extendedSelection);
  });
  const setView = useSetView(true, false, onComplete);

  const saveFilters = useRecoilCallback(
    ({ snapshot, set }) =>
      async () => {
        const loading = await snapshot.getPromise(fos.savingFilters);
        if (loading) {
          return;
        }
        set(fos.savingFilters, true);
        setView((v) => v);
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
`;

export const GridActionsRow = () => {
  const isVideo = useRecoilValue(fos.isVideoDataset);
  const hideTagging = useRecoilValue(fos.readOnly);

  return (
    <ActionsRowDiv>
      <ToggleSidebar modal={false} />
      <Options modal={false} />
      {hideTagging ? null : <Tag modal={false} />}
      <Patches />
      {!isVideo && <Similarity modal={false} />}
      <SaveFilters />
      <Selected modal={false} />
    </ActionsRowDiv>
  );
};

export const ModalActionsRow = ({
  lookerRef,
}: {
  lookerRef?: MutableRefObject<VideoLooker | undefined>;
}) => {
  const isVideo = useRecoilValue(fos.isVideoDataset);
  const hideTagging = useRecoilValue(fos.readOnly);

  return (
    <ActionsRowDiv
      style={{
        justifyContent: "rtl",
        right: 0,
      }}
    >
      <Hidden />
      <Selected modal={true} lookerRef={lookerRef} />
      {!isVideo && <Similarity modal={true} />}
      {!hideTagging && <Tag modal={true} lookerRef={lookerRef} />}
      <Options modal={true} />
      <ToggleSidebar modal={true} />
    </ActionsRowDiv>
  );
};
