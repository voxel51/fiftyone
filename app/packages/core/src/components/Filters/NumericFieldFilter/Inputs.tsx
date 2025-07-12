import * as fos from "@fiftyone/state";
import React, { useEffect, useState } from "react";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import styled from "styled-components";
import type { InputType } from "./Input";
import { Input } from "./Input";
import { getFormatter } from "../../Common/utils";

const Container = styled.div`
  display: flex;
  justify-content: space-between;
  column-gap: 0.5rem;
`;

export default function Inputs({
  color,
  modal,
  path,
}: {
  color: string;
  modal: boolean;
  path: string;
}) {
  const ftype = useRecoilValue(fos.fieldType({ path }));
  const [[min, max], setRange] = useRecoilState(
    fos.rangeAtom({
      modal,
      path,
      withBounds: false,
    })
  );
  const bounds = useRecoilValue(fos.boundsAtom({ path, modal }));
  const setSnackBarErrors = useSetRecoilState(fos.snackbarErrors);

  // Display a clipped value in the input to provide a simpler UX
  const { formatter } = getFormatter(ftype, null, bounds);
  const [minDisplay, setMinDisplay] = useState(
    typeof min === "number" ? formatter(min) : null
  );
  const [maxDisplay, setMaxDisplay] = useState(
    typeof max === "number" ? formatter(max) : null
  );

  // Synchronize with external state updates
  // todo - move to recoil selector?
  useEffect(() => {
    setMinDisplay(typeof min === "number" ? formatter(min) : null);
  }, [min]);
  useEffect(() => {
    setMaxDisplay(typeof max === "number" ? formatter(max) : null);
  }, [max]);

  return (
    <Container>
      <Input
        color={color}
        ftype={ftype as InputType}
        key="min"
        onSubmit={(value) => {
          if (value !== null && max !== null && value > max) {
            setSnackBarErrors(["min cannot be greater than max"]);
            return;
          }
          setRange((cur) => [value, cur[1]]);
        }}
        placeholder="min"
        value={minDisplay}
      />
      <Input
        color={color}
        ftype={ftype as InputType}
        key="max"
        onSubmit={(value) => {
          if (value !== null && min !== null && value < min) {
            setSnackBarErrors(["max cannot be less than min"]);
            return;
          }
          setRange((cur) => [cur[0], value]);
        }}
        placeholder="max"
        value={maxDisplay}
      />
    </Container>
  );
}
