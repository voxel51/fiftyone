import { setView, setViewMutation } from "@fiftyone/relay";
import { useContext } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import {
  atom,
  useRecoilCallback,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";
import { State, stateSubscription, view, viewStateForm } from "../recoil";
import { RouterContext } from "../routing";
import useSendEvent from "./useSendEvent";
import * as fos from "../";

export const stateProxy = atom({
  key: "stateProxy",
  default: null,
});

const useSetView = (
  patch = false,
  selectSlice = false,
  onComplete?: () => void
) => {
  const send = useSendEvent(true);
  const subscription = useRecoilValue(stateSubscription);
  const router = useContext(RouterContext);
  const [commit] = useMutation<setViewMutation>(setView);
  const onError = useErrorHandler();
  const setStateProxy = useSetRecoilState(stateProxy);

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
              const searchParamsString =
                router.history.location.search || window.location.search;
              const searchParams = new URLSearchParams(searchParamsString);

              savedViewSlug
                ? searchParams.set("view", encodeURIComponent(savedViewSlug))
                : searchParams.delete("view");

              const search = searchParams.toString();

              if (router.history.location.state) {
                const newRoute = `${router.history.location.pathname}${
                  search.length ? "?" : ""
                }${search}`;
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
                const newRoute = `${window.location.pathname}${
                  search.length ? "?" : ""
                }${search}`;

                setStateProxy({
                  view: savedViewSlug ? value : viewResponse,
                  viewName,
                });
                window.history.replaceState(window.history.state, "", newRoute);
              }

              onComplete && onComplete();
            },
          });
        });
      }
  );
};

export default useSetView;
