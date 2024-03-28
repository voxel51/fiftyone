import { useRecoilValue } from "recoil";
import { PcdAsset } from "../../hooks";
import { activeNodeAtom } from "../../state";
import { MeshNodeInfo } from "./MeshNodeInfo";
import { PcdNodeInfo } from "./PcdNodeInfo";

export const NodeInfo = () => {
  const activeNode = useRecoilValue(activeNodeAtom);

  if (!activeNode) {
    return null;
  }

  if (activeNode.asset instanceof PcdAsset) {
    return <PcdNodeInfo node={activeNode} />;
  }
  return <MeshNodeInfo node={activeNode} />;
};
