import { InfoIcon } from "@fiftyone/components";
import { useLoader } from "@react-three/fiber";
import { folder, useControls } from "leva";
import { OnChangeHandler } from "leva/dist/declarations/src/types";
import { useCallback, useMemo, useState } from "react";
import { useRecoilState } from "recoil";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import {
  PANEL_ORDER_PCD_CONTROLS,
  PCD_SHADING_GRADIENTS,
  SHADE_BY_CUSTOM,
  SHADE_BY_HEIGHT,
  SHADE_BY_INTENSITY,
  SHADE_BY_NONE,
  SHADE_BY_RGB,
} from "../constants";
import { PcdAsset } from "../hooks";
import {
  CustomColorShader,
  RgbShader,
  ShadeByHeight,
  ShadeByIntensity,
} from "../renderables/pcd/shaders";
import {
  currentPointSizeAtom,
  customColorMapAtom,
  isPointSizeAttenuatedAtom,
  shadeByAtom,
} from "../state";
import { booleanButton } from "./leva-plugins/boolean-button";

const usePcdControls = (name: string) => {
  const [shadeBy, setShadeBy] = useRecoilState(shadeByAtom);
  // todo: might not be a good idea to keep this in local storage without a well-defined eviction strategy
  const [customColorMap, setCustomColorMap] =
    useRecoilState(customColorMapAtom);
  const [pointSize, setPointSize] = useRecoilState(currentPointSizeAtom);
  const [isPointSizeAttenuated, setIsPointSizeAttenuated] = useRecoilState(
    isPointSizeAttenuatedAtom
  );

  const pointSizeNum = useMemo(() => Number(pointSize), [pointSize]);

  const onChangeTextBox: OnChangeHandler = useCallback(
    (newValue: number, _props, options) => {
      if (options.initial) return;

      setPointSize(String(newValue));
    },
    []
  );

  const [testState, setTestState] = useState(false);

  useControls(
    () => ({
      ["Pointcloud Settings"]: folder(
        {
          test: booleanButton({
            checked: testState,
            onCheckboxChange: (v) => {
              setTestState(!v);
            },
            onClick: (v) => {
              alert("hi" + JSON.stringify(v));
            },
            icon: <InfoIcon />,
          }),
          pointSize: {
            value: pointSizeNum,
            min: 0.1,
            max: 20,
            step: 0.1,
            onChange: onChangeTextBox,
            label: "Points Size",
            order: -2,
          },
          shadeBy: {
            value: shadeBy,
            options: [
              SHADE_BY_NONE,
              SHADE_BY_HEIGHT,
              SHADE_BY_INTENSITY,
              SHADE_BY_RGB,
              SHADE_BY_CUSTOM,
            ],
            label: "Shade By",
            onChange: setShadeBy,
            order: -1,
          },
          [`${name} color`]: {
            value: customColorMap[name] || "#ffffff",
            label: `${name} color`,
            onChange: (newColor: string) => {
              setCustomColorMap((prev) => {
                if (!prev) return { [name]: newColor };
                return { ...prev, [name]: newColor };
              });
            },
            render: () => {
              if (shadeBy === SHADE_BY_CUSTOM) return true;
              return false;
            },
          },
          isPointSizeAttenuated: {
            value: isPointSizeAttenuated,
            onChange: setIsPointSizeAttenuated,
            label: "Attenuated",
            order: 1000,
          },
        },
        {
          order: PANEL_ORDER_PCD_CONTROLS,
          collapsed: true,
        }
      ),
    }),
    [pointSizeNum, shadeBy, testState, onChangeTextBox]
  );

  return {
    shadeBy,
    customColorMap,
    pointSize: pointSizeNum,
    isPointSizeAttenuated,
  };
};

export const Pcd = ({
  name,
  pcd,
  position,
  quaternion,
  scale,
}: {
  name: string;
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const points = useLoader(PCDLoader, pcd.pcdUrl);
  const { customColorMap, pointSize, isPointSizeAttenuated, shadeBy } =
    usePcdControls(name);

  const pointsMaterial = useMemo(() => {
    const pointSizeNum = Number(pointSize);

    // to trigger rerender
    const key = `${name}-${pointSizeNum}-${isPointSizeAttenuated}-${shadeBy}-${customColorMap[name]}`;

    switch (shadeBy) {
      case SHADE_BY_HEIGHT:
        return (
          <ShadeByHeight
            gradients={PCD_SHADING_GRADIENTS}
            // todo
            min={0}
            // todo
            max={1000}
            key={key}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_INTENSITY:
        return (
          <ShadeByIntensity
            // {...colorMinMax}
            gradients={PCD_SHADING_GRADIENTS}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_RGB:
        return (
          <RgbShader
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );

      case SHADE_BY_CUSTOM:
        return (
          <CustomColorShader
            key={key}
            pointSize={pointSizeNum}
            isPointSizeAttenuated={isPointSizeAttenuated}
            color={customColorMap[name] || "#ffffff"}
          />
        );
      default:
        return (
          <pointsMaterial
            color={"white"}
            // color={defaultShadingColor}
            // 1000 and 2 are arbitrary values that seem to work well
            size={
              isPointSizeAttenuated ? pointSizeNum / 1000 : pointSizeNum / 2
            }
            sizeAttenuation={isPointSizeAttenuated}
          />
        );
    }
  }, [shadeBy, pointSize, isPointSizeAttenuated, customColorMap]);

  return (
    <>
      <primitive
        object={points}
        position={position}
        quaternion={quaternion}
        scale={scale}
      >
        {pointsMaterial}
      </primitive>
    </>
  );
};
