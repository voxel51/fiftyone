import React, {
  MutableRefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CircularProgress } from "@material-ui/core";
import {
  Bookmark,
  Check,
  FlipToBack,
  LocalOffer,
  Settings,
  VisibilityOff,
  Wallpaper,
} from "@material-ui/icons";
import useMeasure from "react-use-measure";
import { atom, selectorFamily, useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import OptionsActions from "./Options";
import Patcher, { patchesFields, patching } from "./Patcher";
import Selector from "./Selected";
import Tagger from "./Tagger";
import { PillButton } from "../utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import socket from "../../shared/connection";
import { useEventHandler, useOutsideClick, useTheme } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";
import Similar, { similaritySorting } from "./Similar";
import { FrameLooker, ImageLooker, VideoLooker } from "@fiftyone/looker";
import { hasFilters } from "../Filters/atoms";

const Loading = () => {
  const theme = useTheme();
  return (
    <CircularProgress
      style={{ padding: 2, height: 22, width: 22, color: theme.font }}
    />
  );
};

const ActionDiv = styled.div`
  position: relative;
`;

const Patches = () => {
  const [open, setOpen] = useState(false);
  const loading = useRecoilValue(patching);
  const isVideo = useRecoilValue(selectors.isVideoDataset);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const fields = useRecoilValue(patchesFields);

  useLayoutEffect(() => {
    close && setOpen(false);
  }, [close]);

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
  get: (modal) => ({ get }) => {
    if (modal) {
      return true;
    }
    return Boolean(get(atoms.selectedSamples).size);
  },
});

const Similarity = ({ modal }: { modal: boolean }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  const loading = useRecoilValue(similaritySorting);
  useOutsideClick(ref, () => open && setOpen(false));
  const hasSimilarity = useRecoilValue(hasSimilarityKeys(modal));
  const [mRef, bounds] = useMeasure();
  const close = false;

  useLayoutEffect(() => {
    close && setOpen(false);
  }, [close]);

  if (!hasSimilarity) {
    return null;
  }

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={loading ? <Loading /> : <Wallpaper />}
        open={open}
        onClick={() => !loading && setOpen(!open)}
        highlight={true}
        ref={mRef}
        title={"Sort by similarity"}
        style={{ cursor: loading ? "default" : "pointer" }}
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
  lookerRef?: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>;
}) => {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const selected = useRecoilValue(
    modal ? selectors.selectedLabelIds : atoms.selectedSamples
  );
  const tagging = useRecoilValue(selectors.anyTagging);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();
  const close = false;

  const disabled = tagging;

  useLayoutEffect(() => {
    close && setOpen(false);
  }, [close]);

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
        highlight={(Boolean(selected.size) || open) && available}
        ref={mRef}
        title={`Tag sample${modal ? "" : "s"} or labels`}
      />
      {open && !close && available && (
        <Tagger
          modal={modal}
          bounds={bounds}
          close={() => setOpen(false)}
          lookerRef={
            lookerRef && lookerRef.current instanceof VideoLooker
              ? (lookerRef as MutableRefObject<VideoLooker>)
              : null
          }
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
  lookerRef?: MutableRefObject<VideoLooker | ImageLooker | FrameLooker>;
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const selectedObjects = useRecoilValue(selectors.selectedLabels);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  const numItems = modal
    ? Object.keys(selectedObjects).length
    : selectedSamples.size;

  lookerRef &&
    useEventHandler(lookerRef.current, "buffering", (e) =>
      setLoading(e.detail)
    );

  if (numItems < 1 && !modal) {
    return null;
  }
  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={loading ? <Loading /> : <Check />}
        open={open}
        style={{ cursor: loading ? "default" : "pointer" }}
        onClick={() => {
          if (loading) {
            return;
          }
          setOpen(!open);
        }}
        highlight={numItems > 0 || open}
        text={`${numItems}`}
        ref={mRef}
        title={`Manage selected ${modal ? "label" : "sample"}${
          numItems > 1 ? "s" : ""
        }`}
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
  const ref = useRef();
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
  const [hiddenObjects, setHiddenObjects] = useRecoilState(atoms.hiddenLabels);
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

export const savingFilters = atom<boolean>({
  key: "savingFilters",
  default: false,
});

const SaveFilters = () => {
  const hasFiltersValue = useRecoilValue(hasFilters(false));
  const [loading, setLoading] = useRecoilState(savingFilters);

  return hasFiltersValue ? (
    <PillButton
      open={false}
      highlight={true}
      icon={loading ? <Loading /> : <Bookmark />}
      style={{ cursor: loading ? "default" : "pointer" }}
      onClick={() => {
        if (loading) {
          return;
        }
        setLoading(true);
        socket.send(packageMessage("save_filters", {}));
      }}
      title={"Convert current field filters to view stages"}
    />
  ) : null;
};

const ActionsRowDiv = styled.div`
  display: flex;
  justify-content: ltr;
  margin-top: 2.5px;
  row-gap: 0.5rem;
  column-gap: 0.5rem;
`;

type ActionsRowProps = {
  modal: boolean;
  lookerRef?: MutableRefObject<VideoLooker>;
};

const ActionsRow = ({ modal, lookerRef }: ActionsRowProps) => {
  const isVideo = useRecoilValue(selectors.isVideoDataset);
  const isClips = useRecoilValue(selectors.isClipsView);
  const style = modal
    ? {
        overflowX: "auto",
        overflowY: "hidden",
        margin: "0 -1em",
        padding: "0 1em",
        flexWrap: "wrap",
      }
    : {
        flexWrap: "no-wrap",
      };
  return (
    <ActionsRowDiv style={style}>
      <Options modal={modal} />
      <Tag modal={modal} lookerRef={modal ? lookerRef : null} />
      {!modal && <Patches />}
      {!isVideo && <Similarity modal={modal} />}
      {modal && <Hidden />}
      {!modal && <SaveFilters />}
      <Selected modal={modal} lookerRef={lookerRef} />
    </ActionsRowDiv>
  );
};

export default React.memo(ActionsRow);
