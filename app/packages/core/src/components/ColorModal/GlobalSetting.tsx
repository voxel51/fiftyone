import * as fos from "@fiftyone/state";
import { SettingsBackupRestore } from "@mui/icons-material";
import { Divider, Slider, Typography } from "@mui/material";
import { default as React } from "react";
import { useRecoilState } from "recoil";
import Checkbox from "../Common/Checkbox";
import RadioGroup from "../Common/RadioGroup";
import {
  ControlGroupWrapper,
  LabelTitle,
  SectionWrapper,
} from "./ShareStyledDiv";
import ColorPalette from "./colorPalette/ColorPalette";
import DefaultMaskTargets from "./colorPalette/DefaultMaskTargets";
import GlobalColorscale from "./colorPalette/GlobalColorscale";
import ShuffleColor from "./controls/RefreshColor";

const GlobalSetting = () => {
  const [colorScheme, setColorScheme] = useRecoilState(fos.colorScheme);

  return (
    <div>
      <Divider>General</Divider>
      <ControlGroupWrapper>
        <LabelTitle>Color annotations by</LabelTitle>
        <SectionWrapper data-cy="colorBy-controls">
          <RadioGroup
            choices={["field", "value", "instance"]}
            value={colorScheme.colorBy ?? "field"}
            setValue={(mode) =>
              setColorScheme({ ...colorScheme, colorBy: mode })
            }
            horizontal
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
          {colorScheme.opacity !== fos.DEFAULT_ALPHA && (
            <span
              onClick={() =>
                setColorScheme({ ...colorScheme, opacity: fos.DEFAULT_ALPHA })
              }
              style={{ cursor: "pointer", margin: "0.5rem" }}
              title={"Reset label opacity"}
            >
              <SettingsBackupRestore fontSize="small" />
            </span>
          )}
        </LabelTitle>
        <Slider
          value={Number(colorScheme.opacity)}
          onChange={(event: Event, newValue: number | number[]) => {
            setColorScheme({ ...colorScheme, opacity: newValue as number });
          }}
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
          value={Boolean(colorScheme.multicolorKeypoints)}
          setValue={(v) =>
            setColorScheme({ ...colorScheme, multicolorKeypoints: v })
          }
        />
        <Checkbox
          name={"Show keypoint skeletons"}
          value={Boolean(colorScheme.showSkeletons)}
          setValue={(v) => setColorScheme({ ...colorScheme, showSkeletons: v })}
        />
      </ControlGroupWrapper>
      <Divider>Segmentation</Divider>
      <ControlGroupWrapper>
        <DefaultMaskTargets />
      </ControlGroupWrapper>
      <Divider>Colorscale</Divider>
      <ControlGroupWrapper>
        <GlobalColorscale />
      </ControlGroupWrapper>
    </div>
  );
};

export default GlobalSetting;
