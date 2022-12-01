import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import {
  useRecoilCallback,
  useRecoilTransaction_UNSTABLE,
  useRecoilValue,
} from "recoil";
import {
  filters,
  groupSlice,
  resolvedGroupSlice,
  selectedLabelList,
  selectedSamples,
  State,
  stateSubscription,
  view,
} from "../recoil";
import { RouterContext } from "../routing";
import { transformDataset } from "../utils";
import useSendEvent from "./useSendEvent";
import useStateUpdate from "./useStateUpdate";
import * as fos from "../";

const useSetView = (
  patch: boolean = false,
  selectSlice: boolean = false,
  onComplete?: () => void
) => {
  const send = useSendEvent(true);
  const updateState = useStateUpdate();
  const subscription = useRecoilValue(stateSubscription);
  const router = useContext(RouterContext);
  const [commit] = useMutation<setViewMutation>(setView);

  const onError = useErrorHandler();

  return useRecoilCallback(
    ({ snapshot }) =>
      (
        viewOrUpdater:
          | State.Stage[]
          | ((current: State.Stage[]) => State.Stage[]),
        addStages?: State.Stage[],
        viewName?: string,
        changingSavedView?: boolean,
        savedViewSlug?: string
      ) => {
        const dataset = snapshot.getLoadable(fos.dataset).contents;
        const savedViews = dataset.savedViews || [];

        send((session) => {
          const value =
            viewOrUpdater instanceof Function
              ? viewOrUpdater(snapshot.getLoadable(view).contents)
              : viewOrUpdater;

          commit({
            variables: {
              changingSavedView,
              savedViewSlug,
              viewName,
              view: value,
              subscription,
              session,
              datasetName: dataset.name,
              form: patch
                ? {
                    filters: snapshot.getLoadable(filters).contents,
                    sampleIds: [
                      ...snapshot.getLoadable(selectedSamples).contents,
                    ],
                    labels: snapshot.getLoadable(selectedLabelList).contents,
                    extended: snapshot.getLoadable(fos.extendedStages).contents,
                    addStages,
                    slice: selectSlice
                      ? snapshot.getLoadable(resolvedGroupSlice(false)).contents
                      : null,
                  }
                : {},
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              const newState = {
                ...router.history.location.state.state,
                view: value,
                viewName,
                savedViewSlug,
                viewCls: dataset.viewCls,
                selected: [],
                selectedLabels: [],
                savedViews,
                changingSavedView,
              };
              router.history.location.state.state = newState;

              const url = new URL(window.location.toString());
              const currentSlug = url.searchParams.get("view");

              // single tab / clearing stage should remove query param
              if (!changingSavedView && currentSlug && !value?.length) {
                url.searchParams.delete("view");
                let search = url.searchParams.toString();
                if (search.length) {
                  search = `?${search}`;
                }

                const path = `/datasets/${encodeURIComponent(
                  dataset.name
                )}${search}`;

                router.history.replace(path, {
                  state: newState,
                  variables: { view: value?.length ? value : null },
                });
              }

              if (
                changingSavedView &&
                (currentSlug || savedViewSlug) &&
                currentSlug !== savedViewSlug
              ) {
                if (!savedViewSlug) {
                  url.searchParams.delete("view");
                } else {
                  url.searchParams.set("view", savedViewSlug);
                }

                let search = url.searchParams.toString();
                if (search.length) {
                  search = `?${search}`;
                }

                const path = `/datasets/${encodeURIComponent(
                  dataset.name
                )}${search}`;

                router.history.push(path, {
                  state: newState,
                  variables: { view: value?.length ? value : null },
                });
              } else {
                // single tab - clear saved view if ONLY view stages change - not the saved view
                if (!changingSavedView && currentSlug) {
                  url.searchParams.delete("view");

                  let search = url.searchParams.toString();
                  if (search.length) {
                    search = `?${search}`;
                  }

                  const path = `/datasets/${encodeURIComponent(
                    dataset.name
                  )}${search}`;

                  router.history.replace(path, {
                    state: {
                      view: value,
                      viewCls: dataset.viewCls,
                      selected: [],
                      selectedLabels: [],
                      viewName,
                      savedViews,
                      savedViewSlug,
                      changingSavedView,
                    },
                  });
                }

                updateState({
                  dataset: transformDataset(dataset),
                  state: {
                    view: value,
                    viewCls: dataset.viewCls,
                    selected: [],
                    selectedLabels: [],
                    viewName,
                    savedViews,
                    savedViewSlug,
                    changingSavedView,
                  },
                });
              }

              updateState({
                dataset: transformDataset(dataset),
                state: {
                  view: value,
                  viewCls: dataset.viewCls,
                  selected: [],
                  selectedLabels: [],
                  viewName: viewName,
                  savedViews: savedViews,
                },
              });

              onComplete && onComplete();
            },
          });
        });
      }
  );
};

export default useSetView;
