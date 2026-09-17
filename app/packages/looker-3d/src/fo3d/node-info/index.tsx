import { useReverbValue } from "@fiftyone/reverb";
import { PcdAsset } from "../../hooks";
import { activeNodeAtom } from "../../state";
import { MeshNodeInfo } from "./MeshNodeInfo";
import { PcdNodeInfo } from "./PcdNodeInfo";

export const NodeInfo = () => {
  const activeNode = useReverbValue(activeNodeAtom);

  if (!activeNode) {
    return null;
  }

  if (activeNode.asset instanceof PcdAsset) {
    return <PcdNodeInfo node={activeNode} />;
  }
  return <MeshNodeInfo node={activeNode} />;
};
