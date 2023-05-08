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
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import { Box3, Camera, Object3D, PerspectiveCamera, Vector3 } from "three";
import { toEulerFromDegreesArray } from "../utils";
import { CAMERA_POSITION_KEY, Environment } from "./Environment";
import {
  Looker3dPluginSettings,
  defaultPluginSettings,
} from "./Looker3dPlugin";
import {
  ChooseColorSpace,
  Screenshot,
  SetPointSizeButton,
  SetViewButton,
  SliceSelector,
  ViewHelp,
  ViewJSON,
} from "./action-bar";
import { ToggleGridHelper } from "./action-bar/ToggleGridHelper";
import { ActionBarContainer, ActionsBar, Container } from "./containers";
import { useHotkey, usePathFilter } from "./hooks";
import {
  Cuboid,
  CuboidProps,
  OverlayLabel,
  PolyLineProps,
  Polyline,
  load3dOverlays,
} from "./overlays";
import { PointCloudMesh } from "./renderables";
import {
  currentActionAtom,
  currentPointSizeAtom,
  customColorMapAtom,
  isGridOnAtom,
  isPointSizeAttenuatedAtom,
  shadeByAtom,
} from "./state";

type View = "pov" | "top";

const MODAL_TRUE = true;
const DEFAULT_GREEN = "#00ff00";

