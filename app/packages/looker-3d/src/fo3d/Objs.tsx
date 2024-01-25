import { useLoader } from "@react-three/fiber";
import React, { useMemo } from "react";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { ObjReturnType } from "../hooks";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type ObjsProps = {
  objs: ObjReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
};

const ObjMesh = ({ obj }: { obj: ObjReturnType }) => {
  const { objUrl, mtlUrl, position, quaternion, scale } = obj;
  const materials = useLoader(MTLLoader, mtlUrl);

  const mesh = useLoader(OBJLoader, objUrl, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });

  return (
    <primitive
      object={mesh}
      position={position}
      quaternion={quaternion}
      scale={scale}
    />
  );
};

export const Objs = ({ objs, visibilityMap }: ObjsProps) => {
  const objMeshes = useMemo(() => {
    return objs
      .filter((obj) => visibilityMap[getIdentifierForAsset(obj)])
      .map((obj) => {
        return (
          <group key={obj.objUrl}>
            <ObjErrorBoundary>
              <ObjMesh obj={obj} />
            </ObjErrorBoundary>
          </group>
        );
      });
  }, [objs, visibilityMap]);

  return <group>{objMeshes}</group>;
};

// create error boundary for individual mesh
class ObjErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      // todo: add indicator in canvas that asset failed loading
      return null;
    }

    return this.props.children;
  }
}
