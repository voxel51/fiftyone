import { useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useEffect, useState } from "react";
import { useRecoilState, useSetRecoilState } from "recoil";
import styled from "styled-components";
import { NumberInput } from "../../Common/Input";

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
  const [[min, max], setRange] = useRecoilState(
    fos.rangeAtom({
      modal,
      path,
      withBounds: false,
    })
  );
  const theme = useTheme();
  const [localMin, setLocalMin] = useState<number | null>(null);
  const [localMax, setLocalMax] = useState<number | null>(null);

  const setSnackBarErrors = useSetRecoilState(fos.snackbarErrors);

  useEffect(() => {
    setLocalMin(min ?? null);
  }, [min]);

  useEffect(() => {
    setLocalMax(max ?? null);
  }, [max]);

  console.log(min, max);

  return (
    <Container>
      <NumberInput
        color={color}
        fontColor={theme.text.secondary}
        placeholder="min"
        value={localMin ?? null}
        setter={(v) => setLocalMin(v ?? null)}
        onEnter={() => {
          if (
            localMin !== null &&
            max !== undefined &&
            max !== null &&
            localMin > max
          ) {
            setSnackBarErrors([`${localMin} is greater than ${max}`]);
            return;
          }
          setRange((cur) => [localMin, cur[1]]);
        }}
      />
      <NumberInput
        color={color}
        fontColor={theme.text.secondary}
        placeholder="max"
        value={localMax ?? null}
        setter={(v) => setLocalMax(v ?? null)}
        onEnter={() => {
          if (
            localMax !== null &&
            min !== undefined &&
            min !== null &&
            localMax < min
          ) {
            setSnackBarErrors([`${localMax} is less than ${min}`]);
            return;
          }
          setRange((cur) => [cur[0], localMax]);
        }}
      />
    </Container>
  );
}
