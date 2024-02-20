import { Canvas } from "@react-three/fiber";
import { Perf } from "r3f-perf";
import { Vector3 } from "three";

export const Performance = () => {
  return (
    <Canvas
      onCreated={(state) => {
        state.scene.up = new Vector3(0, 1, 0);
      }}
    >
      <group up={[0, 1, 0]}>
        <Perf style={{ position: "absolute", top: "4em" }} />
      </group>
    </Canvas>
  );
};
