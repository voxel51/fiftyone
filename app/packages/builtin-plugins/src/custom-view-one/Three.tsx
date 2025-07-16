import { CodeBlock } from "@fiftyone/components";
import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId } from "@fiftyone/spaces";
import { Box, Button, Typography } from "@mui/material";
import { useRecoilValue } from "recoil";
import { panelOneStateAtom } from "./recoil";

export default function Three(props) {
  const { schema } = props;
  const { view } = schema;
  const { load_run_recoil } = view;
  const runData = useRecoilValue(panelOneStateAtom);

  const handleEvent = usePanelEvent();
  const panelId = usePanelId();

  return (
    <Box>
      <Button
        onClick={() => {
          handleEvent(panelId, { operator: load_run_recoil });
        }}
      >
        Load Run
      </Button>
      {!runData && <Typography>Run data not loaded</Typography>}
      {runData && <CodeBlock text={JSON.stringify(runData)} language="json" />}
    </Box>
  );
}
