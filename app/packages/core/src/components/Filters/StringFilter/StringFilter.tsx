import { Selector, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import Bolt from "@mui/icons-material/Bolt";
import React from "react";
import type { RecoilState } from "recoil";
import { useRecoilValue } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { isInKeypointsField } from "../state";
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
}

const useName = (path: string) => {
  let name = path.split(".").slice(-1)[0];
  name = path.startsWith("tags")
    ? "sample tag"
    : path.startsWith("_label_tags")
    ? "label tag"
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
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const field = useRecoilValue(fos.field(path));
  const { results, showSearch, useSearch } = useSelected(
    modal,
    path,
    resultsAtom
  );
  const onSelect = useOnSelect(modal, path, selectedAtom);
  const skeleton =
    useRecoilValue(isInKeypointsField(path)) && name === "points";
  const indexed = useRecoilValue(fos.pathHasIndexes(path));
  const theme = useTheme();
  const queryPerformance = useRecoilValue(fos.queryPerformance);
  const frameField = useRecoilValue(fos.isFrameField(path));
  if (named && (!queryPerformance || modal) && !results?.count) {
    return null;
  }

  const showQueryPerformanceIcon =
    named && queryPerformance && indexed && !modal && !frameField;

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
              {showQueryPerformanceIcon && (
                <Bolt fontSize={"small"} sx={{ color: theme.action.active }} />
              )}
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
            noResults={"Too many results"}
            containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
            toKey={(value) => String(value.value)}
            id={path}
          />
        )}
        <Checkboxes
          color={color}
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
