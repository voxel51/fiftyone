import { usePanelClientEvent, useTriggerPanelEvent } from "@fiftyone/operators";
import { Box, Button, Typography } from "@mui/material";
import { useState } from "react";

export default function Four(props) {
  const { set_samples_count } = props.schema.view;

  const { register } = usePanelClientEvent();
  const triggerEvent = useTriggerPanelEvent();
  const [count, setCount] = useState();

  register("set_samples_count", (params) => {
    setCount(params.count);
  });

  return (
    <Box>
      <Button
        onClick={() => {
          triggerEvent(set_samples_count);
        }}
      >
        Set samples count
      </Button>
      <Typography>Samples count: {count}</Typography>
    </Box>
  );
}
