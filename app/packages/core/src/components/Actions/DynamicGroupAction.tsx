import { PillButton } from "@fiftyone/components";
import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import * as fos from "@fiftyone/state";
import MergeIcon from "@mui/icons-material/Merge";
import React, { useCallback, useMemo, useRef, useState } from "react";
import useMeasure from "react-use-measure";
import { useRecoilValue } from "recoil";
import { ActionDiv } from "./ActionsRow";
import DynamicGroup from "./DynamicGroup";

const DYNAMIC_GROUP_PILL_BUTTON_ID = "dynamic-group-pill-button";

export const DynamicGroupAction = () => {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [measureRef] = useMeasure();
  const ref = useRef();

  const pillComponent = useMemo(() => {
    if (isProcessing) {
      return <LoadingDots text="Loading groups" />;
    }
    return <MergeIcon />;
  }, [isProcessing]);

  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);

  const onCloseHandler = useCallback((e?: React.MouseEvent<Element>) => {
    const pillButtonElement = document.getElementById(
      DYNAMIC_GROUP_PILL_BUTTON_ID
    );
    if (
      e &&
      pillButtonElement &&
      pillButtonElement.contains(e.target as HTMLElement)
    ) {
      return;
    }
    setOpen(false);
  }, []);

  return (
    <ActionDiv ref={ref}>
      <PillButton
        id={DYNAMIC_GROUP_PILL_BUTTON_ID}
        icon={pillComponent}
        open={open}
        onClick={() => {
          setOpen((prev) => !prev);
        }}
        highlight={open || isDynamicGroupViewStageActive}
        title={"Create dynamic groups"}
        ref={measureRef}
        style={{
          cursor: "pointer",
        }}
        data-cy="action-create-dynamic-groups"
      />
      {open && (
        <DynamicGroup
          close={onCloseHandler}
          setIsProcessing={(value) => setIsProcessing(value)}
          isProcessing={isProcessing}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};
