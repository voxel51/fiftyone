import { PillButton, Selector, useTheme } from "@fiftyone/components";
import {
  datasetSampleCount,
  lightning,
  lightningThreshold,
  useOutsideClick,
} from "@fiftyone/state";
import Bolt from "@mui/icons-material/Bolt";
import React, { RefObject, useRef, useState } from "react";
import { useRecoilState, useRecoilValue, useResetRecoilState } from "recoil";
import { LIGHTNING_MODE } from "../../utils/links";
import { Button } from "../utils";
import { ActionOption } from "./Common";
import Popout from "./Popout";
import { ActionDiv } from "./utils";

const LightningThreshold = ({
  anchorRef,
}: {
  anchorRef: RefObject<HTMLDivElement>;
}) => {
  const [threshold, setThreshold] = useRecoilState(lightningThreshold);
  const reset = useResetRecoilState(lightningThreshold);
  const count = useRecoilValue(datasetSampleCount);
  const theme = useTheme();

  return (
    <Popout modal={false} fixed anchorRef={anchorRef}>
      <ActionOption
        id="lightning-threshold"
        text="Lightning threshold"
        href={LIGHTNING_MODE}
        title={"More on lightning mode"}
        style={{
          background: "unset",
          color: theme.text.primary,
          paddingTop: 0,
          paddingBottom: 0,
        }}
        svgStyles={{ height: "1rem", marginTop: 7.5 }}
      />
      <Selector
        placeholder="Number of samples"
        onSelect={async (text) => {
          if (text === "") {
            reset();
            return "";
          }
          const value = parseInt(text);

          if (!isNaN(value)) {
            setThreshold(value);
            return text;
          }

          return "";
        }}
        inputStyle={{
          fontSize: "1rem",
          textAlign: "right",
          float: "right",
          width: "100%",
        }}
        key={threshold}
        value={threshold === null ? "" : String(threshold)}
        containerStyle={{ display: "flex", justifyContent: "right" }}
      />
      <Button
        style={{
          margin: "0.25rem -0.5rem",
          height: "2rem",
          borderRadius: 0,
          textAlign: "center",
        }}
        text={threshold === null ? "Enable" : "Disable"}
        onClick={() => (threshold === null ? setThreshold(count) : reset())}
      />
    </Popout>
  );
};

const Lightning = () => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClick(ref, () => open && setOpen(false));
  const enabled = useRecoilValue(lightning);

  return (
    <ActionDiv ref={ref}>
      <PillButton
        icon={<Bolt />}
        open={open}
        onClick={() => setOpen(!open)}
        highlight={open || enabled}
        title={"Lightning mode"}
        data-cy="action-lightning"
      />
      {open && <LightningThreshold anchorRef={ref} />}
    </ActionDiv>
  );
};

export default Lightning;
