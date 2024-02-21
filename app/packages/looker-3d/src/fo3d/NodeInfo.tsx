import { useRecoilValue } from "recoil";
import { activeNodeAtom } from "../state";

export const NodeInfo = () => {
  const activeNode = useRecoilValue(activeNodeAtom);

  if (!activeNode) {
    return null;
  }

  return (
    <div>
      <div>{activeNode.name}</div>
    </div>
  );
};
