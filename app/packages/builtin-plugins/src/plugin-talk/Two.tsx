import { CodeBlock } from "@fiftyone/components";
import { useTriggerPanelEvent } from "@fiftyone/operators";
import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";

export default function Two(props) {
  const { schema } = props;
  const { view } = schema;
  const { load_run_manual } = view;
  const [runData, setRunData] = useState(null);

  const triggerEvent = useTriggerPanelEvent();

  return (
    <Box>
      <Button
        onClick={() => {
          triggerEvent(load_run_manual, {}, false, (result) => {
            setRunData(result.result.run_data);
          });
        }}
      >
        Load Run
      </Button>
      {!runData && <Typography>Run data not loaded</Typography>}
      {runData && <CodeBlock text={JSON.stringify(runData)} language="json" />}
    </Box>
  );
}
