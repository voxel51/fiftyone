import { IconButton } from "@fiftyone/components";
import CloseIcon from "@mui/icons-material/Close";
import { Typography } from "@mui/material";
import { useCreateStore } from "leva";
import { useSetRecoilState } from "recoil";
import { FoSceneNode } from "../../hooks";
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
  const setActiveNode = useSetRecoilState(activeNodeAtom);

  const levaStore = useCreateStore();

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
