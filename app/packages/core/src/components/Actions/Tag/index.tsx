import { PillButton } from "@fiftyone/components";
import type { Lookers } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { LocalOffer } from "@mui/icons-material";
import type { MutableRefObject } from "react";
import React, { useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import Loading from "../Loading";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import Tag from "./Tag";

export default ({
  modal,
  lookerRef,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
  lookerRef?: MutableRefObject<Lookers>;
}) => {
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const labels = useRecoilValue(fos.selectedLabelIds);
  const samples = useRecoilValue(fos.selectedSamples);
  const canTag = useRecoilValue(fos.canTagSamplesOrLabels);
  const disableTag = !canTag.enabled;

  const selected = labels.size > 0 || samples.size > 0;
  const tagging = useRecoilValue(fos.anyTagging);
  const ref = useRef<HTMLDivElement>(null);
  fos.useOutsideClick(ref, () => open && setOpen(false));
  const disabled = tagging || disableTag;

  lookerRef &&
    fos.useEventHandler(lookerRef.current, "play", () => {
      open && setOpen(false);
      setAvailable(false);
    });
  lookerRef &&
    fos.useEventHandler(lookerRef.current, "pause", () => setAvailable(true));

  const baseTitle = `Tag sample${modal ? "" : "s"} or labels`;

  const title = disabled
    ? (canTag.message || "").replace("#action", baseTitle.toLowerCase())
    : baseTitle;

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        tooltipPlacement={modal ? "bottom" : "top"}
        style={{
          cursor: disableTag
            ? "not-allowed"
            : disabled || !available
            ? "default"
            : "pointer",
        }}
        icon={tagging ? <Loading /> : <LocalOffer />}
        open={open}
        onClick={() => !disabled && available && !disableTag && setOpen(!open)}
        highlight={(selected || open) && available}
        title={title}
        data-cy="action-tag-sample-labels"
      />
      {open && available && (
        <Tag
          modal={modal}
          close={() => setOpen(false)}
          lookerRef={lookerRef}
          anchorRef={ref}
        />
      )}
    </ActionDiv>
  );
};
