import * as fos from "@fiftyone/state";
import {
  useReverbState,
  useReverbValue,
  useSetReverbState,
} from "@fiftyone/reverb";
import styled from "styled-components";
import type { InputType } from "./Input";
import { Input } from "./Input";

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
  const ftype = useReverbValue(fos.fieldType({ path }));
  const [[min, max], setRange] = useReverbState(
    fos.rangeAtom({
      modal,
      path,
      withBounds: false,
    }),
  );
  const setSnackBarErrors = useSetReverbState(fos.snackbarErrors);

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
        value={min ?? null}
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
        value={max ?? null}
      />
    </Container>
  );
}
