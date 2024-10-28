import { Box, JSONView, TableSkeleton } from "@fiftyone/teams-components";
import { getType } from "@fiftyone/teams-utilities";
import { FormControlLabel, Switch } from "@mui/material";
import dynamic from "next/dynamic";
import { useState } from "react";

// Plotly.js used by OperatorIO does not support SSR
export const DynamicOperatorIO = dynamic(
  import("@fiftyone/teams-components/src/OperatorIO"),
  { ssr: false }
);

export default function RunIO(props: RunIOPropsType) {
  const { property, data, type } = props;
  const [rawMode, setRawMode] = useState(false);
  const previewModeAvailable = getType(property) === "Object";

  if (property === "loading") {
    return <TableSkeleton />;
  }

  return (
    <Box>
      <FormControlLabel
        disabled={!previewModeAvailable}
        control={
          <Switch
            title={rawMode ? "Active" : "Inactive"}
            defaultChecked={!previewModeAvailable}
            onChange={(e, checked) => setRawMode(checked)}
          />
        }
        label="Show raw"
        sx={{ pb: 2, pl: 1 }}
        title={
          !previewModeAvailable ? "Preview mode is unavailable" : undefined
        }
      />
      {previewModeAvailable && !rawMode && (
        <DynamicOperatorIO
          property={property}
          data={data}
          readOnly={type === "inputs"}
          isOutput={type === "outputs"}
        />
      )}
      {(!previewModeAvailable || rawMode) && <JSONView content={data} />}
    </Box>
  );
}

export type RunIOPropsType = {
  property: Object;
  data: unknown;
  error?: Error;
  type: IOType;
};

export type IOType = "inputs" | "outputs";
