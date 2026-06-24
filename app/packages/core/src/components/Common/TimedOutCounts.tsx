import { Tooltip } from "@fiftyone/components";
import { AggregationQueryTimeout } from "@fiftyone/state";
import { NetworkError } from "@fiftyone/utilities";
import { ErrorOutline } from "@mui/icons-material";
import React from "react";
import { useTheme } from "styled-components";

const DEFAULT_TEXT =
  "Counts timed out. Filter down the results to load counts for this field.";

// a gateway timeout / killed op surfaces as a NetworkError; a server-side
// max-query-time cutoff surfaces as AggregationQueryTimeout
export const isAggregationTimeout = (error: unknown) =>
  error instanceof NetworkError || error instanceof AggregationQueryTimeout;

const TimedOutCounts = ({ text = DEFAULT_TEXT }: { text?: string }) => {
  const theme = useTheme();
  return (
    <Tooltip placement="top-center" text={text}>
      <ErrorOutline
        style={{
          color: theme.text.secondary,
          height: 14,
          width: 14,
        }}
      />
    </Tooltip>
  );
};

export default TimedOutCounts;
