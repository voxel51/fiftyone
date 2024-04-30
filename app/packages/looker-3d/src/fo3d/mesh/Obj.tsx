import { getSampleSrc } from "@fiftyone/state";
import { useLoader } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { Mesh, MeshStandardMaterial, Quaternion, Vector3 } from "three";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { ObjAsset } from "../../hooks";
import { useMeshMaterialControls } from "../../hooks/use-mesh-material-controls";
import { getColorFromPoolBasedOnHash } from "../../utils";
import { useFo3dContext } from "../context";
import { getBasePathForTextures, getResolvedUrlForFo3dAsset } from "../utils";

const ObjMeshDefaultMaterial = ({
  name,
  obj,
  onLoad,
}: {
  name: string;
  obj: ObjAsset;
  onLoad?: () => void;
}) => {
  const { objPath } = obj;

  const { fo3dRoot } = useFo3dContext();

  const objUrl = useMemo(
    () => getSampleSrc(getResolvedUrlForFo3dAsset(objPath, fo3dRoot)),
    [objPath, fo3dRoot]
  );

  const mesh = useLoader(OBJLoader, objUrl);

  const { material } = useMeshMaterialControls(name, obj.defaultMaterial);

  useEffect(() => {
    if (!mesh) {
      return;
    }

    mesh.traverse((child) => {
      if (child instanceof Mesh) {
        try {
          child.material = material;
        } catch {
          child.material = new MeshStandardMaterial({
            color: getColorFromPoolBasedOnHash(objUrl),
          });
        }
      }
    });

    onLoad?.();
  }, [mesh, objUrl, material, onLoad]);

  return <primitive object={mesh} />;
};

const ObjMeshWithCustomMaterial = ({
  obj,
  onLoad,
}: {
  name: string;
  obj: ObjAsset;
  onLoad?: () => void;
}) => {
  const { objPath, mtlPath } = obj;

  const { fo3dRoot } = useFo3dContext();

  const objUrl = useMemo(
    () => getSampleSrc(getResolvedUrlForFo3dAsset(objPath, fo3dRoot)),
    [objPath, fo3dRoot]
  );

  const mtlUrl = useMemo(
    () => getSampleSrc(getResolvedUrlForFo3dAsset(mtlPath, fo3dRoot)),
    [mtlPath, fo3dRoot]
  );

  const resourcePath = useMemo(
    () => (mtlUrl ? getBasePathForTextures(fo3dRoot, mtlUrl) : null),
    [fo3dRoot, mtlUrl]
  );

  const materials = useLoader(MTLLoader, mtlUrl, (loader) => {
    if (resourcePath) {
      loader.setResourcePath(resourcePath);
    }
  });
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
  name,
  obj,
  position,
  quaternion,
  scale,
  children,
}: {
  name: string;
  obj: ObjAsset;
  position: Vector3;
  quaternion: Quaternion;
  scale: Vector3;
  children?: React.ReactNode;
}) => {
  return (
    <group position={position} quaternion={quaternion} scale={scale}>
      {obj.mtlPath ? (
        <ObjMeshWithCustomMaterial name={name} obj={obj} />
      ) : (
        <ObjMeshDefaultMaterial name={name} obj={obj} />
      )}
      {children ?? null}
    </group>
  );
};
