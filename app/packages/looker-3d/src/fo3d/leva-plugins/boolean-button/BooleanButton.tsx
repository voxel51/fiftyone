import { IconButton } from "@fiftyone/components";
import { Components, useInputContext } from "leva/plugin";
import { useCallback } from "react";
import styled from "styled-components";
import { BooleanButtonProps } from "./types";

const BOOLEAN_CHECKBOX_ID = "fo-leva-plugin-boolean-checkbox";

const BooleanButtonContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
`;

const BooleanCheckboxContainer = styled.div`
  display: flex;
  align-items: center;
`;

const ShadowInput = styled.input`
  position: absolute;
  z-index: 100;
  opacity: 0;
`;

export const BooleanButton = () => {
  const { label, value, settings } = useInputContext<BooleanButtonProps>();

  const { icon, onClick, checked, onCheckboxChange } = settings;

  const { Label, Row, Boolean } = Components;

  const onClickHandler = useCallback(() => {
    onClick({ checked: checked, label: label.toString() });
  }, [onClick, value, label]);

  const onUpdateHandler = useCallback(
    (v: boolean) => {
      onCheckboxChange(!v);
    },
    [onCheckboxChange]
  );

  return (
    <Row input>
      <Label>{label}</Label>
      <BooleanButtonContainer>
        <BooleanCheckboxContainer id={BOOLEAN_CHECKBOX_ID}>
          {/* suspiciously doesn't work if the id field is removed :/  */}
          <Boolean id="fo-leva-pl" value={checked} onUpdate={onUpdateHandler} />
        </BooleanCheckboxContainer>
        <IconButton onClick={onClickHandler}>{icon}</IconButton>
      </BooleanButtonContainer>
    </Row>
  );
};
