import { PopoutSectionTitle, TabOption } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import ColorLensIcon from "@mui/icons-material/ColorLens";
import { animated, useSpring } from "@react-spring/web";
import { useCallback, useState } from "react";
import { ChromePicker } from "react-color";
import { useRecoilState, useRecoilValue } from "recoil";
import styled from "styled-components";
import {
  ACTION_SHADE_BY,
  SHADE_BY_CHOICES,
  SHADE_BY_CUSTOM,
} from "../constants";
import { ActionItem } from "../containers";
import { currentActionAtom, customColorMapAtom, shadeByAtom } from "../state";
import { ShadeBy } from "../types";
import { ActionPopOver } from "./shared";

export const ChooseColorSpace = () => {
  const [currentAction, setAction] = useRecoilState(currentActionAtom);

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
      {currentAction === ACTION_SHADE_BY && <ColorSpaceChoices />}
    </>
  );
};

const ColorSpaceChoices = () => {
  const [current, setCurrent] = useRecoilState(shadeByAtom);

  const getHandleTabClick = useCallback(
    (shadeBy: ShadeBy) => {
      return () => {
        if (current === shadeBy) {
          return;
        }

        setCurrent(shadeBy);
      };
    },
    [current, setCurrent]
  );

  return (
    <ActionPopOver>
      <PopoutSectionTitle>Shade by</PopoutSectionTitle>

      {current === SHADE_BY_CUSTOM && <CustomColorSpace />}

      <TabOption
        active={current}
        options={SHADE_BY_CHOICES.map(({ label, value }) => {
          return {
            text: value,
            title: `Shade by ${label}`,
            onClick: getHandleTabClick(value),
          };
        })}
      />
    </ActionPopOver>
  );
};

const ChromePickerContainer = styled.div`
  margin-top: 0.5em;
  margin-right: 0.5em;
  display: flex;
  margin: 0.5em auto;
`;

const ColorPickerBox = styled.div<{ backgroundColor: string }>`
  width: 100%;
  min-height: 2rem;
  margin: 0.5em 0.5em 0.25em 0.5em;
  background-color: ${(props) => props.backgroundColor};
`;

const MultiPcdColorPickerContainer = styled.div`
  display: flex;
  align-items: center;
  margin-left: 0.25em;
`;

const CustomColorSpace = () => {
  const springProps = useSpring({
    from: { opacity: 0 },
    to: { opacity: 1 },
    config: { duration: 400 },
  });

  const activePcdSlices = useRecoilValue(fos.activePcdSlices);
  const defaultPcdSlice = useRecoilValue(fos.pinned3DSampleSlice);
  const [customColorMap, setCustomColorMap] =
    useRecoilState(customColorMapAtom);
  const [isColorPickerOn, setIsColorPickerOn] = useState(false);
  const [colorPickerSlice, setColorPickerSlice] = useState("");

  const getOnChangeForSlice = useCallback(
    (slice: string) => {
      return ({ hex }: { hex: string }) => {
        setCustomColorMap((prev) => {
          return {
            ...prev,
            [slice]: hex,
          };
        });
      };
    },
    [setCustomColorMap]
  );

  if (!defaultPcdSlice || activePcdSlices?.length < 2) {
    const slice = activePcdSlices?.length > 0 ? defaultPcdSlice : "default";
    return (
      <animated.div style={{ display: "flex", ...springProps }}>
        <ColorPickerBox
          backgroundColor={customColorMap[slice]}
          onClick={() => setIsColorPickerOn((prev) => !prev)}
        />
        {isColorPickerOn && (
          <ChromePickerContainer>
            <ChromePicker
              color={customColorMap[slice]}
              onChange={getOnChangeForSlice(slice)}
              disableAlpha
            />
          </ChromePickerContainer>
        )}
      </animated.div>
    );
  }

  return (
    <animated.div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyItems: "center",
        ...springProps,
      }}
    >
      {colorPickerSlice?.length > 0 && (
        <ChromePickerContainer>
          <ChromePicker
            color={customColorMap[colorPickerSlice]}
            onChange={getOnChangeForSlice(colorPickerSlice)}
            disableAlpha
          />
        </ChromePickerContainer>
      )}
      {activePcdSlices.map((slice) => {
        return (
          <MultiPcdColorPickerContainer key={slice}>
            <span>{slice} </span>
            <ColorPickerBox
              backgroundColor={customColorMap[slice]}
              onClick={() => {
                setColorPickerSlice((prev) => (prev === slice ? "" : slice));
              }}
            />
          </MultiPcdColorPickerContainer>
        );
      })}
    </animated.div>
  );
};
