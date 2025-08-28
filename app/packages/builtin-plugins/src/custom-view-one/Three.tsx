import { CodeBlock } from "@fiftyone/components";
import { useTriggerPanelEvent } from "@fiftyone/operators";
import { Box, Button, Typography } from "@mui/material";
import { useRecoilValue } from "recoil";
import { panelOneStateAtom } from "./recoil";

export default function Three(props) {
  const { schema } = props;
  const { view } = schema;
  const { load_run_recoil } = view;
  const runData = useRecoilValue(panelOneStateAtom);

  const triggerEvent = useTriggerPanelEvent();

  return (
    <Box>
      <Button
        onClick={() => {
          triggerEvent(load_run_recoil);
        }}
      >
        Load Run
      </Button>
      {!runData && <Typography>Run data not loaded</Typography>}
      {runData && <CodeBlock text={JSON.stringify(runData)} language="json" />}
    </Box>
  );
}
