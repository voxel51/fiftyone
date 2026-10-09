import * as fos from "@fiftyone/state";
import { COLOR_BY } from "@fiftyone/utilities";
import { cssVar } from "@voxel51/voodo";
import { type ReverbState, useReverbValue } from "@fiftyone/reverb";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { isInKeypointsField } from "../state";
import useIncompleteResults from "../use-incomplete-results";
import useLabelAttributeIcon from "../use-label-attribute-icon";
import useQueryPerformanceIcon from "../use-query-performance-icon";
import Checkboxes from "./Checkboxes";
import Search from "./Search";
import useOnSelect from "./useOnSelect";
import type { ResultsAtom } from "./useSelected";
import useSelected from "./useSelected";

const StringFilterContainer = styled.div`
  background: ${cssVar.color.bg.background};
  border: 1px solid ${cssVar.color.border.default};
  border-radius: 2px;
  color: ${cssVar.color.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  position: relative;
`;

const NamedStringFilterContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedStringFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  text-overflow: ellipsis;
  align-items: center;
`;

interface Props {
  color: string;
  excludeAtom: ReverbState<boolean>; // toggles select or exclude
  isMatchingAtom: ReverbState<boolean>; // toggles match or filter
  modal: boolean;
  path: string;
  named?: boolean;
  resultsAtom: ResultsAtom;
  selectedAtom: ReverbState<(string | null)[]>;
}

const useName = (path: string) => {
  let name = path.split(".").slice(-1)[0];
  name = path.startsWith("tags")
    ? "sample tag"
    : path.startsWith("_label_tags")
      ? "label tag"
      : path.startsWith("_temporal_tags")
        ? "temporal tag"
        : name;

  return name;
};

const StringFilter = ({
  color,
  excludeAtom,
  isMatchingAtom,
  modal,
  named = true,
  path,
  resultsAtom,
  selectedAtom,
}: Props) => {
  const name = useName(path);
  const schemeColor = fos.useValueColor(path);
  const coloringBy = useReverbValue(fos.colorScheme).colorBy;
  // Coloring by field leaves the dot on the color the entry passed down: an
  // entry colors every row under it the same, and a nested path can resolve to
  // a different field color than its own entry does.
  const valueColor = coloringBy === COLOR_BY.VALUE ? schemeColor : undefined;
  const isFilterMode = useReverbValue(fos.isSidebarFilterMode);
  const field = useReverbValue(fos.field(path));
  const { results, showSearch, searchable } = useSelected(
    modal,
    path,
    resultsAtom,
  );
  const onSelect = useOnSelect(modal, path, selectedAtom);
  const skeleton =
    useReverbValue(isInKeypointsField(path)) && name === "points";
  const footer = useIncompleteResults(path);
  const icon = useQueryPerformanceIcon(modal, named, path, color);
  const attributeIcon = useLabelAttributeIcon(modal, named, path, color);
  const queryPerformance = useReverbValue(fos.queryPerformance);
  if (named && (!queryPerformance || modal) && !results?.count) {
    return null;
  }

  return (
    <NamedStringFilterContainer
      data-cy={`categorical-filter-${path}`}
      onClick={(e) => e.stopPropagation()}
    >
      {named && field && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <NamedStringFilterHeader>
              <span ref={hoverTarget}>{label}</span>
              <span style={{ alignItems: "center", display: "flex" }}>
                {icon}
                {attributeIcon}
              </span>
            </NamedStringFilterHeader>
          )}
        />
      )}
      <StringFilterContainer onMouseDown={(event) => event.stopPropagation()}>
        {showSearch && !skeleton && (
          <Search
            footer={footer}
            modal={modal}
            onSelect={onSelect}
            path={path}
            placeholder={`+ ${
              isFilterMode ? "filter" : "set visibility"
            } by ${name}`}
            searchable={searchable}
          />
        )}
        <Checkboxes
          color={color}
          resultColor={valueColor}
          excludeAtom={excludeAtom}
          modal={modal}
          isMatchingAtom={isMatchingAtom}
          path={path}
          results={results?.results || null}
          selectedAtom={selectedAtom}
          skeleton={skeleton}
        />
      </StringFilterContainer>
    </NamedStringFilterContainer>
  );
};

export default StringFilter;
