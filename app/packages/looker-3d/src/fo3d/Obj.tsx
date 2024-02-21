import { useLoader } from "@react-three/fiber";
import { useEffect } from "react";
import { Mesh, MeshLambertMaterial, Quaternion, Vector3 } from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { ObjAsset } from "../hooks";
import { getColorFromPoolBasedOnHash } from "../utils";
import { getThreeMaterialFromFo3dMaterial } from "./utils";

const ObjMeshDefaultMaterial = ({
  obj,
  onLoad,
}: {
  obj: ObjAsset;
  onLoad?: () => void;
}) => {
  const { objUrl, defaultMaterial } = obj;
  const mesh = useLoader(OBJLoader, objUrl);

  useEffect(() => {
    if (!mesh) {
      return;
    }

    mesh.traverse((child) => {
      if (child instanceof Mesh) {
        try {
          child.material = getThreeMaterialFromFo3dMaterial(defaultMaterial);
        } catch {
          child.material = new MeshLambertMaterial({
            color: getColorFromPoolBasedOnHash(objUrl),
          });
        }
      }
    });

    onLoad?.();
  }, [mesh, objUrl, onLoad]);

  return <primitive object={mesh} />;
};

const ObjMeshWithCustomMaterial = ({
  obj,
  onLoad,
}: {
  obj: ObjAsset;
  onLoad?: () => void;
}) => {
  const { objUrl, mtlUrl } = obj;

  const materials = useLoader(MTLLoader, mtlUrl);
  const mesh = useLoader(OBJLoader, objUrl, (loader) => {
    if (mtlUrl) {
      materials.preload();
      loader.setMaterials(materials);
    }
  });

  useEffect(() => {
    if (mesh) {
      onLoad?.();
    }
  }, [mesh, onLoad]);

  return <primitive object={mesh} />;
};

export const Obj = ({
  obj,
  position,
  quaternion,
  scale,
}: {
  name: string;
  obj: ObjAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
}) => {
  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      {obj.mtlUrl ? (
        <ObjMeshWithCustomMaterial obj={obj} />
      ) : (
        <ObjMeshDefaultMaterial obj={obj} />
      )}
    </group>
  );
};
