import React, { useRef, useState } from "react";
import { Divider, Slider } from "@mui/material";
import styled from "styled-components";

import { Check } from "@mui/icons-material";
import OpacityIcon from "@mui/icons-material/Opacity";

import * as fos from "@fiftyone/state";
import RadioGroup from "../Common/RadioGroup";
import { PopoutSectionTitle, useTheme } from "@fiftyone/components";
import ColorPalette from "./colorPalette/ColorPalette";
import { useRecoilState, useRecoilValue } from "recoil";
import Checkbox from "../Common/Checkbox";

const ControlGroupWrapper = styled.div`
  margin: 0.5rem 2rem;
`;

const LabelTitle = styled.div`
  margin: 0 -0.5rem;
  padding: 0 0.5rem;
  font-size: 1rem;
  line-height: 2;
  font-weight: bold;
`;

type State = {
  colorBy: string;
  colors: string[];
  opacity: number;
  useMulticolorKeypoints: boolean;
  showSkeleton: boolean;
};

const GlobalSetting: React.FC = ({}) => {
  const initialState = {
    colorBy: useRecoilValue(
      fos.appConfigOption({ modal: false, key: "colorBy" })
    ),
    colors: [],
    opacity: useRecoilValue(fos.alpha(false)),
    useMulticolorKeypoints: Boolean(
      useRecoilValue(
        fos.appConfigOption({ modal: false, key: "multicolorKeypoints" })
      )
    ),
    showSkeleton: Boolean(
      useRecoilValue(
        fos.appConfigOption({ modal: false, key: "showSkeletons" })
      )
    ),
  };
  const theme = useTheme();
  const [state, setState] = useState<State>(initialState);

  const handleSliderChange = (event: Event, newValue: number | number[]) => {
    setState((s) => ({ ...s, opacity: newValue as number }));
  };

  return (
    <div>
      <Divider>Color Setting</Divider>
      <ControlGroupWrapper>
        <LabelTitle>Color annotations by</LabelTitle>
        <RadioGroup
          choices={["field", "attribute"]}
          value={state.colorBy}
          setValue={(mode) => setState((s) => ({ ...s, colorBy: mode }))}
        />
        <LabelTitle>Color Pool</LabelTitle>
        <ColorPalette />
      </ControlGroupWrapper>
      <Divider>Opacity Setting</Divider>
      <ControlGroupWrapper>
        <LabelTitle>
          <span>Label opacity</span>
          {state.opacity !== fos.DEFAULT_ALPHA && (
            <span
              onClick={() =>
                setState((s) => ({ ...s, opacity: fos.DEFAULT_ALPHA }))
              }
              style={{ cursor: "pointer", margin: "0.25rem" }}
              title={"Reset label opacity"}
            >
              <Check />
            </span>
          )}
        </LabelTitle>
        <Slider
          value={typeof state.opacity === "number" ? state.opacity : 0}
          onChange={handleSliderChange}
          min={0}
          max={1}
        />
      </ControlGroupWrapper>
      <Divider>Keypoints Setting</Divider>
      <ControlGroupWrapper>
        <Checkbox
          name={"Show keypoints in multicolor"}
          value={state.useMulticolorKeypoints}
          setValue={(v) =>
            setState((s) => ({ ...s, useMulticolorKeypoints: v }))
          }
        />
        <Checkbox
          name={"Show keypoint skeletons"}
          value={state.showSkeleton}
          setValue={(v) => setState((s) => ({ ...s, showSkeleton: v }))}
        />
      </ControlGroupWrapper>
    </div>
  );
};

export default GlobalSetting;
