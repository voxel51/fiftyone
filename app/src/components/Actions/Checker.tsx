import React, { useState } from "react";
import { Checkbox } from "@material-ui/core";
import { useRecoilValue } from "recoil";
import styled from "styled-components";

import { HoverItemDiv, tagStats } from "./utils";

const CheckboxDiv = styled(HoverItemDiv)`
  display: flex;
  justify-content: space-between;
`;

interface CheckProps {
  name: string;
  value: number;
  checked: boolean;
  onRemove: () => void;
  onAdd: () => void;
}

const Check = ({ name, value }) => {
  const [state, setState] = useState({ indeterminate: true, checked: false });
  return (
    <CheckboxDiv>
      <div>
        <Checkbox {...state} />
        {name}
      </div>
      <span>{value}</span>
    </CheckboxDiv>
  );
};

interface CheckerProps {
  modal: boolean;
  labels: boolean;
}

const Checker = ({ itemsAtom }) => {
  const [items, setItems] = useRecoilState(itemsAtom);

  return (
    <>
      {Object.entries(items).map(([name, value]) => (
        <Check
          {...{ name, value, indeterminate: true }}
          onAdd={(value) => set}
        />
      ))}
    </>
  );
};

export default React.memo(Checker);
