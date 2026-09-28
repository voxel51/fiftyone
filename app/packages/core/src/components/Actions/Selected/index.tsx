import { PillButton } from "@fiftyone/components";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { Check } from "@mui/icons-material";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import Grid from "./Grid";
import Modal from "./Modal";
import { useSelectionSummary } from "./hooks";

export default ({
  modal,
  lookerRef,
  adaptiveMenuItemProps,
}: ActionProps & {
  modal: boolean;
  lookerRef?: MutableRefObject<fos.Lookers | undefined>;
}) => {
  const { refresh } = adaptiveMenuItemProps || {};
  const [open, setOpen] = useState(false);
  const { sampleCount, labelCount, text } = useSelectionSummary();
  const ref = useRef<HTMLDivElement>(null);
  fos.useOutsideClick(ref, () => open && setOpen(false));

  // Which menu this offers depends on whether the surface paints labels at
  // all, not merely on being in the modal.
  //
  // The Modal variant's items are label actions ("Select visible labels",
  // "Hide selected labels", …) sourced from the painted overlays; the Grid
  // variant offers the sample actions ("Only show selected samples", …). The
  // test used to be `lookerRef?.current`, which video Explore fails because it
  // mounts no looker — but so do 3D samples, `ModalSampleRenderer`, and the
  // multimodal shell, and those want the sample actions they have always had.
  // A Lighter scene is the other way a surface paints labels, so ask for
  // either.
  const { scene } = useLighter();
  const paintsLabels = !!lookerRef?.current || !!scene;

  useEffect(() => {
    // Remeasure the toolbar item when either count changes its width.
    refresh?.();
  }, [text, refresh]);

  if (sampleCount < 1 && labelCount < 1 && !modal) {
    return null;
  }

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        icon={<Check />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open}
        text={text}
        title="Manage sample and label selection"
        aria-label={`Manage selection: ${text}`}
        arrow
        tooltipPlacement={modal ? "bottom" : "top"}
        data-cy="action-manage-selected"
      />
      {open &&
        (modal && paintsLabels ? (
          <Modal
            anchorRef={ref}
            close={() => setOpen(false)}
            lookerRef={lookerRef}
          />
        ) : (
          <Grid close={() => setOpen(false)} anchorRef={ref} />
        ))}
    </ActionDiv>
  );
};
