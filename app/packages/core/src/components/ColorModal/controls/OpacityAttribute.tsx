import React from "react";
import { useRecoilState } from "recoil";
import useMeasure from "react-use-measure";
import styled from "styled-components";
import { cloneDeep } from "lodash";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";

import { Tooltip, useTheme } from "@fiftyone/components/src/components";
import { useOutsideClick } from "@fiftyone/state";
import { Popout } from "@fiftyone/components/src/components";
import Item from "../../Filters/categoricalFilter/filterOption/FilterItem";
import { tempColorSetting } from "../utils";
import { Field } from "@fiftyone/utilities";
import { CHILD_STYLE } from "../FieldSetting";

const ActionDiv = styled.div`
  position: relative;
`;

const SelectButton = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 0.25rem;
  margin: 0.25rem;
  background-color: ${({ theme }) => theme.background.level3};
`;

type Prop = {
  fields: Field[];
};

type Option = {
  value: string;
  onClick: () => void;
};

const OpacityAttribute: React.FC<Prop> = ({ fields }) => {
  const theme = useTheme();
  const ref = React.useRef<HTMLDivElement>();
  const [open, setOpen] = React.useState(false);
  useOutsideClick(ref, () => open && setOpen(false));
  const [mRef, bounds] = useMeasure();

  const [tempSetting, setTempSetting] = useRecoilState(tempColorSetting);

  const options = fields.map((field) => ({
    value: field.path!,
    onClick: () => {
      setTempSetting((s) => ({
        ...cloneDeep(s),
        attributeForOpacity: field.path!,
      }));
      setOpen(false);
    },
  }));

  const selected =
    tempSetting?.attributeForOpacity ?? "Please select an attribute";

  return (
    <div style={CHILD_STYLE}>
      <ActionDiv ref={ref}>
        <Tooltip
          text={"You can select an FloatField to use for opacity"}
          placement={"bottom-center"}
        >
          <SelectButton
            onClick={() => setOpen((o) => !o)}
            ref={mRef}
            theme={theme}
          >
            <div>{selected}</div>
            {open ? (
              <KeyboardArrowUpOutlinedIcon />
            ) : (
              <KeyboardArrowDownOutlinedIcon />
            )}
          </SelectButton>
        </Tooltip>
        {open && (
          <Popout style={{ padding: 0, position: "relative" }} bounds={bounds}>
            {options.map((option: Option) => (
              <Item key={option.value} {...option} />
            ))}
          </Popout>
        )}
      </ActionDiv>
    </div>
  );
};

export default OpacityAttribute;
