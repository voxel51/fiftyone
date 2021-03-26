import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CircularProgress } from "@material-ui/core";
import {
  Check,
  LocalOffer,
  Save,
  Settings,
  VisibilityOff,
} from "@material-ui/icons";
import useMeasure from "react-use-measure";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";

import Tagger from "./Tagger";
import Selector from "./Selected";
import Coloring from "./Options";
import { PillButton } from "../utils";
import * as atoms from "../../recoil/atoms";
import * as selectors from "../../recoil/selectors";
import socket from "../../shared/connection";
import { useOutsideClick, useTheme } from "../../utils/hooks";
import { packageMessage } from "../../utils/socket";

const ActionDiv = styled.div`
  position: relative;
`;

const Tag = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const selected = useRecoilValue(
    modal ? selectors.selectedLabelIds : atoms.selectedSamples
  );
  const tagging = useRecoilValue(selectors.anyTagging);
  const theme = useTheme();
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();
  const close = useRecoilValue(selectors.selectedLoading);

  const disabled = tagging;

  useLayoutEffect(() => {
    close && setOpen(false);
  }, [close]);

  return (
    <ActionDiv ref={ref}>
      <PillButton
        style={{ cursor: disabled ? "default" : "pointer" }}
        icon={
          disabled ? (
            <CircularProgress
              style={{ padding: 2, height: 22, width: 22, color: theme.font }}
            />
          ) : (
            <LocalOffer />
          )
        }
        open={open}
        onClick={() => !disabled && setOpen(!open)}
        highlight={Boolean(selected.size) || open}
        ref={mRef}
        title={`Tag sample${modal ? "" : "s"} or labels`}
      />
      {open && !close && (
        <Tagger modal={modal} bounds={bounds} close={() => setOpen(false)} />
      )}
    </ActionDiv>
  );
};

const Selected = ({ modal, frameNumberRef }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const selectedObjects = useRecoilValue(selectors.selectedLabels);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  const numItems = modal
    ? Object.keys(selectedObjects).length
    : selectedSamples.size;

  if (numItems < 1 && !modal) {
    return null;
  }
  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<Check />}
        open={open}
        onClick={() => setOpen(!open)}
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
          frameNumberRef={frameNumberRef}
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
      {open && <Coloring modal={modal} bounds={bounds} />}
    </ActionDiv>
  );
};

const ShowJSON = () => {
  const [showJSON, setShowJSON] = useRecoilState(atoms.showModalJSON);
  return (
    <PillButton
      open={false}
      onClick={() => setShowJSON(!showJSON)}
      highlight={showJSON}
      text={"JSON"}
      title={showJSON ? "Show JSON" : "Hide JSON"}
    />
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

const SaveFilters = () => {
  const hasFilters = useRecoilValue(selectors.hasFilters);
  const [loading, setLoading] = useState(false);
  const filters = useRecoilValue(selectors.filterStages);

  useEffect(() => {
    loading && setLoading(false);
  }, [loading, filters]);

  return hasFilters ? (
    <PillButton
      open={false}
      highlight={true}
      icon={<Save />}
      onClick={() => {
        setLoading(false);
        socket.send(packageMessage("save_filters", {}));
      }}
      title={"Save current field filters as view stages"}
    />
  ) : null;
};

const ActionsRowDiv = styled.div`
  display: flex;
  justify-content: ltr;
  margin-top: 2.5px;

  scrollbar-width: none;
  @-moz-document url-prefix() {
    padding-right: 16px;
  }

  ::-webkit-scrollbar {
    width: 0px;
    background: transparent;
    display: none;
  }
  ::-webkit-scrollbar-thumb {
    width: 0px;
    display: none;
  }

  & > div {
    margin-right: 0.5rem;
  }
`;

type ActionsRowProps = {
  modal: boolean;
  frameNumberRef?: any;
  children: any;
};

const ActionsRow = ({ modal, frameNumberRef }: ActionsRowProps) => {
  const style = modal
    ? {
        overflowX: "auto",
        overflowY: "hidden",
        margin: "0 -1em",
        padding: "0 1em",
      }
    : {};
  return (
    <ActionsRowDiv style={style}>
      {modal && <ShowJSON />}
      <Options modal={modal} />
      <Tag modal={modal} />
      {modal && <Hidden />}
      {!modal && <SaveFilters />}
      <Selected modal={modal} frameNumberRef={frameNumberRef} />
    </ActionsRowDiv>
  );
};

export default React.memo(ActionsRow);
