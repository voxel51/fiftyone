import { useLoader } from "@react-three/fiber";
import React, { useMemo } from "react";
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader";
import { PcdReturnType } from "../hooks";
import { getIdentifierForAsset, getVisibilityMapFromFo3dParsed } from "./utils";

type PcdsProps = {
  pcds: PcdReturnType[];
  visibilityMap: ReturnType<typeof getVisibilityMapFromFo3dParsed>;
};

const PcdMesh = ({ pcdUrl }: { pcdUrl: string }) => {
  const points = useLoader(PCDLoader, pcdUrl);

  return <primitive object={points} />;
};

export const Pcds = ({ pcds, visibilityMap }: PcdsProps) => {
  const pcdMeshes = useMemo(() => {
    return pcds
      .filter((pcd) => visibilityMap[getIdentifierForAsset(pcd)])
      .map((pcd) => {
        const { pcdUrl } = pcd;
        return (
          <PcdErrorBoundary>
            <PcdMesh key={pcdUrl} pcdUrl={pcdUrl} />
          </PcdErrorBoundary>
        );
      });
  }, [pcds, visibilityMap]);

  return <group>{pcdMeshes}</group>;
};

// create error boundary for individual mesh
class PcdErrorBoundary extends React.Component {
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
