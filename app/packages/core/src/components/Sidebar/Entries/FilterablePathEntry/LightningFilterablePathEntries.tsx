import { useTheme } from "@fiftyone/components";
import {
  granularSidebarExpanded,
  lightningPaths,
  useLightingUnlocked,
} from "@fiftyone/state";
import React, { Suspense } from "react";
import { useRecoilValue } from "recoil";
import Container from "./Container";
import FilterItem from "./FilterItem";
import Loading from "./Loading";
import Tune from "./Tune";
import { hasMoreFilters } from "./state";
import useFilterData from "./useFilterData";

const IfEmpty = ({ path }: { path: string }) => {
  const more = useRecoilValue(hasMoreFilters(path));

  if (more) {
    return null;
  }

  return <Container>No results</Container>;
};

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
  const unlocked = useLightingUnlocked();
  const granularOpen = useRecoilValue(granularSidebarExpanded(path));
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
            see more...
          </span>
          <div
            style={{
              display: "flex",
              justifyContent: "right",
              alignItems: "center",
            }}
          >
            <Tune
              expanded={granularSidebarExpanded(path)}
              disabled={!unlocked}
              color={theme.text.secondary}
            />
          </div>
        </div>
      )}
      {unlocked && granularOpen && (
        <Suspense fallback={<Loading />}>
          {removed.map((props) => (
            <FilterItem key={props.path} {...events} {...props} />
          ))}
          <IfEmpty path={path} />
        </Suspense>
      )}
    </>
  );
};

export default LightningFilterablePathEntries;
