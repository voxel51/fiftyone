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
        viewSlug?: string
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
              viewName,
              subscription,
              session,
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
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              if (router.history.location.state) {
                router.history.location.state.state = {
                  ...router.history.location.state,
                  view: value,
                  viewName: viewName,
                  viewCls: dataset.viewCls,
                  selected: [],
                  selectedLabels: [],
                  savedViews: savedViews,
                };

                if (changingSavedView) {
                  router.history.push(
                    `${location.pathname}${
                      viewSlug ? `?view=${viewSlug}` : ""
                    }`,
                    {
                      state: router.history.location.state.state,
                      variables: { view: value },
                    }
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
