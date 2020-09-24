import React from "react";
import RangeSlider, { NamedRangeSlider, Range } from "./RangeSlider";

import { atom } from "recoil";

const boundsAtom = atom<Range>({
  key: "boundsAtom",
  default: [0, 1],
});

const rangeAtom = atom<Range>({
  key: "rangeAtom",
  default: [0, 1],
});

const includeNoneAtom = atom<boolean>({
  key: "includeNoneAtom",
  default: true,
});

export default {
  component: RangeSlider,
  title: "RangeSlider",
};

export const standard = () => <RangeSlider {...{ rangeAtom, boundsAtom }} />;

export const named = () => {
  const props = {
    boundsAtom,
    rangeAtom,
    includeNoneAtom,
    color: "pink",
    name: "Name",
    valueName: "Value Name",
  };
  return <NamedRangeSlider {...props} />;
};
