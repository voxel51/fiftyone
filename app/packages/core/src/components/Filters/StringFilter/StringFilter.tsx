import { Selector, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { COLOR_BY } from "@fiftyone/utilities";
import React from "react";
import type { RecoilState } from "recoil";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { isInKeypointsField } from "../state";
import useIncompleteResults from "../use-incomplete-results";
import useLabelAttributeIcon from "../use-label-attribute-icon";
import useQueryPerformanceIcon from "../use-query-performance-icon";
import useQueryPerformanceTimeout from "../use-query-performance-timeout";
import Checkboxes from "./Checkboxes";
import ResultComponent from "./Result";
import useOnSelect from "./useOnSelect";
import type { ResultsAtom } from "./useSelected";
import useSelected from "./useSelected";

const StringFilterContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
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
  excludeAtom: RecoilState<boolean>; // toggles select or exclude
  isMatchingAtom: RecoilState<boolean>; // toggles match or filter
  modal: boolean;
  path: string;
  named?: boolean;
  resultsAtom: ResultsAtom;
  selectedAtom: RecoilState<(string | null)[]>;
  /**
   * Overrides the per-value color of the checkbox dot for fields whose values
   * are colored by something other than the color scheme's rules for `path`
   * (temporal tags, which are always colored by their name). Left unset, the
   * dot follows the color scheme: the field's color when coloring by field,
   * the value's own color when coloring by value.
   */
  resultColor?: (value: string | null) => string;
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
  resultColor,
}: Props) => {
  const name = useName(path);
  const schemeColor = fos.useValueColor(path);
  const coloringBy = useRecoilValue(fos.colorScheme).colorBy;
  // Coloring by field leaves the dot on the color the entry passed down: an
  // entry colors every row under it the same, and a nested path can resolve to
  // a different field color than its own entry does.
  const valueColor =
    resultColor ?? (coloringBy === COLOR_BY.VALUE ? schemeColor : undefined);
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const field = useRecoilValue(fos.field(path));
  const { results, showSearch, useSearch } = useSelected(
    modal,
    path,
    resultsAtom,
  );
  const onSelect = useOnSelect(modal, path, selectedAtom);
  const skeleton =
    useRecoilValue(isInKeypointsField(path)) && name === "points";
  const theme = useTheme();

  const footer = useIncompleteResults(path);
  const icon = useQueryPerformanceIcon(modal, named, path, color);
  const attributeIcon = useLabelAttributeIcon(modal, named, path, color);
  const queryPerformance = useRecoilValue(fos.queryPerformance);
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
          <Selector
            useSearch={useSearch}
            placeholder={`+ ${
              isFilterMode ? "filter" : "set visibility"
            } by ${name}`}
            cy={`sidebar-search-${path}`}
            component={ResultComponent}
            onSelect={onSelect}
            inputStyle={{
              color: theme.text.secondary,
              fontSize: "1rem",
              width: "100%",
            }}
            footer={footer}
            containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
            toKey={(value) => String(value.value)}
            id={path}
            DuringSuspense={withQueryPerformanceTimeout(modal, path)}
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

const withQueryPerformanceTimeout = (modal: boolean, path: string) => {
  return ({ children }: React.PropsWithChildren) => {
    useQueryPerformanceTimeout(modal, path);
    return <>{children}</>;
  };
};

export default StringFilter;
