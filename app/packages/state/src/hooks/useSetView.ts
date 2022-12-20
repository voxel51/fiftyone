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
import { isElectron } from "@fiftyone/utilities";

const replaceUrlWithSavedView = (
  replaceSlug: string,
  datasetName: string,
  router: any,
  newState: any,
  value: any[] | null,
  shouldPush: boolean,
  isStateless?: boolean
) => {
  const isDesktop = isElectron();
  const url = new URL(window.location.toString());

  if (isDesktop) {
    return "";
  }

  if (!replaceSlug) {
    url.searchParams.delete("view");
  } else {
    url.searchParams.set("view", replaceSlug);
  }

  let search = url.searchParams.toString();
  if (search.length) {
    search = `?${search}`;
  }

  let path = "";
  if (isStateless) {
    // TODO: not great, embedded app is stateless - we force /samples
    path = `/datasets/${encodeURIComponent(datasetName)}/samples${search}`;
  } else {
    path = `/datasets/${encodeURIComponent(datasetName)}${search}`;
  }

  if (shouldPush) {
    router.history.push(path, {
      state: newState,
      variables: { view: value?.length ? value : null },
    });
    return "";
  } else {
    return path;
  }
};

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
              subscription: subscription,
              session: session,
              view: value,
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

              changingSavedView: changingSavedView,
              savedViewSlug: savedViewSlug,
              viewName: viewName,
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              const isDesktop = isElectron();
              if (router.history.location.state) {
                const newState = {
                  ...router.history.location.state,
                  view: value,
                  viewCls: dataset.viewCls,
                  selected: [],
                  selectedLabels: [],
                  viewName: viewName,
                  savedViewSlug: savedViewSlug,
                  savedViews: savedViews,
                  changingSavedView: changingSavedView,
                };
                router.history.location.state.state = newState;

                const url = new URL(window.location.toString());
                const currentSlug = url.searchParams.get("view");

                // single tab / clearing stage should remove query param
                if (!changingSavedView && currentSlug && !value?.length) {
                  replaceUrlWithSavedView(
                    null,
                    dataset.name,
                    router,
                    newState,
                    value,
                    true
                  );
                }

                if (
                  changingSavedView &&
                  (currentSlug || savedViewSlug) &&
                  currentSlug !== savedViewSlug
                ) {
                  replaceUrlWithSavedView(
                    savedViewSlug,
                    dataset.name,
                    router,
                    newState,
                    value,
                    true
                  );
                } else {
                  // single tab - clear saved view if ONLY view stages change - not the saved view
                  if (!changingSavedView && currentSlug) {
                    const path = replaceUrlWithSavedView(
                      null,
                      dataset.name,
                      router,
                      newState,
                      value,
                      false
                    );

                    if (!isDesktop) {
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
                  }
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
                    savedViewSlug: savedViewSlug,
                    changingSavedView: changingSavedView,
                  },
                });
              } else {
                // stateless use in teams / embedded app
                const url = new URL(window.location.toString());
                const currentSlug = url.searchParams.get("view");

                if (currentSlug && !value?.length) {
                  replaceUrlWithSavedView(
                    null,
                    dataset.name,
                    router,
                    null, // should this be {}
                    value,
                    true
                  );
                } else if (savedViewSlug) {
                  replaceUrlWithSavedView(
                    savedViewSlug,
                    dataset.name,
                    router,
                    null, // should this be {}
                    value,
                    true
                  );
                }
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
                  savedViewSlug: savedViewSlug,
                  changingSavedView: changingSavedView,
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
