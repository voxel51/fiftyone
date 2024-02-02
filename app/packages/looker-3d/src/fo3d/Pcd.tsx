import { useLoader } from "@react-three/fiber";
import { Quaternion, Vector3 } from "three";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { PcdAsset } from "../hooks";

export const Pcd = ({
  pcd,
  position,
  quaternion,
  scale,
}: {
  pcd: PcdAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  const points = useLoader(PCDLoader, pcd.pcdUrl);

  return (
    <primitive
      object={points}
      position={position}
      quaternion={quaternion}
      scale={scale}
    />
  );
};
