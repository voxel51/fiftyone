import { PillButton } from "@fiftyone/components";
import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import * as fos from "@fiftyone/state";
import MergeIcon from "@mui/icons-material/Merge";
import React, { useMemo, useState } from "react";
import useMeasure from "react-use-measure";
import { useRecoilValue } from "recoil";
import { ActionDiv } from "./ActionsRow";
import DynamicGroup from "./DynamicGroup";

export const DynamicGroupAction = () => {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const [measureRef] = useMeasure();

  const pillComponent = useMemo(() => {
    if (isProcessing) {
      return <LoadingDots text="Loading groups" />;
    }
    return <MergeIcon />;
  }, [isProcessing]);

  const isDynamicGroupViewStageActive = useRecoilValue(fos.isDynamicGroup);

  return (
    <ActionDiv>
      <PillButton
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
      />
      {open && (
        <DynamicGroup
          close={() => setOpen(false)}
          setIsProcessing={(value) => setIsProcessing(value)}
          isProcessing={isProcessing}
        />
      )}
    </ActionDiv>
  );
};
