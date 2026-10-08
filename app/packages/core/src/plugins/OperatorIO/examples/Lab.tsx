import * as fos from "@fiftyone/state";
import { Typography } from "@mui/material";
import { useReverbValue } from "@fiftyone/reverb";

export default function Lab() {
  const filters = useReverbValue(fos.filters);

  console.log(">>>", filters);

  return <Typography>Lab</Typography>;
}
