import { PillButton } from "@fiftyone/components";
import { useLighter } from "@fiftyone/lighter";
import * as fos from "@fiftyone/state";
import { Check } from "@mui/icons-material";
import type { MutableRefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { useRecoilValue } from "recoil";
import Loading from "../Loading";
import type { ActionProps } from "../types";
import { ActionDiv, getStringAndNumberProps } from "../utils";
import Grid from "./Grid";
import Modal from "./Modal";

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
  const [loading, setLoading] = useState(false);
  const samples = useRecoilValue(fos.selectedSamples);
  const labels = useRecoilValue(fos.selectedLabelIds);
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
    /** refresh **/
    samples.size;
    /** refresh **/

    refresh?.();
  }, [samples.size, refresh]);

  useEffect(() => {
    return () => {
      setLoading(false);
    };
  }, []);

  if (samples.size < 1 && labels.size < 1 && !modal) {
    return null;
  }

  let text: string | undefined = samples.size.toLocaleString();
  let title = "Manage selected";
  if (samples.size > 0 && labels.size > 0) {
    // use title to display count
    title = `${text} sample${
      samples.size > 1 ? "s" : ""
    } | ${labels.size.toLocaleString()} label${labels.size > 1 ? "s" : ""}`;
    text = undefined;
  } else if (labels.size > 0) {
    text = labels.size.toLocaleString();
  }

  return (
    <ActionDiv
      {...(getStringAndNumberProps(adaptiveMenuItemProps) || {})}
      ref={ref}
    >
      <PillButton
        icon={loading ? <Loading /> : <Check />}
        open={open}
        onClick={() => {
          if (loading) {
            return;
          }
          setOpen(!open);
        }}
        highlight={samples.size > 0 || open || (labels.size > 0 && modal)}
        text={text}
        title={title}
        tooltipPlacement={modal ? "bottom" : "top"}
        style={{
          cursor: loading ? "default" : "pointer",
        }}
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
          <Grid close={close} anchorRef={ref} />
        ))}
    </ActionDiv>
  );
};
