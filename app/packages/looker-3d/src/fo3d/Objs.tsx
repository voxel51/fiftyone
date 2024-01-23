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

const ObjMesh = ({ objUrl, mtlUrl }: { objUrl: string; mtlUrl: string }) => {
  // todo: if materials don't load, we should still load the mesh
  const materials = useLoader(MTLLoader, mtlUrl);

  const mesh = useLoader(OBJLoader, objUrl, (loader) => {
    materials.preload();
    loader.setMaterials(materials);
  });

  return <primitive object={mesh} />;
};

export const Objs = ({ objs, visibilityMap }: ObjsProps) => {
  const objMeshes = useMemo(() => {
    return objs
      .filter((obj) => visibilityMap[getIdentifierForAsset(obj)])
      .map((obj) => {
        const { objUrl, mtlUrl } = obj;
        return (
          <ObjErrorBoundary>
            <ObjMesh key={objUrl} objUrl={objUrl} mtlUrl={mtlUrl} />
          </ObjErrorBoundary>
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
