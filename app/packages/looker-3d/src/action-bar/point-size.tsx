import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import { Slider } from "@fiftyone/core/src/components/Common/RangeSlider";
import PointSizeIcon from "@mui/icons-material/ScatterPlot";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import {
  ACTION_SET_POINT_SIZE,
  currentActionAtom,
  currentPointSizeAtom,
  pointSizeRangeAtom,
} from "../state";
import { ActionPopOver } from "./shared";

export const PointSizeSlider = () => {
  const theme = useTheme();

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Set point size</PopoutSectionTitle>
      <Slider
        valueAtom={currentPointSizeAtom}
        color={theme.primary.mainChannel}
        boundsAtom={pointSizeRangeAtom}
        showValue={false}
        showBounds={false}
      />
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
