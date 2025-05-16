import { PillButton } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Check } from "@mui/icons-material";
import type { MutableRefObject } from "react";
import React, { useEffect, useRef, useState } from "react";
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
    title = `${text} | ${labels.size.toLocaleString()}`;
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
        (modal && lookerRef?.current ? (
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
