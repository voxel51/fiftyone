import { Bar, useTheme } from "@fiftyone/components";
import { VideoLooker } from "@fiftyone/looker";
import {
  paginateGroup,
  paginateGroupPaginationFragment,
  paginateGroupQuery,
  paginateGroup_query$key,
} from "@fiftyone/relay";
import * as fos from "@fiftyone/state";
import { Checkbox } from "@material-ui/core";
import React, { Suspense, useRef } from "react";
import {
  PreloadedQuery,
  usePaginationFragment,
  usePreloadedQuery,
} from "react-relay";
import { useRecoilValue } from "recoil";
import { ModalActionsRow } from "../Actions";
import Pin from "./Pin";

const SelectableBar: React.FC<
  React.PropsWithChildren<{
    sampleId: string;
    style?: Omit<React.CSSProperties, "cursor">;
  }>
> = ({ sampleId, children, style = {} }) => {
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
      style={{ cursor: "pointer", ...style }}
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

const GroupCount: React.FC<{
  queryRef: PreloadedQuery<paginateGroupQuery>;
}> = ({ queryRef }) => {
  const data = usePreloadedQuery(paginateGroup, queryRef);

  const {
    data: { samples },
  } = usePaginationFragment(
    paginateGroupPaginationFragment,
    data as paginateGroup_query$key
  );

  return <>{samples.total}</>;
};

export const GroupBar: React.FC<{
  lookerRef: React.MutableRefObject<VideoLooker | undefined>;
  queryRef: PreloadedQuery<paginateGroupQuery>;
}> = ({ lookerRef, queryRef }) => {
  return (
    <Bar
      style={{
        position: "relative",
        backgroundImage: "none",
        background: "var(--background)",
        fontWeight: "bold",
      }}
    >
      <div>
        <Suspense>
          <GroupCount queryRef={queryRef} />
        </Suspense>
      </div>
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
      <div>{<Pin />}</div>
    </SelectableBar>
  );
};
