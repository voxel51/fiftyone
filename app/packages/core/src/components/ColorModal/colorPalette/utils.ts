import { getRandomColorFromPool } from "../utils";

export const defaultMaskTargetsColors = (colorPool: readonly string[]) => {
  return [
    {
      defaultMaskTargetsColors: {
        intTarget: 1,
        color: getRandomColorFromPool(colorPool),
      },
    },
  ];
};
