import React, { useRef, useState } from "react";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import { Check, LocalOffer, Settings, VisibilityOff } from "@material-ui/icons";

import { PillButton } from "../utils";
import * as atoms from "../../recoil/atoms";

import Tagger from "./Tagger";
import Selector from "./Selected";
import Coloring from "./Options";
import { useOutsideClick } from "../../utils/hooks";
import useMeasure from "react-use-measure";

const ActionDiv = styled.div`
  position: relative;
`;

const Tag = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<LocalOffer />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={Boolean(selectedSamples.size) || open}
        ref={mRef}
      />
      {open && <Tagger modal={modal} bounds={bounds} />}
    </ActionDiv>
  );
};

const Selected = ({ modal, frameNumberRef, ...rest }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const selectedObjects = useRecoilValue(atoms.selectedObjects);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  const numItems = modal
    ? Object.keys(selectedObjects).length
    : selectedSamples.size;

  if (numItems < 1) {
    return null;
  }
  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<Check />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={true}
        text={`${numItems}`}
        ref={mRef}
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
    />
  );
};

const Hidden = () => {
  const [hiddenObjects, setHiddenObjects] = useRecoilState(atoms.hiddenObjects);
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
    />
  );
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
      <Selected modal={modal} frameNumberRef={frameNumberRef} />
    </ActionsRowDiv>
  );
};

export default React.memo(ActionsRow);
