import { GridToolbar } from "@fiftyone/actions";
import * as fos from "@fiftyone/state";
import { isGroup as isGroupAtom } from "@fiftyone/state";
import { useReverbValue } from "@fiftyone/reverb";
import { ActionsFade, ActionsRow, RightContainer } from "./Containers";
import Display from "./Display";
import GridHeaderSampleRendererControls from "./GridHeaderSampleRendererControls";
import GroupSlice from "./GroupSlice";
import Sort from "./Sort";

const Header = () => {
  const isGroup = useReverbValue(isGroupAtom);
  const groupSlices = useReverbValue(fos.groupSlices);

  return (
    <>
      <ActionsFade />
      <ActionsRow data-cy={"fo-grid-actions"}>
        <GridToolbar />
        <RightContainer>
          <GridHeaderSampleRendererControls />
          {isGroup && groupSlices.length > 1 && <GroupSlice />}
          <Sort />
          <Display />
        </RightContainer>
      </ActionsRow>
    </>
  );
};

export default Header;
