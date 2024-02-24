import { IconButton } from "@fiftyone/components";
import { Components, useInputContext } from "leva/plugin";
import { useCallback } from "react";
import styled from "styled-components";
import { BooleanButtonProps } from "./types";

const BooleanButtonContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
`;

export const BooleanButton = () => {
  const { label, settings } = useInputContext<BooleanButtonProps>();

  const { icon, onClick, checked, onCheckboxChange } = settings;

  const { Label, Row, Boolean } = Components;

  const onClickHandler = useCallback(() => {
    onClick({ checked: checked, label: label.toString() });
  }, [onClick, label, checked]);

  const onUpdateHandler = useCallback(
    (v: boolean) => {
      onCheckboxChange?.(v, label.toString());
    },
    [onCheckboxChange, label]
  );

  return (
    <Row input>
      <Label>{label}</Label>
      <BooleanButtonContainer>
        {/* suspiciously doesn't work if the id field is removed :/  */}
        <Boolean
          id={`fo-leva-pl-${label}`}
          value={checked}
          onUpdate={onUpdateHandler}
        />
        <IconButton onClick={onClickHandler}>{icon}</IconButton>
      </BooleanButtonContainer>
    </Row>
  );
};
