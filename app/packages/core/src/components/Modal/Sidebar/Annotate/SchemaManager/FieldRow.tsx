import { DeleteOutlined, EditOutlined } from "@mui/icons-material";
import { Checkbox, Typography } from "@mui/material";
import { useSetAtom } from "jotai";
import React from "react";
import styled from "styled-components";
import { RoundButtonWhite } from "../Actions";
import { editingAnnotationFieldSchema } from "../state";
import { ItemLeft, ItemRight } from "./Components";

const Item = styled.div`
  display: flex;
  justify-content: space-between;
  width: 100%;
  background: ${({ theme }) => theme.background.body};
  border-radius: 4px;
  height: 48px;
  margin: 1rem 0;
  padding: 0 1rem;
  align-items: center;
`;

const FieldRow = () => {
  const setField = useSetAtom(editingAnnotationFieldSchema);
  return (
    <Item>
      <ItemLeft>
        <Checkbox disableRipple={true} />
        <Typography>predictions</Typography>
        <Typography color="secondary">detections</Typography>
      </ItemLeft>

      <ItemRight>
        <RoundButtonWhite
          style={{ padding: 4, height: 29, width: 29 }}
          onClick={() => setField("field")}
        >
          <DeleteOutlined />
        </RoundButtonWhite>
        <RoundButtonWhite
          style={{ padding: 4, height: 29, width: 29 }}
          onClick={() => setField("field")}
        >
          <EditOutlined />
        </RoundButtonWhite>
      </ItemRight>
    </Item>
  );
};

export default FieldRow;
