import { IconButton } from "@fiftyone/components";
import { Components, useInputContext } from "leva/plugin";
import { useCallback } from "react";
import styled from "styled-components";
import style from "./boolean-button-style.module.css";
import { BooleanButtonProps } from "./types";

const BooleanButtonContainer = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
`;

export const BooleanButton = () => {
  const { label, settings } = useInputContext<BooleanButtonProps>();

  const { icon, onClick, checked, onCheckboxChange, buttonStyles } = settings;

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
      <Label onClick={onClickHandler} className={style.levaLabelStyle}>
        {label}
      </Label>
      <BooleanButtonContainer>
        <Boolean
          id={`fo-leva-pl-${label}`}
          value={checked}
          onUpdate={onUpdateHandler}
        />
        <IconButton style={buttonStyles ?? {}} onClick={onClickHandler}>
          {icon}
        </IconButton>
      </BooleanButtonContainer>
    </Row>
  );
};
