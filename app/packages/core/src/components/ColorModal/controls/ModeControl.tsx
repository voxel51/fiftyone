import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilState } from "recoil";
import styled from "styled-components";
import { Button } from "../../utils";

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
  const [colorScheme, setColorScheme] = useRecoilState(fos.colorScheme);

  return (
    <ModeControlContainer>
      <>
        <Text>Color by </Text>
        <Button
          text={colorScheme.colorBy ?? "field"}
          data-cy="color-by-toggle"
          title={`toggle between color by value or color by field mode`}
          onClick={() =>
            setColorScheme({
              ...colorScheme,
              colorBy: colorScheme.colorBy === "value" ? "field" : "value",
            })
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
