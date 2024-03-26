import { useCursor } from "@react-three/drei";
import { useCallback, useState } from "react";
import { useSetRecoilState } from "recoil";
import { FoSceneNode } from "../hooks";
import { activeNodeAtom, isStatusBarOnAtom } from "../state";

// note: raycaster in point cloud (Points.raycast()) is exceptionally slow and causes significant performance issues, so we disable it
// todo: use a custom raycaster to improve performance
export const AssetWrapper = ({
  children,
  node,
}: {
  children: React.ReactNode;
  node: FoSceneNode;
}) => {
  // const isPointCloud = useMemo(() => node.asset instanceof PcdAsset, [node]);

  return <>{children}</>;

  // disable the following until further work

  // if (!isPointCloud) {
  //   return (
  //     <ClickableWrapper node={node}>
  //       <CursorWrapper node={node}>{children}</CursorWrapper>
  //     </ClickableWrapper>
  //   );
  // }
};

const CursorWrapper = ({
  children,
  node,
}: {
  children: React.ReactNode;
  node: FoSceneNode;
}) => {
  const [hovered, setHovered] = useState(false);

  useCursor(hovered);

  return (
    <group
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      {children}
    </group>
  );
};

const ClickableWrapper = ({
  children,
  node,
}: {
  children: React.ReactNode;
  node: FoSceneNode;
}) => {
  const setActiveNode = useSetRecoilState(activeNodeAtom);
  const setShowStatus = useSetRecoilState(isStatusBarOnAtom);

  const clickHandler = useCallback(() => {
    setActiveNode(node);
    setShowStatus(false);
  }, [node]);

  return <group onClick={clickHandler}>{children}</group>;
};
