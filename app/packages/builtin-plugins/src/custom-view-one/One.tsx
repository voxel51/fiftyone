import { useTriggerPanelEvent } from "@fiftyone/operators";
import { usePanelState } from "@fiftyone/spaces";
import { Box, Button, TextField, Typography } from "@mui/material";
import { cloneDeep, get, set } from "lodash";

export default function One(props) {
  const { data, schema } = props;
  const { view } = schema;
  const { increment, decrement, set_count } = view;

  const triggerEvent = useTriggerPanelEvent();
  const firstCount = data?.counts?.first ?? "First count is not provided";
  const secondCount = data?.counts?.second ?? "Second count is not provided";

  const [panelState, setPanelState] = usePanelState();
  const [panelData] = usePanelState(undefined, undefined, true);

  console.log(">>> panelState:", panelState);
  console.log(">>> panelData:", panelData);

  return (
    <Box>
      <Typography variant="h4">Example One</Typography>
      <Button
        onClick={() => {
          triggerEvent(increment);
        }}
      >
        Increment First
      </Button>
      <Button
        onClick={() => {
          triggerEvent(decrement);
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
          triggerEvent(set_count, { count: e.target.value });
        }}
      />
      <Typography>First: {firstCount}</Typography>
      <Typography>Second: {secondCount}</Typography>
    </Box>
  );
}
