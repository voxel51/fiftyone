import React, { useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import { LocalOffer } from "@material-ui/icons";

import { PillButton } from "../utils";
import * as atoms from "../../recoil/atoms";

import Tagger from "./Tagger";

const Tag = ({ modal }) => {
  const [open, setOpen] = useState(false);
  const selectedSamples = useRecoilValue(atoms.selectedSamples);
  const ref = useRef();

  return (
    <div ref={ref}>
      <PillButton
        icon={<LocalOffer />}
        text={"tag"}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={Boolean(selectedSamples.size) || open}
      />
      {open && <Tagger modal={modal} />}
    </div>
  );
};

const ActionsRowDiv = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
  flex-direction: column;
`;

type ActionsRowProps = {
  modal: boolean;
};

const ActionsRow = ({ modal }: ActionsRowProps) => {
  return (
    <ActionsRowDiv>
      <Tag modal={modal} />
    </ActionsRowDiv>
  );
};

export default React.memo(ActionsRow);
