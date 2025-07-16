import { usePanelEvent } from "@fiftyone/operators";
import { usePanelId, usePanelState } from "@fiftyone/spaces";
import { Box, Button, TextField, Typography } from "@mui/material";
import { cloneDeep, get, set } from "lodash";

export default function One(props) {
  const { data, schema } = props;
  const { view } = schema;
  const { increment, decrement, set_count } = view;

  const handleEvent = usePanelEvent();
  const panelId = usePanelId();
  const firstCount = data?.counts?.first ?? "First count is not provided";
  const secondCount = data?.counts?.second ?? "Second count is not provided";

  const [panelState, setPanelState] = usePanelState();
  const [panelData, setPanelData] = usePanelState(undefined, undefined, true);

  console.log(">>> panelState:", panelState);
  console.log(">>> panelData:", panelData);

  return (
    <Box>
      <Typography variant="h4">Example One</Typography>
      <Button
        onClick={() => {
          handleEvent(panelId, { operator: increment });
        }}
      >
        Increment First
      </Button>
      <Button
        onClick={() => {
          handleEvent(panelId, { operator: decrement });
        }}
      >
        Decrement First
      </Button>
      <Button
        onClick={() => {
          const updatedState = cloneDeep(panelState);
          const currentFirstCount = get(updatedState, "state.counts.first", 0);
          set(updatedState, "state.counts.first", currentFirstCount + 1);
          setPanelState(updatedState);
        }}
      >
        Increment JS
      </Button>
      <TextField
        size="small"
        onChange={(e) => {
          handleEvent(panelId, {
            operator: set_count,
            params: { count: e.target.value },
          });
        }}
      />
      <Typography>First: {firstCount}</Typography>
      <Typography>Second: {secondCount}</Typography>
    </Box>
  );
}
