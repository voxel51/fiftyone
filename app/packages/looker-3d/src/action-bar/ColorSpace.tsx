import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import { useMemo } from "react";
import * as recoil from "recoil";
import { ActionItem } from "../containers";
import {
  ACTION_SHADE_BY,
  currentActionAtom,
  shadeByAtom,
  SHADE_BY_CHOICES,
  SHADE_BY_INTENSITY,
  SHADE_BY_RGB,
} from "../state";
import { ActionPopOver } from "./shared";

export const ChooseColorSpace = ({
  isRgbPresent,
}: {
  isRgbPresent: boolean;
}) => {
  const [currentAction, setAction] = recoil.useRecoilState(currentActionAtom);

  return (
    <>
      <ActionItem title="Shade By">
        <ColorLensIcon
          sx={{ fontSize: 24 }}
          color="inherit"
          onClick={(e) => {
            const targetAction = ACTION_SHADE_BY;
            const nextAction =
              currentAction === targetAction ? null : targetAction;
            setAction(nextAction);
            e.stopPropagation();
            e.preventDefault();
            return false;
          }}
        />
      </ActionItem>
      {currentAction === ACTION_SHADE_BY && (
        <ColorSpaceChoices isRgbPresent={isRgbPresent} />
      )}
    </>
  );
};

const ColorSpaceChoices = ({ isRgbPresent }: { isRgbPresent: boolean }) => {
  const [current, setCurrent] = recoil.useRecoilState(shadeByAtom);

  const choices = useMemo(() => {
    if (!isRgbPresent) {
      return SHADE_BY_CHOICES.filter(
        (choice) =>
          choice.value !== SHADE_BY_INTENSITY && choice.value !== SHADE_BY_RGB
      );
    }

    return SHADE_BY_CHOICES;
  }, [isRgbPresent]);

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Shade by</PopoutSectionTitle>

      <TabOption
        active={current}
        options={choices.map(({ label, value }) => {
          return {
            text: value,
            title: `Shade by ${label}`,
            onClick: () => current !== value && setCurrent(value),
          };
        })}
      />
    </ActionPopOver>
  );
};
