import { Selector, useTheme } from "@fiftyone/components";
import LoadingDots from "@fiftyone/components/src/components/Loading/LoadingDots";
import * as fos from "@fiftyone/state";
import { groupId, groupStatistics } from "@fiftyone/state";
import { VALID_KEYPOINTS, getFetchFunction } from "@fiftyone/utilities";
import { MutableRefObject, useEffect, useRef } from "react";
import {
  RecoilState,
  RecoilValue,
  atomFamily,
  selectorFamily,
  useRecoilCallback,
  useRecoilValue,
  useRecoilValueLoadable,
  useSetRecoilState,
} from "recoil";
import styled from "styled-components";
import FieldLabelAndInfo from "../../FieldLabelAndInfo";
import { labelTagsCount } from "../../Sidebar/Entries/EntryCounts";
import { CHECKBOX_LIMIT, nullSort } from "../utils";
import withSuspense from "../withSuspense";
import ResultComponent from "./ResultComponent";
import Wrapper from "./Wrapper";

const CategoricalFilterContainer = styled.div`
  background: ${({ theme }) => theme.background.level2};
  border: 1px solid var(--fo-palette-divider);
  border-radius: 2px;
  color: ${({ theme }) => theme.text.secondary};
  margin-top: 0.25rem;
  padding: 0.25rem 0.5rem;
  position: relative;
`;

const NamedCategoricalFilterContainer = styled.div`
  margin: 3px;
  font-weight: bold;
`;

const NamedCategoricalFilterHeader = styled.div`
  display: flex;
  justify-content: space-between;
  text-overflow: ellipsis;
`;

export type V = { value: string | number | null | boolean; count: number };

const categoricalSearch = atomFamily<string, { path: string; modal: boolean }>({
  key: "categoricalSearchResults",
  default: "",
});

const categoricalSearchResults = selectorFamily<
  {
    values: V[];
    count: number;
  },
  { path: string; modal: boolean }
