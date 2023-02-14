import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
// import { Slider } from "@fiftyone/core/src/components/Common/RangeSlider";
import PointSizeIcon from "@mui/icons-material/ScatterPlot";
import Input from "@mui/material/Input";
import Slider from "@mui/material/Slider";
import { useMemo, useState } from "react";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import {
  ACTION_SET_POINT_SIZE,
  currentActionAtom,
  currentPointSizeAtom,
} from "../state";
import { ActionPopOver } from "./shared";
import "./override.css";

export const PointSizeSlider = () => {
  const theme = useTheme();
  const [pointSize, setPointSize] = recoil.useRecoilState(currentPointSizeAtom);
  const [minBound, setMinBound] = useState(pointSize / 10);
  const [maxBound, setMaxBound] = useState(pointSize * 2);

  const step = useMemo(() => pointSize / 10, [minBound]);

  const handleChange = (event: Event, newValue: number | number[]) => {
    if (typeof newValue === "number") {
      setPointSize(newValue);
    }
  };

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Set point size</PopoutSectionTitle>
      <div
        id="sashank"
        style={{
          margin: "1em",
          display: "flex",
          justifyContent: "center",
          alignContent: "center",
        }}
      >
        <Slider
          className="point-size-slider"
          sx={{
            color: theme.primary.main,
            thumb: {
              "&:focused, &:activated, &:jumped, &:hover": {
                boxShadow: "none",
              },
            },
          }}
          value={pointSize}
          min={minBound}
          step={step}
          max={maxBound}
          onChange={handleChange}
          valueLabelDisplay="auto"
        />
        <Input
          className="point-size-text-field"
          sx={{
            color: theme.primary.main,
          }}
          id="outlined-basic"
          value={pointSize}
          onChange={(e) => {
            const newValue = Number(e.target.value);
            setPointSize(newValue);
            setMinBound(newValue / 10);
            setMaxBound(newValue * 2);
          }}
          size="small"
          margin="none"
        />
      </div>
    </ActionPopOver>
  );
};

export const SetPointSizeButton = () => {
  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);
  return (
    <>
      <ActionItem>
        <PointSizeIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            const targetAction = ACTION_SET_POINT_SIZE;
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
        />
      </ActionItem>
      {currentAction === ACTION_SET_POINT_SIZE && <PointSizeSlider />}
    </>
  );
};
