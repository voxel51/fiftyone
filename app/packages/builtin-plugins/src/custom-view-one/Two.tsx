import { CodeBlock } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";

export default function Two(props) {
  const { schema } = props;
  const { view } = schema;
  const { load_run_manual } = view;
  const [runData, setRunData] = useState(null);

  const handleEvent = usePanelEvent();
  const panelId = usePanelId();

  return (
    <Box>
      <Button
        onClick={() => {
          handleEvent(panelId, {
            operator: load_run_manual,
            callback(result) {
              setRunData(result.result.run_data);
            },
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
