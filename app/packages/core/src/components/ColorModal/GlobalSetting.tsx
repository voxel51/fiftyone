import { SettingsBackupRestore } from "@mui/icons-material";
import { Divider, Slider, Typography } from "@mui/material";
import React from "react";

import * as fos from "@fiftyone/state";

import Checkbox from "../Common/Checkbox";
import RadioGroup from "../Common/RadioGroup";
import ColorPalette from "./colorPalette/ColorPalette";

import {
  ControlGroupWrapper,
  LabelTitle,
  SectionWrapper,
} from "./ShareStyledDiv";
import ShuffleColor from "./controls/RefreshColor";

const GlobalSetting: React.FC = ({}) => {
  const { props } = fos.useGlobalColorSetting();
  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    props.setOpacity(newValue as number);
  };

  return (
    <div>
      <Divider>General</Divider>
      <ControlGroupWrapper>
        <LabelTitle>Color annotations by</LabelTitle>
        <SectionWrapper>
          <RadioGroup
            choices={["field", "value"]}
            value={props.colorBy}
            setValue={(mode) => props.setColorBy(mode)}
          />
        </SectionWrapper>
        <ShuffleColor />
        <LabelTitle>Color pool</LabelTitle>
        <Typography fontSize="1rem" pb={0.5}>
          Pool of colors from which otherwise unconfigured fields/values are
          randomly assigned colors.
        </Typography>
        <SectionWrapper>
          <ColorPalette />
        </SectionWrapper>
      </ControlGroupWrapper>
      <ControlGroupWrapper>
        <LabelTitle>
          <span>Label opacity</span>
          {props.opacity !== fos.DEFAULT_ALPHA && (
            <span
              onClick={() => props.setOpacity(fos.DEFAULT_ALPHA)}
              style={{ cursor: "pointer", margin: "0.5rem" }}
              title={"Reset label opacity"}
            >
              <SettingsBackupRestore fontSize="small" />
            </span>
          )}
        </LabelTitle>
        <Slider
          value={Number(props.opacity)}
          onChange={handleSliderChange}
          min={0}
          max={1}
          step={0.01}
          style={{ width: "50%" }}
        />
      </ControlGroupWrapper>
      <Divider>Keypoints</Divider>
      <ControlGroupWrapper>
        <Checkbox
          name={"Multicolor keypoints"}
          value={Boolean(props.useMulticolorKeypoints)}
          setValue={(v) => props.setUseMultiplecolorKeypoints(v)}
        />
        <Checkbox
          name={"Show keypoint skeletons"}
          value={Boolean(props.showSkeleton)}
          setValue={(v) => props.setShowSkeleton(v)}
        />
      </ControlGroupWrapper>
      Note that in this panel the color pool is the only savable option for now.
    </div>
  );
};

export default GlobalSetting;
