import { useThree } from "@react-three/fiber";
import type { SparkRenderer } from "@sparkjsdev/spark";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { Box3 } from "three";
import { FO_USER_DATA } from "../../constants";
import { useFo3dContext } from "../context";
import { SPARK_MAX_STANDARD_DEVIATIONS } from "./constants";
import { loadSpark } from "./load-spark";
import {
  type Fo3dSplatSettings,
  getSplatLodScale,
  getSplatSortRadial,
} from "./settings";

const SparkRendererRegistrationContext = createContext<
  ((requiresCovariance: boolean) => () => void) | null
>(null);

/**
 * Adds Spark's renderer object to the active Three scene.
 */
export const SparkRendererRoot = ({
  requiresCovariance,
  settings,
}: {
  requiresCovariance: boolean;
  settings: Fo3dSplatSettings;
}) => {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const [rendererState, setRendererState] = useState<{
    gl: typeof gl;
    invalidate: typeof invalidate;
    renderer: SparkRenderer;
    requiresCovariance: boolean;
  } | null>(null);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const sparkRenderer =
    rendererState?.gl === gl &&
    rendererState.invalidate === invalidate &&
    rendererState.requiresCovariance === requiresCovariance
      ? rendererState.renderer
      : null;

  // Spark stays outside the base viewer bundle. This layout effect loads and
  // allocates it only after a splat consumer commits, then disposes the exact
  // instance from that committed lifecycle.
  useLayoutEffect(() => {
    let cancelled = false;
    let activeRenderer: SparkRenderer | null = null;

    loadSpark()
      .then(({ SparkRenderer }) => {
        if (cancelled) {
          return;
        }

        const renderer = new SparkRenderer({
          renderer: gl,
          onDirty: invalidate,
          maxStdDev: SPARK_MAX_STANDARD_DEVIATIONS,
          accumExtSplats: requiresCovariance,
          covSplats: requiresCovariance,
        });

        // SparkRenderer is a fullscreen draw mesh rather than scene content.
        // Keep its internal quad out of FO3D camera-fit and navigation bounds.
        renderer.geometry.boundingBox = new Box3();
        renderer.userData[FO_USER_DATA.IS_HELPER] = true;
        activeRenderer = renderer;
        setRendererState({
          gl,
          invalidate,
          renderer,
          requiresCovariance,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error : new Error(String(error)),
          );
        }
      });

    return () => {
      cancelled = true;
      activeRenderer?.dispose();
      activeRenderer?.geometry.dispose();
      activeRenderer?.material.dispose();
    };
  }, [gl, invalidate, requiresCovariance]);

  // This layout effect updates mutable Spark preferences in place, preserving
  // the renderer, sorter, and LoD workers.
  useLayoutEffect(() => {
    if (!sparkRenderer) {
      return;
    }

    sparkRenderer.lodSplatScale = getSplatLodScale(settings.detail);
    sparkRenderer.focalAdjustment = settings.sharpness;
    sparkRenderer.sortRadial = getSplatSortRadial(settings.sorting);
    sparkRenderer.setDirty();
    invalidate();
  }, [
    invalidate,
    settings.detail,
    settings.sharpness,
    settings.sorting,
    sparkRenderer,
  ]);

  if (loadError) {
    throw loadError;
  }

  return sparkRenderer ? <primitive object={sparkRenderer} /> : null;
};

/**
 * Mounts one Spark renderer for the active Three scene while splat consumers
 * are present.
 */
export const SparkRendererProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const { splatSettings } = useFo3dContext();
  const [registrationCounts, setRegistrationCounts] = useState({
    consumers: 0,
    covarianceConsumers: 0,
  });
  const register = useCallback((requiresCovariance: boolean) => {
    let registered = true;
    setRegistrationCounts((counts) => ({
      consumers: counts.consumers + 1,
      covarianceConsumers:
        counts.covarianceConsumers + (requiresCovariance ? 1 : 0),
    }));

    return () => {
      if (!registered) {
        return;
      }

      registered = false;
      setRegistrationCounts((counts) => ({
        consumers: Math.max(0, counts.consumers - 1),
        covarianceConsumers: Math.max(
          0,
          counts.covarianceConsumers - (requiresCovariance ? 1 : 0),
        ),
      }));
    };
  }, []);

  return (
    <SparkRendererRegistrationContext.Provider value={register}>
      {registrationCounts.consumers > 0 ? (
        <SparkRendererRoot
          requiresCovariance={registrationCounts.covarianceConsumers > 0}
          settings={splatSettings}
        />
      ) : null}
      {children}
    </SparkRendererRegistrationContext.Provider>
  );
};

/**
 * Registers a Gaussian splat with the Spark renderer for the active scene.
 */
export const useSparkRenderer = ({
  requiresCovariance = false,
}: {
  requiresCovariance?: boolean;
} = {}) => {
  const register = useContext(SparkRendererRegistrationContext);

  if (!register) {
    throw new Error("Gaussian splats must be rendered within a Spark provider");
  }

  // This effect keeps the shared Spark renderer alive for this consumer's
  // lifetime.
  useEffect(() => register(requiresCovariance), [register, requiresCovariance]);
};
