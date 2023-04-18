import { Loading, useTheme } from "@fiftyone/components";
import * as fop from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { OrbitControlsProps as OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as recoil from "recoil";
import { useRecoilValue } from "recoil";
import { Box3, Camera, Object3D, PerspectiveCamera, Vector3 } from "three";
import { toEulerFromDegreesArray } from "../utils";
import { Environment } from "./Environment";
import {
  Looker3dPluginSettings,
  defaultPluginSettings,
} from "./Looker3dPlugin";
import {
  Screenshot,
  SetPointSizeButton,
  SetViewButton,
  SliceSelector,
  ViewHelp,
} from "./action-bar";
import { ToggleGridHelper } from "./action-bar/ToggleGridHelper";
import { ActionBarContainer, ActionsBar, Container } from "./containers";
import { useHotkey, usePathFilter } from "./hooks";
import { PointCloudMesh } from "./renderables";
import {
  currentActionAtom,
  currentPointSizeAtom,
  isGridOnAtom,
  isPointSizeAttenuatedAtom,
  shadeByAtom,
} from "./state";

type View = "pov" | "top";

export type Looker3dProps = {
  api: {
    dataset: fos.State.Dataset;
  };
};

export const Looker3d = (props: Looker3dProps) => {
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  if (!mediaField) {
    return <Loading>No value provided for &quot;{mediaField}&quot;.</Loading>;
  }

  return (
    <ErrorBoundary>
      <Looker3dCore dataset={props.api.dataset} />
    </ErrorBoundary>
  );
};

const Looker3dCore = ({ dataset }: Looker3dProps["api"]) => {
  const settings = fop.usePluginSettings<Looker3dPluginSettings>(
    "3d",
    defaultPluginSettings
  );

  const modal = true;
  const selectedLabels = recoil.useRecoilValue(fos.selectedLabels);
  const pathFilter = usePathFilter();
  const labelAlpha = recoil.useRecoilValue(fos.alpha(modal));
  const onSelectLabel = fos.useOnSelectLabel();
  const cameraRef = React.useRef<Camera>();
  const controlsRef = React.useRef();
  const getColor = recoil.useRecoilValue(fos.colorMap(true));
  const [pointCloudBounds, setPointCloudBounds] = React.useState<Box3>();
  const { coloring } = recoil.useRecoilValue(
    fos.lookerOptions({ withFilter: true, modal })
  );
  const activePcdSlices = recoil.useRecoilValue(fos.activePcdSlices);
  const [sampleMap, setSampleMap] = recoil.useRecoilState(
    fos.activePcdSliceToSampleMap
  );
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const fetchSamples = recoil.useRecoilCallback(
    ({ snapshot }) =>
      async () => {
        const newSampleMap = {};

        for (const slice of activePcdSlices) {
          const sample = await snapshot.getPromise(
            fos.pcdSampleQueryFamily(slice)
          );
          newSampleMap[slice] = sample;
        }

        setSampleMap(newSampleMap);
      },
    [activePcdSlices, setSampleMap]
  );

  useEffect(() => {
    fetchSamples();
  }, [fetchSamples]);

  // const isRgbPresent = useMemo(
  //   () => Boolean(points.geometry.attributes?.color),
  //   [points]
  // );

  useEffect(() => {
    Object3D.DefaultUp = new Vector3(...settings.defaultUp).normalize();
  }, [settings]);

  // const handleSelect = useCallback(
  //   (label: OverlayLabel) => {
  //     onSelectLabel({
  //       detail: {
  //         id: label._id,
  //         field: label.path[label.path.length - 1],
  //         sampleId: sample._id,
  //       },
  //     });
  //   },
  //   [onSelectLabel, sample]
  // );

  const colorBy = recoil.useRecoilValue(shadeByAtom);
  const pointSize = recoil.useRecoilValue(currentPointSizeAtom);
  const isPointSizeAttenuated = recoil.useRecoilValue(
    isPointSizeAttenuatedAtom
  );

  const defaultCameraPosition = useMemo(() => {
    if (settings.defaultCameraPosition) {
      return [
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z,
      ];
    } else {
      if (!pointCloudBounds) {
        return [0, 0, 0];
      }

      const absMax = Math.max(
        pointCloudBounds.max?.x,
        pointCloudBounds.max?.y,
        pointCloudBounds.max?.z
      );

      const upVectorNormalized = new Vector3(...settings.defaultUp).normalize();

      // we want the camera to be along the up vector
      // the scaling factor determines by how much
      const scalingFactor = !isNaN(absMax) ? absMax * 2 : 20;
      const upVectorScaled = upVectorNormalized.multiplyScalar(scalingFactor);
      return [upVectorScaled.x, upVectorScaled.y, upVectorScaled.z];
    }
  }, [pointCloudBounds, settings]);

  const onChangeView = useCallback(
    (view: View) => {
      const camera = cameraRef.current as PerspectiveCamera;
      const controls = controlsRef.current as OrbitControls & {
        target: Vector3;
      };

      if (camera && controls) {
        controls.target as Vector3;
        const origCamPos = camera.position.clone();
        const origTarget = controls.target.clone();

        controls.target.set(0, 0, 0);

        switch (view) {
          case "top":
            camera.position.set(
              defaultCameraPosition[0],
              defaultCameraPosition[1],
              defaultCameraPosition[2]
            );
            break;
          case "pov":
            // todo: account for non-z up here
            camera.position.set(0, -10, 1);
            break;
        }

        camera.updateProjectionMatrix();
        return !(
          origTarget.equals(controls.target) &&
          origCamPos.distanceTo(camera.position) < 1
        );
      }
    },
    [cameraRef, controlsRef, defaultCameraPosition]
  );

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const pcRotationSetting = _.get(settings, "pointCloud.rotation", [0, 0, 0]);
  const minZ = _.get(settings, "pointCloud.minZ", null);

  const pcRotation = useMemo(
    () => toEulerFromDegreesArray(pcRotationSetting),
    [pcRotationSetting]
  );
  const [overlayRotation, itemRotation] = useMemo(
    () => [
      toEulerFromDegreesArray(_.get(settings, "overlay.rotation", [0, 0, 0])),
      toEulerFromDegreesArray(
        _.get(settings, "overlay.itemRotation", [0, 0, 0])
      ),
    ],
    [settings]
  );

  const [hovering, setHovering] = useState(false);
  const setAction = recoil.useSetRecoilState(currentActionAtom);

  const timeout = useRef<NodeJS.Timeout>(null);

  const clear = useCallback(() => {
    if (hoveringRef.current) return;
    timeout.current && clearTimeout(timeout.current);
    setHovering(false);
    setAction(null);
  }, [setAction]);

  const update = useCallback(() => {
    !hovering && setHovering(true);
    timeout.current && clearTimeout(timeout.current);
    timeout.current = setTimeout(clear, 3000);

    return () => {
      timeout.current && clearTimeout(timeout.current);
    };
  }, [clear, hovering]);

  const hoveringRef = useRef(false);
  const tooltip = fos.useTooltip();

  useHotkey("KeyT", () => onChangeView("top"));
  useHotkey("KeyE", () => onChangeView("pov"));
  useHotkey(
    "Escape",
    ({ get, set }) => {
      const panels = get(fos.lookerPanels);

      for (const panel of ["help", "json"]) {
        if (panels[panel].isOpen) {
          set(fos.lookerPanels, {
            ...panels,
            [panel]: { ...panels[panel], isOpen: false },
          });
          return;
        }
      }
      const hovered = get(fos.hoveredSample) as Sample;
      if (hovered && hovered._id !== sample._id) {
        return;
      }

      const selectedLabels = get(fos.selectedLabels);
      if (selectedLabels && Object.keys(selectedLabels).length > 0) {
        set(fos.selectedLabels, {});
        return;
      }

      const changed = onChangeView("top");
      if (changed) return;

      set(fos.modal, null);
    },
    [jsonPanel, helpPanel, selectedLabels, hovering]
  );

  useEffect(() => {
    const currentCameraPosition = cameraRef.current?.position;

    if (
      !currentCameraPosition ||
      (currentCameraPosition.x === defaultCameraPosition[0] &&
        currentCameraPosition.y === defaultCameraPosition[1] &&
        currentCameraPosition.z === defaultCameraPosition[2])
    ) {
      return;
    }

    onChangeView("top");
  }, [onChangeView, defaultCameraPosition]);

  const hasMultiplePcdSlices = useMemo(
    () =>
      dataset.groupMediaTypes.filter((g) => g.mediaType === "point_cloud")
        .length > 1,
    [dataset]
  );

  const theme = useTheme();

  const isGridOn = recoil.useRecoilValue(isGridOnAtom);

  const filteredSamples = useMemo(
    () =>
      Object.entries(sampleMap).map(([slice, sample]) => {
        let mediaUrl;

        if (Array.isArray(sample.urls)) {
          mediaUrl = fos.getSampleSrc(
            sample.urls.find((u) => u.field === mediaField).url
          );
        } else {
          mediaUrl = fos.getSampleSrc(sample.urls[mediaField]);
        }

        return (
          <PointCloudMesh
            key={slice}
            minZ={minZ}
            shadeBy={colorBy}
            pointSize={pointSize}
            src={fos.getSampleSrc(mediaUrl)}
            rotation={pcRotation}
            onLoad={(boundingBox) => {
              if (!pointCloudBounds) setPointCloudBounds(boundingBox);
            }}
            defaultShadingColor={theme.text.primary}
            isPointSizeAttenuated={isPointSizeAttenuated}
          />
        );
      }),
    [
      sampleMap,
      mediaField,
      colorBy,
      pointSize,
      pcRotation,
      minZ,
      theme,
      isPointSizeAttenuated,
    ]
  );

  // const overlays = useMemo(
  //   () =>
  //     load3dOverlays(samples, selectedLabels)
  //       .map((l) => {
  //         const path = l.path.join(".");
  //         let color: string;
  //         switch (coloring.by) {
  //           case "field":
  //             color = getColor(path);
  //             break;
  //           case "instance":
  //             color = getColor(l._id);
  //             break;
  //           default:
  //             color = getColor(l.label);
  //             break;
  //         }
  //         return { ...l, color, id: l._id };
  //       })
  //       .filter((l) => pathFilter(l.path.join("."), l)),
  //   [coloring, getColor, pathFilter, samples, selectedLabels]
  // );

  return (
    <Container onMouseOver={update} onMouseMove={update} onMouseLeave={clear}>
      <Canvas onClick={() => setAction(null)} data-cy="looker3d">
        <Screenshot />
        <Environment
          controlsRef={controlsRef}
          cameraRef={cameraRef}
          settings={settings}
          isGridOn={isGridOn}
          bounds={pointCloudBounds}
        />
        <mesh rotation={overlayRotation}>
          {/* {overlays
            .filter((o) => o._cls === "Detection")
            .map((label, key) => (
              <Cuboid
                key={`cuboid-${key}`}
                itemRotation={itemRotation}
                opacity={labelAlpha}
                {...(label as unknown as CuboidProps)}
                onClick={() => handleSelect(label)}
                label={label}
                tooltip={tooltip}
                useLegacyCoordinates={settings.useLegacyCoordinates}
              />
            ))} */}
        </mesh>
        {/* {overlays
          .filter(
            (o) =>
              o._cls === "Polyline" && (o as unknown as PolyLineProps).points3d
          )
          .map((label, key) => (
            <Polyline
              key={`polyline-${key}`}
              rotation={overlayRotation}
              opacity={labelAlpha}
              {...(label as unknown as PolyLineProps)}
              label={label}
              // onClick={() => handleSelect(label)}
              tooltip={tooltip}
            />
          ))} */}

        {filteredSamples}
      </Canvas>
      {/* {(hoveringRef.current || hovering) && ( */}
      {true && (
        <ActionBarContainer
          onMouseEnter={() => (hoveringRef.current = true)}
          // onMouseLeave={() => (hoveringRef.current = false)}
        >
          {hasMultiplePcdSlices && <SliceSelector />}
          <ActionsBar>
            <ToggleGridHelper />
            <SetPointSizeButton />
            {/* <ChooseColorSpace isRgbPresent={isRgbPresent} /> */}
            <SetViewButton
              onChangeView={onChangeView}
              view={"top"}
              label={"T"}
              hint="Top View"
            />
            <SetViewButton
              onChangeView={onChangeView}
              view={"pov"}
              label={"E"}
              hint="Ego View"
            />
            {/* <ViewJSON jsonPanel={jsonPanel} sample={sample} /> */}
            <ViewHelp helpPanel={helpPanel} />
          </ActionsBar>
        </ActionBarContainer>
      )}
    </Container>
  );
};

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };

  static getDerivedStateFromError = (error: Error) => ({
    hasError: true,
    error,
  });

  componentDidCatch(error: Error) {
    this.setState({ error });
  }

  render() {
    if (this.state.error) {
      return <Loading>{this.state.error}</Loading>;
    }

    return this.props.children;
  }
}
