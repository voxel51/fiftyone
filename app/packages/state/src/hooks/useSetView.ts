import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { State, stateSubscription, view, viewStateForm } from "../recoil";
import { RouterContext } from "../routing";
import useSendEvent from "./useSendEvent";
import * as fos from "../";

const useSetView = (patch = false, selectSlice = false) => {
  const send = useSendEvent(true);
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
              savedViewSlug,
            },
            onError,
            onCompleted: ({
              setView: {
                view: viewResponse,
                dataset: { stages: value, viewName, ...dataset },
              },
            }) => {
              const searchParams = new URLSearchParams(
                router.history.location.search
              );

              savedViewSlug
                ? searchParams.set("view", encodeURIComponent(savedViewSlug))
                : searchParams.delete("view");

              const search = searchParams.toString();
              const newRoute = `${router.history.location.pathname}${
                search.length ? "?" : ""
              }${search}`;

              if (router.history.location.state?.state) {
                router.history.push(newRoute, {
                  ...router.history.location.state,
                  state: {
                    ...router.history.location.state.state,
                    view: savedViewSlug ? value : viewResponse,
                    viewCls: dataset.viewCls,
                    selected: [],
                    selectedLabels: [],
                    viewName,
                    savedViews: savedViews,
                  },
                });
              } else {
                window.history.replaceState(
                  { view: savedViewSlug ? value : viewResponse },
                  undefined,
                  newRoute
                );
              }
            },
          });
        });
      }
  );
};

export default useSetView;
