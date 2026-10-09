import * as fos from "@fiftyone/state";
import { Input, InputType, Select, Toggle } from "@voxel51/voodo";
import { useReverbState, useReverbValue } from "@fiftyone/reverb";
import {
  gridAutosizing,
  gridSquareTiles,
  maxGridItemsSizeBytes,
} from "../atoms";
import PagingOption from "../Pages/PagingOption";
import { Word } from "./Sentence";

const MediaField = () => {
  const fields = useReverbValue(fos.mediaFields);
  const [field, setField] = useReverbState(fos.selectedMediaField(false));
  if (!fields || fields.length <= 1) return null;

  return (
    <>
      <Word>Media</Word>
      <Select
        exclusive
        portal
        value={field}
        options={fields.map((f) => ({ id: f, data: { label: f } }))}
        onChange={(v) => typeof v === "string" && setField(v)}
      />
    </>
  );
};

const NATIVE = "native";
const SQUARE = "square";

const Tiles = () => {
  const [square, setSquare] = useReverbState(gridSquareTiles);

  return (
    <>
      <Word>Tiles</Word>
      <Select
        exclusive
        portal
        value={square ? SQUARE : NATIVE}
        options={[
          { id: NATIVE, data: { label: "Native aspect" } },
          { id: SQUARE, data: { label: "Square" } },
        ]}
        onChange={(v) => setSquare(v === SQUARE)}
      />
    </>
  );
};

const Memory = () => {
  const [autosizing, setAutosizing] = useReverbState(gridAutosizing);
  const [bytes, setBytes] = useReverbState(maxGridItemsSizeBytes);

  return (
    <>
      <Word>Memory</Word>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Toggle
          checked={autosizing}
          onChange={setAutosizing}
          aria-label="Autosize"
        />
        <Input
          type={InputType.Number}
          min={1}
          disabled={!autosizing}
          value={Math.round(bytes / 1e6)}
          onChange={(e) => {
            const mb = Number.parseInt(e.target.value, 10);
            if (Number.isFinite(mb) && mb > 0) setBytes(mb * 1e6);
          }}
          style={{ width: "5.5rem", textAlign: "right" }}
          aria-label="Cache size in MB"
        />
        <Word>MB</Word>
      </div>
    </>
  );
};

const DisplayOptions = () => (
  <>
    <MediaField />
    <Tiles />
    <PagingOption />
    <Memory />
  </>
);

export default DisplayOptions;
