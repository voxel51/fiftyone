import { count, lightningPaths, lightningThreshold } from "@fiftyone/state";
import React from "react";
import { atomFamily, useRecoilValue, useRecoilValueLoadable } from "recoil";
import Arrow from "./Arrow";
import FilterItem from "./FilterItem";
import Lock from "./Lock";
import useFilterData from "./useFilterData";

const granularExpanded = atomFamily({
  key: "granularExpanded",
  default: false,
});

const LightningFilterablePathEntries = ({
  modal,
  path,
  ...events
}: {
  modal: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  path: string;
}) => {
  const paths = useRecoilValue(lightningPaths(path));
  const { data, removed } = useFilterData(modal, path, (path) =>
    paths.has(path)
  );
  const extended = useRecoilValueLoadable(
    count({ path: "", extended: true, modal: false })
  );
  const threshold = useRecoilValue(lightningThreshold);
  const unlocked =
    extended.state === "hasValue" && extended.contents < threshold;
  const granularOpen = useRecoilValue(granularExpanded(path));

  const granular = removed.length;

  return (
    <>
      {data.map((props) => (
        <FilterItem key={props.path} {...events} {...props} />
      ))}
      {granular > 0 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ margin: 3 }}>{granular} or less granular fields</div>
          {!unlocked ? (
            <Lock />
          ) : (
            <Arrow
              expanded={granularExpanded(path)}
              id={`sidebar-granular-${path}`}
            />
          )}
        </div>
      )}
      {unlocked &&
        granularOpen &&
        removed.map((props) => (
          <FilterItem key={props.path} {...events} {...props} />
        ))}
    </>
  );
};

export default LightningFilterablePathEntries;
