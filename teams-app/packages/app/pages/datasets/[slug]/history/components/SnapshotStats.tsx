import { Stack, Typography } from "@mui/material";
import formatChanges from "../utils/format-changes";
import SamplesTotal from "./SamplesTotal";
import SnapshotChanges from "./SnapshotChanges";

export default function SnapshotStats(props: SnapshotStatsPropsType) {
  const { singleLine, totalSamples } = props;

  const formattedChanges = formatChanges(props);

  return (
    <Stack
      direction={singleLine ? "row" : "column"}
      spacing={singleLine ? 1 : 0}
      divider={singleLine ? <Typography>&middot;</Typography> : null}
    >
      <SamplesTotal count={totalSamples} />
      {formattedChanges && <SnapshotChanges items={formattedChanges} />}
    </Stack>
  );
}

type SnapshotStatsPropsType = {
  numSamplesAdded: number;
  numSamplesChanged: number;
  numSamplesDeleted: number;
  singleLine?: boolean;
  totalSamples: number;
};
