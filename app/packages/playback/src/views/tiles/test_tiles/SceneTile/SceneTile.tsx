import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useAtomValue } from "jotai";
import React from "react";
import { playheadAtom } from "../../../../lib/playback-atoms";
import { useTileSettings } from "../../../../lib/TilingProvider";
import SceneSettings from "./SceneSettings";
import styles from "./SceneTile.module.css";

/**
 * 3D scene tile body — a Three.js (via react-three-fiber) scene with a
 * box moving along a closed path. The box's position is a function of
 * the playback time, so playing/scrubbing animates the scene.
 */
const SceneTile: React.FC = () => {
  useTileSettings(SceneSettings);
  return (
    <div className={styles.body}>
    <Canvas
      camera={{ position: [4, 3, 4], fov: 50 }}
      style={{ background: "#0f1115" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <PathReference />
      <FloorGrid />
      <AnimatedBox />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
};

const ORBIT_RADIUS = 2;
const ORBIT_HEIGHT_AMPLITUDE = 0.6;
const ORBIT_PERIOD_SECONDS = 6;

/** Path parameter goes 0 → 1 over `ORBIT_PERIOD_SECONDS`. */
function pathPoint(t: number): [number, number, number] {
  const u = (t % ORBIT_PERIOD_SECONDS) / ORBIT_PERIOD_SECONDS;
  const angle = u * Math.PI * 2;
  const x = Math.cos(angle) * ORBIT_RADIUS;
  const z = Math.sin(angle) * ORBIT_RADIUS;
  const y = Math.sin(angle * 2) * ORBIT_HEIGHT_AMPLITUDE;
  return [x, y, z];
}

/**
 * The animated box. Reads `playheadAtom` and re-renders on every tick.
 * Position is a pure function of time — works the same when scrubbing
 * as when playing.
 */
const AnimatedBox: React.FC = () => {
  const t = useAtomValue(playheadAtom);
  const [x, y, z] = pathPoint(t);
  return (
    <mesh position={[x, y, z]}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#ff6d04" />
    </mesh>
  );
};

/** Renders the closed path as a thin loop so the box's trajectory is visible. */
const PathReference: React.FC = () => {
  // Sampled enough times to look smooth at the radius/amplitude we use.
  const samples = 96;
  const positions = React.useMemo(() => {
    const arr = new Float32Array(samples * 3);
    for (let i = 0; i < samples; i++) {
      const [x, y, z] = pathPoint((i / samples) * ORBIT_PERIOD_SECONDS);
      arr[i * 3] = x;
      arr[i * 3 + 1] = y;
      arr[i * 3 + 2] = z;
    }
    return arr;
  }, []);

  return (
    <lineLoop>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
          count={samples}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#4a9eff" transparent opacity={0.4} />
    </lineLoop>
  );
};

const FloorGrid: React.FC = () => (
  <gridHelper args={[8, 8, "#3b3f47", "#262a30"]} position={[0, -0.5, 0]} />
);

export default SceneTile;
