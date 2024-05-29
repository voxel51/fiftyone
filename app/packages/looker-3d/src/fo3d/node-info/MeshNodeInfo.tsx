import { FoSceneNode } from "../../hooks";
import { NodeInfoContainer } from "./node-info-containers";

interface MeshNodeInfoProps {
  node: FoSceneNode;
}

export const MeshNodeInfo = ({ node }: MeshNodeInfoProps) => {
  return <NodeInfoContainer>{node.name}</NodeInfoContainer>;
};
