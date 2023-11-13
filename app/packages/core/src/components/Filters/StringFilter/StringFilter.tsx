import { LoadingDots, Selector, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React, { useRef } from "react";
import { RecoilState, useRecoilValue, useRecoilValueLoadable } from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { isInKeypointsField } from "../state";
import { CHECKBOX_LIMIT } from "../utils";
import ResultComponent from "./ResultComponent";
import Wrapper from "./Results";
import useOnSelect from "./useOnSelect";

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
`;

interface Props {
  selectedValuesAtom: RecoilState<(string | null)[]>;
  excludeAtom: RecoilState<boolean>; // toggles select or exclude
  isMatchingAtom: RecoilState<boolean>; // toggles match or filter
  resultsAtom: ResultsAtom;
  modal: boolean;
  path: string;
  named?: boolean;
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

function useResults(modal: boolean, path: string, resultsAtom: ResultsAtom) {
  const lightning = useRecoilValue(fos.isLightningPath(path));
  const resultsLoadable = useRecoilValueLoadable(resultsAtom);
  const field = useRecoilValue(fos.field(path));
  const objectId = Boolean(field?.ftype.includes("ObjectIdField"));
  if (resultsLoadable.state === "hasError") throw resultsLoadable.contents;

  const data =
    resultsLoadable.state === "hasValue" ? resultsLoadable.contents : null;
  // id fields should always use filter mode
  const neverShowExpansion = objectId;
  const showSelector =
    lightning ||
    neverShowExpansion ||
    !data?.results ||
    data?.results.length > CHECKBOX_LIMIT;

  const useSearch = getUseSearch({ modal, path });

  return {
    data,
    lightning,
    loading: resultsLoadable.state === "loading",
    showSelector,
    results: resultsLoadable.contents,
    useSearch: lightning && objectId ? undefined : useSearch,
  };
}

const StringFilter = ({
  resultsAtom,
  selectedValuesAtom,
  excludeAtom,
  isMatchingAtom,
  path,
  modal,
  named = true,
}: Props) => {
  const name = useName(path);
  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const selectedCounts = useRef(new Map<V["value"], number | null>());
  const selectVisibility = useRef(new Map<V["value"], number | null>());
  const field = useRecoilValue(fos.field(path));
  const { showSelector, data, lightning, loading, useSearch } = useResults(
    modal,
    path,
    resultsAtom
  );
  const onSelect = useOnSelect(
    modal,
    path,
    selectedValuesAtom,
    isFilterMode ? selectedCounts : selectVisibility
  );

  const skeleton =
    useRecoilValue(isInKeypointsField(path)) && name === "keypoints";
  const theme = useTheme();
  const color = useRecoilValue(fos.pathColor(path));

  if (named && !loading && !lightning) {
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
            </NamedStringFilterHeader>
          )}
        />
      )}
      <StringFilterContainer onMouseDown={(event) => event.stopPropagation()}>
        {loading ? (
          <LoadingDots text="Loading" />
        ) : (
          <>
            {showSelector && !skeleton && (
              <Selector
                useSearch={useSearch}
                placeholder={`+ ${
                  isFilterMode ? "filter" : "set visibility"
                } by ${name}`}
                component={ResultComponent}
                onSelect={onSelect}
                inputStyle={{
                  color: theme.text.secondary,
                  fontSize: "1rem",
                  width: "100%",
                }}
                containerStyle={{ borderBottomColor: color, zIndex: 1000 }}
                toKey={(value) => String(value)}
                id={path}
              />
            )}
            <Wrapper
              path={path}
              results={data?.results || []}
              selectedValuesAtom={selectedValuesAtom}
              excludeAtom={excludeAtom}
              isMatchingAtom={isMatchingAtom}
              modal={modal}
              selectedCounts={selectedCounts}
              lightning={lightning}
            />
          </>
        )}
      </StringFilterContainer>
    </NamedStringFilterContainer>
  );
};

export default StringFilter;
