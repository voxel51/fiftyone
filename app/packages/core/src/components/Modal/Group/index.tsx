import * as fos from "@fiftyone/state";
import { useRecoilValue } from "recoil";
import { DynamicGroup } from "./DynamicGroup";
import GroupSample3d from "./GroupSample3d";
import { GroupView } from "./GroupView";

const Group = () => {
  const dynamic = useRecoilValue(fos.isDynamicGroup);
  const only3d = useRecoilValue(fos.only3d);

  if (dynamic) {
    return <DynamicGroup />;
  }

  if (only3d) {
    return <GroupSample3d />;
  }

  return <GroupView />;
};

export default Group;
