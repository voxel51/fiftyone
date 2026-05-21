import { TileSettingsContent, useSetTileSelection } from "@fiftyone/tiling";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import React from "react";
import { usePlayhead } from "../../../lib/playback/use-playback-state";
import { useStream } from "../../../lib/playback/use-stream";
import SceneSettings from "./SceneSettings";
import styles from "./SceneTile.module.css";

interface ScenePose {
  position?: [number, number, number];
  rotation?: number;
}

export interface SceneTileProps {
  streamId: string;
}

const SceneTile: React.FC<SceneTileProps> = ({ streamId }) => {
  return (
    <div className={styles.body}>
      <TileSettingsContent>
        <SceneSettings />
      </TileSettingsContent>
      <Canvas
        camera={{ position: [4, 3, 4], fov: 50 }}
        style={{ background: "#0f1115" }}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1.2} />
        <PathReference />
        <FloorGrid />
        <AnimatedBox streamId={streamId} />
        <OrbitControls enablePan={false} />
      </Canvas>
    </div>
  );
};

const ORBIT_RADIUS = 2;
const ORBIT_HEIGHT_AMPLITUDE = 0.6;
const ORBIT_PERIOD_SECONDS = 6;

function pathPoint(t: number): [number, number, number] {
  const u = (t % ORBIT_PERIOD_SECONDS) / ORBIT_PERIOD_SECONDS;
  const angle = u * Math.PI * 2;
  const x = Math.cos(angle) * ORBIT_RADIUS;
  const z = Math.sin(angle) * ORBIT_RADIUS;
  const y = Math.sin(angle * 2) * ORBIT_HEIGHT_AMPLITUDE;
  return [x, y, z];
}

const AnimatedBox: React.FC<{ streamId: string }> = ({ streamId }) => {
  const t = usePlayhead();
  const pose = useStream<ScenePose>(streamId);
  const [x, y, z] = pose?.position ?? pathPoint(t);
  const setSelection = useSetTileSelection();
  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    setSelection({
      kind: "scene-object",
      sourceId: streamId,
      position: [x, y, z],
      rotation: pose?.rotation ?? null,
      timestampSec: t,
    });
  };
  return (
    <mesh position={[x, y, z]} onClick={handleClick}>
      <boxGeometry args={[0.5, 0.5, 0.5]} />
      <meshStandardMaterial color="#ff6d04" />
    </mesh>
  );
};

const PathReference: React.FC = () => {
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
