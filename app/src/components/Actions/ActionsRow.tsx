import React, { useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { Check, LocalOffer, Settings } from "@material-ui/icons";

import { PillButton } from "../utils";
import * as atoms from "../../recoil/atoms";

import Tagger from "./Tagger";
import Selector from "./Selected";
import Coloring from "./Options";
import { useOutsideClick } from "../../utils/hooks";

const Tag = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <div ref={ref}>
      <PillButton
        icon={<LocalOffer />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={Boolean(selectedSamples.size) || open}
      />
      {open && <Tagger modal={modal} />}
    </div>
  );
};

const Selected = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));
  if (selectedSamples.size < 1) {
    return null;
  }

  return (
    <div ref={ref}>
      <PillButton
        icon={<Check />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={Boolean(selectedSamples.size) || open}
        text={`${selectedSamples.size}`}
      />
      {open && <Selector modal={modal} close={() => setOpen(false)} />}
    </div>
  );
};

const Options = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useOutsideClick(ref, () => open && setOpen(false));

  return (
    <div ref={ref}>
      <PillButton
        icon={<Settings />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open}
      />
      {open && <Coloring modal={modal} />}
    </div>
  );
};

const ActionsRowDiv = styled.div`
  display: flex;
  justify-content: ltr;
  margin-top: 2.5px;

  & > div {
    margin-right: 0.5rem;
  }
`;

type ActionsRowProps = {
  modal: boolean;
};

const ActionsRow = ({ modal }: ActionsRowProps) => {
  return (
    <ActionsRowDiv>
      <Options modal={modal} />
      <Tag modal={modal} />
      <Selected modal={modal} />
    </ActionsRowDiv>
  );
};

export default React.memo(ActionsRow);
