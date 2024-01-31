import { usePluginSettings } from "@fiftyone/plugins";
import * as fos from "@fiftyone/state";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Leva, useControls } from "leva";
import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRecoilValue, useSetRecoilState } from "recoil";
import { Box3, Vector3 } from "three";
import {
  Looker3dPluginSettings,
  defaultPluginSettings,
} from "../Looker3dPlugin";
import { SpinningCube } from "../SpinningCube";
import { StatusBar, StatusTunnel } from "../StatusBar";
import {
  ACTION_GRID,
  ACTION_SET_TOP_VIEW,
  ACTION_VIEW_HELP,
  ACTION_VIEW_JSON,
  DEFAULT_CAMERA_POSITION,
  VOXEL51_COMPLEMENTARY_COLOR,
  VOXEL51_THEME_COLOR,
  VOXEL51_THEME_COLOR_MUTED,
} from "../constants";
import { LevaContainer, StatusBarRootContainer } from "../containers";
import { useFo3d } from "../hooks";
import { ThreeDLabels } from "../labels";
import { actionRenderListAtomFamily } from "../state";
import { Fo3dEnvironment } from "./Environment";
import { Objs } from "./Objs";
import { Pcds } from "./Pcds";
import { Plys } from "./Plys";
import { Stls } from "./Stls";
import {
  getMediaUrlForFo3dSample,
  getVisibilityMapFromFo3dParsed,
} from "./utils";

const CANVAS_WRAPPER_ID = "sample3d-canvas-wrapper";

type MediaTypeFo3dComponentProps = {};

