import { LoadingDots, useTheme } from "@fiftyone/components";
import {
  granularExpanded,
  lightningPaths,
  lightningUnlocked,
} from "@fiftyone/state";
import React from "react";
import { useRecoilValue, useRecoilValueLoadable } from "recoil";
import Arrow from "./Arrow";
import FilterItem from "./FilterItem";
import Lock from "./Lock";
import Tune from "./Tune";
import useFilterData from "./useFilterData";

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
  const unlocked = useRecoilValueLoadable(lightningUnlocked);
  const granularOpen = useRecoilValue(granularExpanded(path));
  const theme = useTheme();

  const granular = removed.length;
  return (
    <>
      {data.map((props) => (
        <FilterItem key={props.path} {...events} {...props} />
      ))}
      {granular > 0 && (
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: theme.text.secondary, marginLeft: 3 }}>
            fine tune
          </span>
          <div
            style={{
              display: "flex",
              justifyContent: "right",
              alignItems: "center",
            }}
          >
            <Tune />
            {unlocked.state === "loading" && (
              <LoadingDots style={{ width: 21, textAlign: "center" }} />
            )}
            {unlocked.state === "hasValue" && unlocked.contents && (
              <Arrow
                expanded={granularExpanded(path)}
                id={`sidebar-granular-${path}`}
                color={theme.text.secondary}
              />
            )}
            {unlocked.state === "hasValue" && !unlocked.contents && <Lock />}
          </div>
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
