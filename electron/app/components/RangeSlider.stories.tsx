import React from "react";
import RangeSlider, { Range } from "./RangeSlider";

import { atom } from "recoil";

const rangeAtomStory = atom<Range>({
  key: "rangeAtomStory",
  default: [0, 1],
});

const boundsAtomStory = atom<Range>({
  key: "rangeAtomStory",
  default: [null, null],
});

export default {
  component: RangeSlider,
  title: "RangeSlider",
};

export const standard = () => (
  <RangeSlider rangeAtom={rangeAtomStory} boundsAtom={boundsAtomStory} />
);
