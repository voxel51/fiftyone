import React, { useEffect, useMemo, useState } from "react";
import { filter, map, pick } from "lodash";
import {
  atom,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { usePreloadedQuery, useRefetchableFragment } from "react-relay";

import * as fos from "@fiftyone/state";
import { Selection } from "@fiftyone/components";

import ViewDialog, { viewDialogContent } from "./ViewDialog";
import {
  DatasetSavedViewsQuery,
  DatasetSavedViewsFragment,
} from "../../../Root/Root";
import { Box, LastOption, AddIcon, TextContainer } from "./styledComponents";

export const viewSearchTerm = atom<string>({
  key: "viewSearchTerm",
  default: "",
});
export const viewDialogOpen = atom<boolean>({
  key: "viewDialogOpen",
  default: false,
});

export type DatasetViewOption = Pick<
  fos.SavedView,
  "id" | "description" | "color" | "viewStages"
> & { label: string; slug: string };

const DEFAULT_SELECTED: DatasetViewOption = {
  id: "1",
  label: "Unsaved view",
  color: "#9e9e9e",
  description: "Unsaved view",
  slug: "unsaved-view",
  viewStages: [],
};

export interface DatasetView {
  id: string;
  name: string;
  datasetId: string;
  urlName: string;
  color: string | null;
  description: string | null;
  viewStages: readonly string[];
}

interface Props {
  datasetName: string;
  queryRef: any;
}

export default function ViewSelection(props: Props) {
  const { datasetName, queryRef } = props;

  const setIsOpen = useSetRecoilState<boolean>(viewDialogOpen);
  const [savedViewParam, setSavedViewParam] = fos.useQueryState("view");
  const setEditView = useSetRecoilState(viewDialogContent);
  const setView = fos.useSetView();
  const [viewSearch, setViewSearch] = useRecoilState<string>(viewSearchTerm);

  const fragments = usePreloadedQuery(DatasetSavedViewsQuery, queryRef);
  const [data, refetch] = useRefetchableFragment(
    DatasetSavedViewsFragment,
    fragments
  );

  const items =
    (data as { savedViews: [fos.State.SavedView] })?.savedViews || [];

  const viewOptions: DatasetViewOption[] = useMemo(
    () => [
      DEFAULT_SELECTED,
      ...map(items, ({ name, color, description, urlName, viewStages }) => ({
        id: urlName,
        label: name,
        color,
        description,
        slug: urlName,
        viewStages,
      })),
    ],
    [items]
  );

  const searchData: DatasetViewOption[] = useMemo(
    () =>
      filter(
        viewOptions,
        ({ id, label, description, slug }: DatasetViewOption) =>
          id === "1" ||
          label.toLowerCase().includes(viewSearch) ||
          description?.toLowerCase().includes(viewSearch) ||
          slug?.toLowerCase().includes(viewSearch)
      ) as DatasetViewOption[],
    [viewOptions, viewSearch]
  );

  const loadedView = useRecoilValue<fos.State.Stage[]>(fos.view);
  const isEmptyView = !loadedView?.length;
  const selectedView = viewOptions[0];
  const [selected, setSelected] = useState<DatasetViewOption>(selectedView);
  const [isExtendingSavedView, setIsExtendingSavedView] =
    useState<boolean>(false);

  useEffect(() => {
    if (savedViewParam) {
      const potentialView = viewOptions.filter(
        (v) => v.id === savedViewParam
      )?.[0];

      // detect unsaved when extending loaded view
      if (
        selected &&
        loadedView &&
        selected.viewStages?.length !== loadedView?.length &&
        selected.slug !== DEFAULT_SELECTED.slug
      ) {
        setSelected(viewOptions[0]);
        setSavedViewParam(null); // don't remove
        setIsExtendingSavedView(true); // don't remove
        return;
      }

      if (potentialView) {
        // stages were cleared using x button
        if (!loadedView?.length) {
          setSelected(viewOptions[0]);
          setView([], [], "", true, "");
        } else {
          // found a matching view
          setSelected(potentialView);
          setView([], [], potentialView.label, true, potentialView.slug);
        }
        setIsExtendingSavedView(false);
        return;
      }

      // no potential view found
      if (savedViewParam !== viewOptions[0].slug) {
        setSelected(viewOptions[0]);
        setView([], [], "", true, "");
      }
      setIsExtendingSavedView(false);
    } else {
      // if not adding stages to the currently loaded view, set back to all samples
      if (!isExtendingSavedView) {
        setSelected(viewOptions[0]);
        setView([], [], "", true, "");
      }
    }
  }, [loadedView, viewOptions, savedViewParam]);

  return (
    <Box>
      <ViewDialog
        savedViews={items}
        onEditSuccess={(savedView?: fos.State.SavedView, reload?: boolean) => {
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
          if (savedView && reload) {
            setView([], [], savedView?.name, true, savedView?.urlName);
          }
        }}
        onDeleteSuccess={() => {
          refetch({ name: datasetName }, { fetchPolicy: "store-and-network" });
          setView([], [], "", true, "");
        }}
      />
      <Selection
        selected={selected}
        setSelected={(item: DatasetViewOption) => {
          const allSelected = item.slug === DEFAULT_SELECTED.slug;
          const selectedSavedView = allSelected ? "" : item.label;
          const selectedSavedViewUrlName = allSelected ? "" : item.id;
          setView([], [], selectedSavedView, true, selectedSavedViewUrlName);
        }}
        items={searchData}
        onEdit={(item) => {
          setEditView({
            color: item.color || "",
            description: item.description || "",
            isCreating: false,
            name: item.label,
          });
          setIsOpen(true);
        }}
        search={{
          value: viewSearch,
          placeholder: "Search views...",
          onSearch: (term: string) => {
            setViewSearch(term);
          },
        }}
        lastFixedOption={
          <LastOption
            onClick={() => !isEmptyView && setIsOpen(true)}
            disabled={isEmptyView}
          >
            <Box style={{ width: "12%" }}>
              <AddIcon fontSize="small" disabled={isEmptyView} />
            </Box>
            <TextContainer disabled={isEmptyView}>
              Save current filters as view
            </TextContainer>
          </LastOption>
        }
      />
    </Box>
  );
}
