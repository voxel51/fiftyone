import { IconButton } from "@fiftyone/components";
import CloseIcon from "@mui/icons-material/Close";
import { Typography } from "@mui/material";
import { useSetReverbState } from "@fiftyone/reverb";
import type { FoSceneNode } from "../../hooks";
import { activeNodeAtom } from "../../state";
import {
  NodeInfoBody,
  NodeInfoContainer,
  NodeInfoHeader,
} from "./node-info-containers";

interface PcdNodeInfoProps {
  node: FoSceneNode;
}

export const PcdNodeInfo = ({ node }: PcdNodeInfoProps) => {
  const setActiveNode = useSetReverbState(activeNodeAtom);

  return (
    <NodeInfoContainer>
      <NodeInfoHeader>
        <Typography variant="h4">{node.name}</Typography>
        <IconButton onClick={() => setActiveNode(null)}>
          <CloseIcon />
        </IconButton>
      </NodeInfoHeader>
      <NodeInfoBody>
        <div></div>
      </NodeInfoBody>
    </NodeInfoContainer>
  );
};
