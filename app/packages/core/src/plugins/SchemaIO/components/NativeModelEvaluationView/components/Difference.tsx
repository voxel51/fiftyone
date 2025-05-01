import { ArrowDropDown, ArrowDropUp } from "@mui/icons-material";
import { Box, Stack, Typography, useTheme } from "@mui/material";
import React from "react";
import { getNumericDifference } from "../utils";

export default function Difference(props) {
  const {
    value,
    compareValue,
    arrow,
    lesserIsBetter,
    mode = "numeric",
  } = props;
  const theme = useTheme();

  const difference = getNumericDifference(value, compareValue);
  const numericDifference = getNumericDifference(value, compareValue, true, 1);
  const isNumericDifferencePositive = numericDifference > 0;
  const isNumericDifferenceNegative = numericDifference < 0;
  const isNumericDifferenceZero = numericDifference === 0;
  const isNumericDifferenceNaN = isNaN(numericDifference);
  const showTrophy = lesserIsBetter ? difference < 0 : difference > 0;

  const numericDifferenceColor = isNumericDifferencePositive
    ? "#8BC18D"
    : isNumericDifferenceNegative
    ? "#FF6464"
    : theme.palette.text.tertiary;

  return (
    <Stack direction="row">
      {isNumericDifferencePositive && arrow && (
        <ArrowDropUp sx={{ color: numericDifferenceColor }} />
      )}
      {isNumericDifferenceNegative && arrow && (
        <ArrowDropDown sx={{ color: numericDifferenceColor }} />
      )}
      {isNumericDifferenceZero && arrow && <Box sx={{ pl: "21px" }} />}
      {mode === "percentage" && (
        <Typography sx={{ color: numericDifferenceColor }}>
          {isNumericDifferenceNaN ? "-" : `${numericDifference}%`}
        </Typography>
      )}
      {mode === "numeric" && (
        <Typography sx={{ color: numericDifferenceColor }}>
          {difference}
        </Typography>
      )}
      {mode === "trophy" && showTrophy && (
        <Typography sx={{ fontSize: 12 }}>🏆</Typography>
      )}
    </Stack>
  );
}
