import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import PointSizeIcon from "@mui/icons-material/ScatterPlot";
import { Checkbox, FormControlLabel } from "@mui/material";
import Slider from "@mui/material/Slider";
import { useCallback, useMemo, useState } from "react";
import * as recoil from "recoil";
import { ACTION_SET_POINT_SIZE } from "../constants";
import { ActionItem } from "../containers";
import {
  currentActionAtom,
  currentPointSizeAtom,
  isPointSizeAttenuatedAtom,
} from "../state";
import { ActionPopOver } from "./shared";
import style from "./style.module.css";

const VALID_FLOAT_REGEX = new RegExp("^([0-9]+([.][0-9]*)?|[.][0-9]+)$");

export const PointSizeSlider = () => {
  const theme = useTheme();
  const [pointSize, setPointSize] = recoil.useRecoilState(currentPointSizeAtom);
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] =
    recoil.useRecoilState(isPointSizeAttenuatedAtom);

  const pointSizeNum = useMemo(() => Number(pointSize), [pointSize]);

  const [minBound, setMinBound] = useState(pointSizeNum / 10);
  const [maxBound, setMaxBound] = useState(() =>
    pointSizeNum === 0 ? 2 : pointSizeNum * 2
  );
  const [isTextBoxEmpty, setIsTextBoxEmpty] = useState(false);

  const step = useMemo(
    () => (pointSizeNum === 0 ? 0.01 : pointSizeNum / 10),
    [minBound, maxBound]
  );

  const handleSliderChange = useCallback(
    (event: Event, newValue: number | number[]) => {
      setPointSize(String(newValue));
      setIsTextBoxEmpty(false);
    },
    [setPointSize]
  );

  const handleTextBoxChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!VALID_FLOAT_REGEX.test(e.target.value)) {
        setIsTextBoxEmpty(true);
        return;
      }

      setIsTextBoxEmpty(false);

      const newValue = e.target.value;
      setPointSize(newValue);

      setMinBound(Number(newValue) / 10);

      if (parseInt(newValue) === 0) {
        setMaxBound(2);
      } else {
        setMaxBound(Number(newValue) * 2);
      }
    },
    [setPointSize, setIsTextBoxEmpty]
  );

  const handlePointSizeAttenuationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setIsPointSizeAttenuated(e.target.checked);
    },
    [setIsPointSizeAttenuated]
  );

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Set point size</PopoutSectionTitle>
      <div className={style.pointSizeBaseContainer}>
        <FormControlLabel
          control={
            <Checkbox
              checked={isPointSizeAttenuated}
              size="small"
              disableFocusRipple
              onChange={handlePointSizeAttenuationChange}
            />
          }
          classes={{ label: style.pointSizeAttenuationLabel }}
          label="Point Size Attenuation"
        />

        <div className={style.pointSizeContainer}>
          <Slider
            className={style.pointSizeSlider}
            sx={{
              color: theme.primary.main,
            }}
            classes={{
              thumb: style.pointSizeSliderThumb,
              dragging: style.pointSizeSliderThumb,
            }}
            value={pointSizeNum}
            min={minBound}
            step={step}
            max={maxBound}
            onChange={handleSliderChange}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value.toFixed(2)}`}
          />
          <input
            className={style.pointSizeTextField}
            value={isTextBoxEmpty ? "" : pointSize}
            onChange={handleTextBoxChange}
          />
        </div>
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
      <ActionItem title="Set Point Size">
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
