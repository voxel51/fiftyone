import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import {
  ACTION_COLOR_BY,
  colorByAtom,
  COLOR_BY_CHOICES,
  currentActionAtom,
} from "../state";
import { ActionPopOver } from "./shared";

export const ChooseColorSpace = () => {
  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);

  return (
    <>
      <ActionItem>
        <ColorLensIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            const targetAction = ACTION_COLOR_BY;
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
        />
      </ActionItem>
      {currentAction === ACTION_COLOR_BY && <ColorSpaceChoices />}
    </>
  );
};

const ColorSpaceChoices = () => {
  const [current, setCurrent] = recoil.useRecoilState(colorByAtom);

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Shade by</PopoutSectionTitle>

      <TabOption
        active={current}
        options={COLOR_BY_CHOICES.map(({ label, value }) => {
          return {
            text: value,
            title: `Color by ${label}`,
            onClick: () => current !== value && setCurrent(value),
          };
        })}
      />
    </ActionPopOver>
  );
};
