import React, { useEffect } from "react";
import { Divider, Slider } from "@mui/material";
import { useRecoilState, useRecoilValue } from "recoil";
import { Check } from "@mui/icons-material";
import { cloneDeep } from "lodash";
import * as fos from "@fiftyone/state";

import RadioGroup from "../Common/RadioGroup";
import ColorPalette from "./colorPalette/ColorPalette";
import Checkbox from "../Common/Checkbox";
import { tempGlobalSetting } from "./utils";
import {
  ControlGroupWrapper,
  LabelTitle,
  SectionWrapper,
} from "./ShareStyledDiv";

const GlobalSetting: React.FC = ({}) => {
  const [global, setGlobal] = useRecoilState(tempGlobalSetting);
  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    setGlobal((s) => ({ ...cloneDeep(s), opacity: newValue as number }));
  };
  // TODO: color update
  const colors = useRecoilValue(fos.coloring(false)).pool as string[];
  const opacity = useRecoilValue(fos.alpha(false));
  const colorBy = useRecoilValue(
    fos.appConfigOption({ key: "colorBy", modal: false })
  );
  const useMulticolorKeypoints = useRecoilValue(
    fos.appConfigOption({ key: "multicolorKeypoints", modal: false })
  );
  const showSkeleton = useRecoilValue(
    fos.appConfigOption({ key: "showSkeletons", modal: false })
  );

  // initialize tempGlobalSetting on modal mount
  useEffect(() => {
    const setting = {
      colorBy,
      colors,
      opacity,
      useMulticolorKeypoints,
      showSkeleton,
    };
    setGlobal(setting);
  }, []);

  if (!global) return null;
  return (
    <div>
      <Divider>Color Setting</Divider>
      <ControlGroupWrapper>
        <LabelTitle>Color annotations by</LabelTitle>
        <SectionWrapper>
          <RadioGroup
            choices={["field", "value"]}
            value={global.colorBy}
            setValue={(mode) =>
              setGlobal((s) => ({
                ...cloneDeep(s),
                colorBy: mode as "field" | "value",
              }))
            }
          />
        </SectionWrapper>
        <LabelTitle>Color Pool</LabelTitle>
        <SectionWrapper>
          <ColorPalette />
        </SectionWrapper>
      </ControlGroupWrapper>
      <ControlGroupWrapper>
        <LabelTitle>
          <span>Label opacity</span>
          {global.opacity !== fos.DEFAULT_ALPHA && (
            <span
              onClick={() =>
                setGlobal((s) => ({
                  ...cloneDeep(s),
                  opacity: fos.DEFAULT_ALPHA,
                }))
              }
              style={{ cursor: "pointer", margin: "0.25rem" }}
              title={"Reset label opacity"}
            >
              <Check />
            </span>
          )}
        </LabelTitle>
        <Slider
          value={typeof global.opacity === "number" ? global.opacity : 0}
          onChange={handleSliderChange}
          min={0}
          max={1}
        />
      </ControlGroupWrapper>
      <Divider>Keypoints Setting</Divider>
      <ControlGroupWrapper>
        <Checkbox
          name={"Show keypoints in multicolor"}
          value={Boolean(global.useMulticolorKeypoints)}
          setValue={(v) =>
            setGlobal((s) => ({ ...cloneDeep(s), useMulticolorKeypoints: v }))
          }
        />
        <Checkbox
          name={"Show keypoint skeletons"}
          value={Boolean(global.showSkeleton)}
          setValue={(v) =>
            setGlobal((s) => ({ ...cloneDeep(s), showSkeleton: v }))
          }
        />
      </ControlGroupWrapper>
    </div>
  );
};

export default GlobalSetting;
