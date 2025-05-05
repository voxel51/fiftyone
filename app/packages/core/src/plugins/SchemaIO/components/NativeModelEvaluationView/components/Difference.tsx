import { Stack, Typography, useTheme } from "@mui/material";
import React from "react";
import { getNumericDifference } from "../utils";
import { ArrowDropDown, ArrowDropUp } from "@mui/icons-material";

export default function Difference(props) {
  const { value, compareValue, arrow, lesserIsBetter, mode = "ratio" } = props;
  const theme = useTheme();

  const difference = getNumericDifference(value, compareValue);
  const ratio = getNumericDifference(value, compareValue, true, 1);
  const positiveRatio = ratio > 0;
  const zeroRatio = ratio === 0;
  const negativeRatio = ratio < 0;
  const isRatioNaN = isNaN(ratio);
  const showTrophy = lesserIsBetter ? difference < 0 : difference > 0;

  const ratioColor = positiveRatio
    ? "#8BC18D"
    : negativeRatio
    ? "#FF6464"
    : theme.palette.text.tertiary;

  return (
    <Stack direction="row">
      {positiveRatio && arrow && <ArrowDropUp sx={{ color: ratioColor }} />}
      {negativeRatio && arrow && <ArrowDropDown sx={{ color: ratioColor }} />}
      {mode === "percentage" && (
        <Typography sx={{ color: ratioColor }}>
          {isRatioNaN ? "-" : `${ratio}%`}
        </Typography>
      )}
      {mode === "ratio" && (
        <Typography sx={{ color: ratioColor }}>{difference}</Typography>
      )}
      {mode === "trophy" && showTrophy && (
        <Typography sx={{ fontSize: 12 }}>🏆</Typography>
      )}
    </Stack>
  );
}
