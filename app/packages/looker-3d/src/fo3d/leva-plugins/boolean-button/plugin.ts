import { BooleanButtonInput } from "./types";

export const normalize = ({ ...settings }: BooleanButtonInput) => {
  return {
    value: null,
    settings,
  };
};
