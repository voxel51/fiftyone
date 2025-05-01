import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { FlipToBack } from "@mui/icons-material";
import React, { useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import Loading from "../../../Actions/Loading";
import type { ActionProps } from "../../../Actions/types";
import { ActionDiv, getStringAndNumberProps } from "../../../Actions/utils";
import Patches, { patchesFields } from "./Patches";

export default ({ adaptiveMenuItemProps }: ActionProps) => {
  const [open, setOpen] = useState(false);
  const loading = useRecoilValue(fos.patching);
  const isVideo = useRecoilValue(fos.isVideoDataset);
  const ref = useRef<HTMLDivElement>(null);
  fos.useOutsideClick(ref, () => open && setOpen(false));
  const fields = useRecoilValue(patchesFields);

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        icon={loading ? <Loading /> : <FlipToBack />}
        open={open}
        onClick={() => !loading && setOpen(!open)}
        highlight={open || Boolean(fields.length)}
        title={isVideo ? "Clips" : "Patches"}
        style={{ cursor: loading ? "default" : "pointer" }}
        data-cy="action-clips-patches"
      />
      {open && <Patches close={() => setOpen(false)} anchorRef={ref} />}
    </ActionDiv>
  );
};
