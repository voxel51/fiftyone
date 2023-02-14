import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
// import { Slider } from "@fiftyone/core/src/components/Common/RangeSlider";
import PointSizeIcon from "@mui/icons-material/ScatterPlot";
import Input from "@mui/material/Input";
import Slider from "@mui/material/Slider";
import { useCallback, useMemo, useState } from "react";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import {
  ACTION_SET_POINT_SIZE,
  currentActionAtom,
  currentPointSizeAtom,
} from "../state";
import { ActionPopOver } from "./shared";
import "./styles.css";

export const PointSizeSlider = () => {
  const theme = useTheme();
  const [pointSize, setPointSize] = recoil.useRecoilState(currentPointSizeAtom);
  const [minBound, setMinBound] = useState(pointSize / 10);
  const [maxBound, setMaxBound] = useState(pointSize * 2);

  const step = useMemo(() => pointSize / 10, [minBound]);

  const handleSliderChange = useCallback(
    (event: Event, newValue: number | number[]) => {
      if (typeof newValue === "number") {
        setPointSize(newValue);
      }
    },
    [setPointSize]
  );

  const handleTextBoxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = Number(e.target.value);
      setPointSize(newValue);
      setMinBound(newValue / 10);
      setMaxBound(newValue * 2);
    },
    [setPointSize]
  );

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Set point size</PopoutSectionTitle>
      <div className="point-size-container">
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
          onChange={handleSliderChange}
          valueLabelDisplay="auto"
        />
        <Input
          className="point-size-text-field"
          sx={{
            color: theme.primary.main,
          }}
          id="outlined-basic"
          value={pointSize}
          onChange={handleTextBoxChange}
          size="small"
          margin="none"
        />
      </div>
    </ActionPopOver>
  );
};

export const SetPointSizeButton = () => {
  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);

  const handleClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement, MouseEvent>) => {
      const targetAction = ACTION_SET_POINT_SIZE;
      setAction((currentAction_) => {
        const nextAction =
          currentAction_ === targetAction ? null : targetAction;
        return nextAction;
      });
      e.stopPropagation();
      e.preventDefault();
      return false;
    },
    [setAction]
  );

  return (
    <>
      <ActionItem>
        <PointSizeIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={handleClick}
        />
      </ActionItem>
      {currentAction === ACTION_SET_POINT_SIZE && <PointSizeSlider />}
    </>
  );
};