>({
  key: "categoricalSearchResults",
  get:
    ({ path, modal }) =>
    async ({ get }) => {
      const search = get(categoricalSearch({ modal, path }));
      const sorting = get(fos.sortFilterResults(modal));
      const mixed = get(groupStatistics(modal)) === "group";
      const selected = get(fos.stringSelectedValuesAtom({ path, modal }));

      const noneCount = get(fos.noneCount({ path, modal, extended: false }));
      const isLabelTag = path.startsWith("_label_tags");
      let data: { values: V[]; count: number } = { values: [], count: null };

      if (isLabelTag) {
        const labels = get(labelTagsCount({ modal, extended: false }));
        data = {
          count: labels.count,
          values: labels.results.map(([value, count]) => ({ value, count })),
        };
      } else {
        data = await getFetchFunction()("POST", "/values", {
          dataset: get(fos.dataset).name,
          view: get(fos.view),
          path,
          search,
          selected,
          group_id: modal ? get(groupId) || null : null,
          mixed,
          slice: get(fos.groupSlice(false)),
          slices: mixed ? null : get(fos.currentSlices(modal)), // when mixed, slice is not needed
          sample_id:
            modal && !get(groupId) && !mixed ? get(fos.modalSampleId) : null,
          ...sorting,
        });
      }

      let { values, count } = data;
      if (noneCount > 0 && "None".includes(search)) {
        values = [...values, { value: null, count: noneCount }]
          .sort(nullSort(sorting))
          .slice(0, 25);
        count++;
      }

      return { count, values };
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

const getUseSearch = ({ modal, path }: { modal: boolean; path: string }) => {
  return (search: string) => {
    const { count, values } = useRecoilValue(
      categoricalSearchResults({ modal, path })
    );

    const setSearch = useSetRecoilState(categoricalSearch({ modal, path }));

    useEffect(() => {
      setSearch(search);
    }, [search]);

    return {
      values,
      total: count,
    };
  };
};

const useOnSelect = (
  selectedAtom: RecoilState<V["value"][]>,
  selectedCounts: MutableRefObject<Map<V["value"], number>>
) => {
  return useRecoilCallback(
    ({ snapshot, set }) =>
      async ({ value, count }: V) => {
        const selected = new Set(await snapshot.getPromise(selectedAtom));
        selectedCounts.current.set(value, count);
        selected.add(value);
        set(selectedAtom, [...selected].sort());
      },
    [selectedAtom, selectedCounts]
  );
};

export const isKeypointLabel = selectorFamily<boolean, string>({
  key: "isKeypointLabel",
  get:
    (path) =>
    ({ get }) => {
      const field = get(fos.field(path));

      if (!field) {
        const keys = path.split(".");
        let parent = keys[0];

        const f = get(fos.field(parent));
        if (!f && parent === "frames") {
          parent = `frames.${keys[1]}`;
        }

        const p = get(fos.field(parent))?.embeddedDocType;
        if (p && VALID_KEYPOINTS.includes(p)) {
          return true;
        }
      }

      return false;
    },
  cachePolicy_UNSTABLE: {
    eviction: "most-recent",
  },
});

interface Props<T extends V = V> {
  selectedValuesAtom: RecoilState<T["value"][]>;
  excludeAtom: RecoilState<boolean>; // toggles select or exclude
  isMatchingAtom: RecoilState<boolean>; // toggles match or filter
  countsAtom: RecoilValue<{
    count: number;
    results: [T["value"], number][];
  }>;
  modal: boolean;
  path: string;
  named?: boolean;
  color: string;
}

const CategoricalFilter = <T extends V = V>({
  countsAtom,
  selectedValuesAtom,
  excludeAtom,
  isMatchingAtom,
  path,
  modal,
  named = true,
  color,
}: Props<T>) => {
  let name = path.split(".").slice(-1)[0];
  name = path.startsWith("tags")
    ? "sample tag"
    : path.startsWith("_label_tags")
    ? "label tag"
    : name;

  const isFilterMode = useRecoilValue(fos.isSidebarFilterMode);
  const selectedCounts = useRef(new Map<V["value"], number>());
  const selectVisibility = useRef(new Map<V["value"], number>());
  const onSelect = useOnSelect(
    selectedValuesAtom,
    isFilterMode ? selectedCounts : selectVisibility
  );
  const useSearch = getUseSearch({ modal, path });
  const skeleton = useRecoilValue(isKeypointLabel(path));
  const theme = useTheme();
  const field = useRecoilValue(fos.field(path));
  const countsLoadable = useRecoilValueLoadable(countsAtom);

  // id fields should always use filter mode
  const neverShowExpansion = field?.ftype?.includes("ObjectIdField");
  if (countsLoadable.state === "hasError") throw countsLoadable.contents;
  if (countsLoadable.state !== "hasValue") return null;
  const { count, results } = countsLoadable.contents;

  if (named && !results) {
    return null;
  }

  return (
    <NamedCategoricalFilterContainer
      data-cy={`categorical-filter-${path}`}
      onClick={(e) => {
        e.stopPropagation();
      }}
    >
      {named && field && (
        <FieldLabelAndInfo
          nested
          field={field}
          color={color}
          template={({ label, hoverTarget }) => (
            <NamedCategoricalFilterHeader>
              <span ref={hoverTarget}>{label}</span>
            </NamedCategoricalFilterHeader>
          )}
        />
      )}
      <CategoricalFilterContainer
        onMouseDown={(event) => event.stopPropagation()}
      >
        {results === null && <LoadingDots text="" />}
        {results !== null &&
          (results.length > CHECKBOX_LIMIT || neverShowExpansion) &&
          !skeleton && (
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
              toKey={({ value }) => String(value)}
              id={path}
            />
          )}
        <Wrapper
          path={path}
          color={color}
          results={results}
          selectedValuesAtom={selectedValuesAtom}
          excludeAtom={excludeAtom}
          isMatchingAtom={isMatchingAtom}
          modal={modal}
          totalCount={count}
          selectedCounts={selectedCounts}
        />
      </CategoricalFilterContainer>
    </NamedCategoricalFilterContainer>
  );
};

export default withSuspense(CategoricalFilter);
