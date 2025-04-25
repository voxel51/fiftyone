import { Stack, Typography } from "@mui/material";
import React from "react";
import ColorSquare from "../../components/ColorSquare";
import {
  COMPARE_KEY_COLOR,
  COMPARE_KEY_SECONDARY_COLOR,
  COMPARE_KEY_TERTIARY_COLOR,
  KEY_COLOR,
  SECONDARY_KEY_COLOR,
  TERTIARY_KEY_COLOR,
} from "../../constants";

export default function Legends(props) {
  const { primaryKey, compareKey, prediction, color, compareColor } = props;
  return (
    <Stack
      sx={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        flexWrap: "wrap",
        gap: 1,
      }}
    >
      {prediction ? (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <ColorSquare color={KEY_COLOR} styles={{ height: 12, width: 12 }} />
            <ColorSquare
              color={COMPARE_KEY_COLOR}
              styles={{ height: 12, width: 12 }}
            />
            <Typography>True positives</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <ColorSquare
              color={SECONDARY_KEY_COLOR}
              styles={{ height: 12, width: 12 }}
            />
            <ColorSquare
              color={COMPARE_KEY_SECONDARY_COLOR}
              styles={{ height: 12, width: 12 }}
            />
            <Typography>False positives</Typography>
          </Stack>
          <Stack direction="row" spacing={1} alignItems="center">
            <ColorSquare
              color={TERTIARY_KEY_COLOR}
              styles={{ height: 12, width: 12 }}
            />
            <ColorSquare
              color={COMPARE_KEY_TERTIARY_COLOR}
              styles={{ height: 12, width: 12 }}
            />
            <Typography>False negatives</Typography>
          </Stack>
        </>
      ) : (
        <>
          <Stack direction="row" spacing={1} alignItems="center">
            <ColorSquare color={KEY_COLOR} styles={{ height: 12, width: 12 }} />
            <Typography>{primaryKey}</Typography>
          </Stack>
          {compareKey && (
            <Stack direction="row" spacing={1} alignItems="center">
              <ColorSquare
                color={COMPARE_KEY_COLOR}
                styles={{ height: 12, width: 12 }}
              />
              <Typography>{compareKey}</Typography>
            </Stack>
          )}
        </>
      )}
    </Stack>
  );
}
