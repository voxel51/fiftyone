import * as fos from "@fiftyone/state";
import { Button } from "../../utils";
import React from "react";
import styled from "styled-components";

export const ModeControlContainer = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: flex-end;
  margin-bottom: 0.5rem;
`;

const Text = styled.div`
  font-size: 1.2rem;
  margin: auto 0.5rem;
`;

const ModeControl: React.FC = () => {
  const { props } = fos.useGlobalColorSetting();

  return (
    <ModeControlContainer>
      <>
        <Text>Color by </Text>
        <Button
          text={props.colorBy}
          title={`toggle between color by value or color by field mode`}
          onClick={() =>
            props.setColorBy(props.colorBy === "value" ? "field" : "value")
          }
          style={{
            textAlign: "center",
            width: 80,
            display: "inline-block",
            marginTop: 0,
          }}
        />
      </>
    </ModeControlContainer>
  );
};

export default ModeControl;
