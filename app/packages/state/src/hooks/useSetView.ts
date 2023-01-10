import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { State, stateSubscription, view, viewStateForm } from "../recoil";
import { RouterContext } from "../routing";
import { transformDataset } from "../utils";
import useSendEvent from "./useSendEvent";
import useStateUpdate from "./useStateUpdate";
import * as fos from "../";

const useSetView = (patch = false, selectSlice = false) => {
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
        viewName?: string
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
              subscription,
              session,
              view: value,
              datasetName: dataset.name,
              form: patch
                ? snapshot.getLoadable(
                    viewStateForm({
                      addStages: addStages ? JSON.stringify(addStages) : null,
                      modal: false,
                      selectSlice,
                    })
                  ).contents
                : {},
              viewName,
            },
            onError,
            onCompleted: ({ setView: { dataset, view: value } }) => {
              if (
                router &&
                router.history.location.state &&
                router.history.location.state.state
              ) {
                const newState = {
                  ...router.history.location.state.state,
                  view: value,
                  viewCls: dataset.viewCls,
                  selected: [],
                  selectedLabels: [],
                  viewName: viewName || null,
                  savedViews: savedViews,
                };
                router.history.location.state.state = newState;

                const searchParams = new URLSearchParams(
                  router.history.location.search
                );
                viewName
                  ? searchParams.set("view", viewName)
                  : searchParams.delete("view");

                router.history.push(
                  `${
                    router.history.location.pathname
                  }?${searchParams.toString()}`,
                  { ...router.history.location.state, state: newState }
                );
              } else {
                const searchParams = new URLSearchParams(
                  window.location.search
                );
                viewName && searchParams.set("view", viewName);
                window.location.search = searchParams.toString();
                updateState({
                  dataset: transformDataset(dataset),
                  state: {
                    view: value,
                    viewCls: dataset.viewCls,
                    selected: [],
                    selectedLabels: [],
                    viewName,
                    savedViews,
                  },
                });
              }
            },
          });
        });
      }
  );
};

export default useSetView;