export const Looker3d = () => {
  const settings = fop.usePluginSettings<Looker3dPluginSettings>(
    "3d",
    defaultPluginSettings
  );
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const dataset = useRecoilValue(fos.dataset);
  const pathFilter = usePathFilter();
  const labelAlpha = useRecoilValue(fos.alpha(MODAL_TRUE));
  const onSelectLabel = fos.useOnSelectLabel();
  const cameraRef = React.useRef<Camera>();
  const controlsRef = React.useRef();
  const getColor = useRecoilValue(fos.colorMap(true));
  const [pointCloudBounds, setPointCloudBounds] = React.useState<Box3>();
  const { coloring } = useRecoilValue(
    fos.lookerOptions({ withFilter: true, modal: MODAL_TRUE })
  );
  const [activePcdSlices, setActivePcdSlices] = useRecoilState(
    fos.activePcdSlices
  );
  const allPcdSlices = useRecoilValue(fos.allPcdSlices);
  const defaultPcdSlice = useRecoilValue(fos.defaultPcdSlice);

  useEffect(() => {
    if (
      (!activePcdSlices || activePcdSlices.length === 0) &&
      defaultPcdSlice?.length > 0
    ) {
      setActivePcdSlices([defaultPcdSlice]);
    }
  }, [activePcdSlices, setActivePcdSlices, defaultPcdSlice]);

  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const sampleMap = useRecoilValue(fos.activePcdSliceToSampleMap);

  // const sampleMapJson = useMemo(() => {
  //   r
  // }, [sampleMap])

  useEffect(() => {
    Object3D.DefaultUp = new Vector3(...settings.defaultUp).normalize();
  }, [settings]);

  const handleSelect = useCallback(
    (label: OverlayLabel) => {
      onSelectLabel({
        detail: {
          id: label._id,
          field: label.path[label.path.length - 1],
          sampleId: label.sampleId,
        },
      });
    },
    [onSelectLabel]
  );

  const shadeBy = useRecoilValue(shadeByAtom);
  const [customColorMap, setCustomColorMap] =
    useRecoilState(customColorMapAtom);
  const pointSize = useRecoilValue(currentPointSizeAtom);
  const isPointSizeAttenuated = useRecoilValue(isPointSizeAttenuatedAtom);
  const isPointcloudDataset = useRecoilValue(fos.isPointcloudDataset);

  const topCameraPosition = useMemo(() => {
    if (!pointCloudBounds) {
      return [1, 1, 20];
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
  }, [pointCloudBounds, settings]);

  const defaultCameraPosition = useMemo(() => {
    const lastSavedCameraPosition =
      window?.localStorage.getItem(CAMERA_POSITION_KEY);

    if (lastSavedCameraPosition?.length > 0) {
      return JSON.parse(lastSavedCameraPosition);
    }

    if (settings.defaultCameraPosition) {
      return [
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z,
      ];
    } else {
      return topCameraPosition;
    }
  }, [topCameraPosition, settings]);

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
              topCameraPosition[0],
              topCameraPosition[1],
              topCameraPosition[2]
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
    [topCameraPosition]
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
  const setAction = useSetRecoilState(currentActionAtom);

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

    cameraRef.current.position.set(
      defaultCameraPosition[0],
      defaultCameraPosition[1],
      defaultCameraPosition[2]
    );
  }, [defaultCameraPosition]);

  useEffect(() => {
    if (isPointcloudDataset) {
      setCustomColorMap((prev) => {
        if (Object.hasOwn(prev, "default")) {
          return prev;
        }
        return { ...(prev ?? {}), default: DEFAULT_GREEN };
      });
    } else {
      const newCustomColorMap = {};
      for (const slice of allPcdSlices) {
        newCustomColorMap[slice] = DEFAULT_GREEN;
      }
      setCustomColorMap((prev) => ({ ...newCustomColorMap, ...(prev ?? {}) }));
    }
  }, [isPointcloudDataset, allPcdSlices, setCustomColorMap]);

  const hasMultiplePcdSlices = useMemo(
    () =>
      dataset.groupMediaTypes.filter((g) => g.mediaType === "point_cloud")
        .length > 1,
    [dataset]
  );

  const theme = useTheme();

  const isGridOn = useRecoilValue(isGridOnAtom);

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

        const customColor =
          (customColorMap &&
            customColorMap[isPointcloudDataset ? "default" : slice]) ??
          "#00ff00";

        return (
          <PointCloudMesh
            key={slice}
            minZ={minZ}
            shadeBy={shadeBy}
            customColor={customColor}
            pointSize={pointSize}
            src={mediaUrl}
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
      shadeBy,
      pointSize,
      pcRotation,
      minZ,
      theme,
      isPointSizeAttenuated,
      pointCloudBounds,
      customColorMap,
      isPointcloudDataset,
    ]
  );

  const overlays = useMemo(
    () =>
      load3dOverlays(sampleMap, selectedLabels)
        .map((l) => {
          const path = l.path.join(".");
          let color: string;
          switch (coloring.by) {
            case "field":
              color = getColor(path);
              break;
            case "instance":
              color = getColor(l._id);
              break;
            default:
              color = getColor(l.label);
              break;
          }
          return { ...l, color, id: l._id };
        })
        .filter((l) => pathFilter(l.path.join("."), l)),
    [coloring, getColor, pathFilter, sampleMap, selectedLabels]
  );

  const [cuboidOverlays, polylineOverlays] = useMemo(() => {
    const newCuboidOverlays = [];
    const newPolylineOverlays = [];

    for (const overlay of overlays) {
      if (overlay._cls === "Detection") {
        newCuboidOverlays.push(
          <Cuboid
            key={`cuboid-${overlay.id ?? overlay._id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            itemRotation={itemRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as CuboidProps)}
            onClick={() => handleSelect(overlay)}
            label={overlay}
            tooltip={tooltip}
            useLegacyCoordinates={settings.useLegacyCoordinates}
          />
        );
      } else if (
        overlay._cls === "Polyline" &&
        (overlay as unknown as PolyLineProps).points3d
      ) {
        newPolylineOverlays.push(
          <Polyline
            key={`polyline-${overlay._id ?? overlay.id}-${overlay.sampleId}`}
            rotation={overlayRotation}
            opacity={labelAlpha}
            {...(overlay as unknown as PolyLineProps)}
            label={overlay}
            onClick={() => handleSelect(overlay)}
            tooltip={tooltip}
          />
        );
      }
    }
    return [newCuboidOverlays, newPolylineOverlays];
  }, [
    overlays,
    itemRotation,
    labelAlpha,
    overlayRotation,
    handleSelect,
    tooltip,
    settings,
  ]);

  return (
    <ErrorBoundary>
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
          <mesh rotation={overlayRotation}>{cuboidOverlays}</mesh>
          {polylineOverlays}
          {filteredSamples}
        </Canvas>
        {(hoveringRef.current || hovering) && (
          <ActionBarContainer
            onMouseEnter={() => (hoveringRef.current = true)}
            onMouseLeave={() => (hoveringRef.current = false)}
          >
            {hasMultiplePcdSlices && <SliceSelector />}
            <ActionsBar>
              <ToggleGridHelper />
              <SetPointSizeButton />
              <ChooseColorSpace />
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
              <ViewJSON jsonPanel={jsonPanel} sample={sampleMap} />
              <ViewHelp helpPanel={helpPanel} />
            </ActionsBar>
          </ActionBarContainer>
        )}
      </Container>
    </ErrorBoundary>
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
