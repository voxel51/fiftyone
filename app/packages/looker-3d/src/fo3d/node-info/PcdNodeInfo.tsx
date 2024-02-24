import { FoSceneNode } from "../../hooks";
import { NodeInfoContainer } from "./node-info-containers";

interface PcdNodeInfoProps {
  node: FoSceneNode;
}

export const PcdNodeInfo = ({ node }: PcdNodeInfoProps) => {
  return <NodeInfoContainer>{node.name}</NodeInfoContainer>;
};
