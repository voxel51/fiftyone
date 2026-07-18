import { useThree } from "@react-three/fiber";
import { SparkRenderer } from "@sparkjsdev/spark";
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
import { SPARK_MAX_STANDARD_DEVIATIONS } from "./constants";

const SparkRendererRegistrationContext = createContext<
  ((requiresCovariance: boolean) => () => void) | null
>(null);

/**
 * Adds Spark's renderer object to the active Three scene.
 */
export const SparkRendererRoot = ({
  requiresCovariance,
}: {
  requiresCovariance: boolean;
}) => {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const [sparkRenderer, setSparkRenderer] = useState<SparkRenderer | null>(
    null,
  );

  // This layout effect allocates Spark only after React commits this root and
  // disposes the exact instance from that committed lifecycle.
  useLayoutEffect(() => {
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
    setSparkRenderer(renderer);

    return () => {
      renderer.dispose();
      renderer.geometry.dispose();
      renderer.material.dispose();
    };
  }, [gl, invalidate, requiresCovariance]);

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
      {registrationCounts.consumers > 0 && (
        <SparkRendererRoot
          requiresCovariance={registrationCounts.covarianceConsumers > 0}
        />
      )}
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