export const MediaTypeFo3dComponent = ({}: MediaTypeFo3dComponentProps) => {
  const sample = useRecoilValue(fos.fo3dSample);
  const mediaField = useRecoilValue(fos.selectedMediaField(true));

  const jsonPanel = fos.useJSONPanel();
  const helpPanel = fos.useHelpPanel();

  const settings = usePluginSettings<Looker3dPluginSettings>(
    "3d",
    defaultPluginSettings
  );

  const setActionBarItems = useSetRecoilState(
    actionRenderListAtomFamily("fo3d")
  );

  const onChangeView = useCallback((view: string) => {
    // set camera to top position
  }, []);

  useEffect(() => {
    setActionBarItems([
      [ACTION_GRID, []],
      [ACTION_SET_TOP_VIEW, [onChangeView]],
      [ACTION_VIEW_JSON, [jsonPanel, sample]],
      [ACTION_VIEW_HELP, [helpPanel]],
    ]);
  }, [onChangeView, jsonPanel, sample, helpPanel, setActionBarItems]);

  const mediaUrl = useMemo(
    () => getMediaUrlForFo3dSample(sample, mediaField),
    [mediaField, sample]
  );

  const { data: fo3dParsed, isLoading: isParsingFo3d } = useFo3d(mediaUrl);

  const assetsGroupRef = useRef<THREE.Group>();

  const cameraRef = useRef<THREE.PerspectiveCamera>();

  const [areObjsRendered, setAreObjsRendered] = useState(false);
  const [arePcdsRendered, setArePcdsRendered] = useState(false);
  const [arePlysRendered, setArePlysRendered] = useState(false);
  const [areStlsRendered, setAreStlsRendered] = useState(false);

  const allAssetsLoaded = useMemo(() => {
    const objsReady = fo3dParsed?.assets.objs.length === 0 || areObjsRendered;
    const pcdsReady = fo3dParsed?.assets.pcds.length === 0 || arePcdsRendered;
    const plysReady = fo3dParsed?.assets.plys.length === 0 || arePlysRendered;
    const stlsReady = fo3dParsed?.assets.stls.length === 0 || areStlsRendered;

    return objsReady && pcdsReady && plysReady && stlsReady;
  }, [areObjsRendered, arePcdsRendered, arePlysRendered, areStlsRendered]);

  const [sceneBoundingBox, setSceneBoundingBox] = useState<Box3>();

  const defaultCameraPositionComputed = useMemo(() => {
    /**
     * This is the order of precedence for the camera position:
     * 1. If the user has set a default camera position in the scene itself, use that
     * 2. If the user has set a default camera position in the plugin settings, use that
     * 3. Compute a default camera position based on the bounding box of the scene
     * 4. Use an arbitrary default camera position
     */

    if (isParsingFo3d) {
      return DEFAULT_CAMERA_POSITION();
    }

    const defaultCameraPosition = fo3dParsed.defaultCameraPosition;

    if (defaultCameraPosition) {
      return new Vector3(
        defaultCameraPosition.x,
        defaultCameraPosition.y,
        defaultCameraPosition.z
      );
    }

    if (settings.defaultCameraPosition) {
      return new Vector3(
        settings.defaultCameraPosition.x,
        settings.defaultCameraPosition.y,
        settings.defaultCameraPosition.z
      );
    }

    if (sceneBoundingBox && Math.abs(sceneBoundingBox.max.x) !== Infinity) {
      const center = sceneBoundingBox.getCenter(new Vector3());
      const size = sceneBoundingBox.getSize(new Vector3());

      return new Vector3(
        center.x,
        center.y + size.y / 2,
        center.z + Math.max(size.x, size.y, size.z) * 2.5
      );
    }

    return DEFAULT_CAMERA_POSITION();
  }, [settings, isParsingFo3d, fo3dParsed, sceneBoundingBox]);

  // todo: if the object is checked expand its children as well
  const defaultVisibilityMap = useMemo(
    () => getVisibilityMapFromFo3dParsed(fo3dParsed?.assets),
    [fo3dParsed]
  );

  const visibilityMap = useControls("Visibility", defaultVisibilityMap ?? {}, [
    defaultVisibilityMap,
  ]);

  if (isParsingFo3d) {
    return (
      <Canvas>
        <SpinningCube />
      </Canvas>
    );
  }

  return (
    <>
      <LevaContainer>
        <Leva
          theme={{
            colors: {
              accent1: VOXEL51_THEME_COLOR_MUTED,
              accent2: VOXEL51_THEME_COLOR,
              accent3: VOXEL51_COMPLEMENTARY_COLOR,
            },
          }}
          fill
          hideCopyButton
          flat
        />
      </LevaContainer>

      <Canvas id={CANVAS_WRAPPER_ID} shadows>
        <Suspense fallback={<SpinningCube />}>
          <PerspectiveCamera
            makeDefault
            position={defaultCameraPositionComputed}
            ref={cameraRef}
          />
          <OrbitControls />
          <Fo3dEnvironment
            allAssetsLoaded={allAssetsLoaded}
            assetsGroupRef={assetsGroupRef}
            sceneBoundingBox={sceneBoundingBox}
            setSceneBoundingBox={setSceneBoundingBox}
          />
          <group ref={assetsGroupRef} visible={Boolean(sceneBoundingBox)}>
            <Objs
              onLoad={() => setAreObjsRendered(true)}
              objs={fo3dParsed.assets.objs}
              visibilityMap={visibilityMap}
            />
            <Pcds
              onLoad={() => setArePcdsRendered(true)}
              pcds={fo3dParsed.assets.pcds}
              visibilityMap={visibilityMap}
            />
            <Plys
              onLoad={() => setArePlysRendered(true)}
              plys={fo3dParsed.assets.plys}
              visibilityMap={visibilityMap}
            />
            <Stls
              onLoad={() => setAreStlsRendered(true)}
              stls={fo3dParsed.assets.stls}
              visibilityMap={visibilityMap}
            />
          </group>
          <StatusTunnel.Out />
          <ThreeDLabels sampleMap={{ fo3d: sample }} />
        </Suspense>
      </Canvas>
      <StatusBarRootContainer>
        <StatusBar cameraRef={cameraRef} />
      </StatusBarRootContainer>
    </>
  );
};
