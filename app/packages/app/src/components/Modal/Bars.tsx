import { Bar, useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@material-ui/core";
import React, { useRef } from "react";
import { useRecoilValue } from "recoil";
import { ModalActionsRow } from "../Actions";

const SelectableBar: React.FC<
  React.PropsWithChildren<{ sampleId: string }>
> = ({ sampleId, children }) => {
  const headerRef = useRef<HTMLDivElement>(null);
  const theme = useTheme();
  const select = fos.useSelectSample();
  const selected = useRecoilValue(fos.selectedSamples).has(sampleId);

  return (
    <Bar
      ref={headerRef}
      onClick={(event) =>
        event.target === headerRef.current && select(sampleId)
      }
      style={{ cursor: "pointer" }}
    >
      <div>
        <Checkbox
          disableRipple
          title={selected ? "Select sample" : "Selected"}
          checked={selected}
          style={{ color: theme.brand }}
          onClick={() => select(sampleId)}
        />
      </div>
      {children}
    </Bar>
  );
};

export const SampleBar: React.FC<{
  sampleId: string;
  lookerRef: React.MutableRefObject<VideoLooker | undefined>;
  visible?: boolean;
}> = ({ lookerRef, sampleId, visible }) => {
  return visible ? (
    <SelectableBar sampleId={sampleId}>
      <ModalActionsRow lookerRef={lookerRef} />
    </SelectableBar>
  ) : null;
};

export const GroupBar: React.FC<{
  lookerRef: React.MutableRefObject<VideoLooker | undefined>;
}> = ({ lookerRef }) => {
  return (
    <Bar>
      <div>Group</div>
      <ModalActionsRow lookerRef={lookerRef} />
    </Bar>
  );
};

export const GroupSampleBar: React.FC<{
  pinned: boolean;
  sampleId: string;
}> = ({ pinned, sampleId }) => {
  return (
    <SelectableBar sampleId={sampleId}>
      <div>pinned</div>
    </SelectableBar>
  );
};
