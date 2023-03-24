import { setView, setViewMutation } from "@fiftyone/relay";
import { useErrorHandler } from "react-error-boundary";
import { useMutation } from "react-relay";
import { useRecoilCallback, useRecoilTransaction_UNSTABLE } from "recoil";
import { collapseFields } from "../";
import * as atoms from "../recoil";
import {
  datasetName,
  groupSlice,
  State,
  stateSubscription,
  view,
  viewStateForm,
} from "../recoil";
import useSendEvent from "./useSendEvent";

const useSetView = (
  patch = false,
  selectSlice = false,
  onComplete: () => void = undefined
) => {
  const send = useSendEvent(true);
  const [commit] = useMutation<setViewMutation>(setView);
  const onError = useErrorHandler();

  const setter = useRecoilTransaction_UNSTABLE(
    ({ set }) =>
      ({ view, sampleFields, frameFields, viewCls }) => {
        set(atoms.viewCls, viewCls);
        set(atoms.sampleFields, sampleFields);
        set(atoms.frameFields, frameFields);
        set(atoms.view, view);
        set(groupSlice(false));
      },
    []
  );

  return useRecoilCallback(
    ({ snapshot }) =>
      (
        viewOrUpdater:
          | State.Stage[]
          | ((current: State.Stage[]) => State.Stage[]),
        addStages?: State.Stage[],
        savedViewSlug?: string,
        omitSelected?: boolean
      ) => {
        send((session) => {
          const value =
            viewOrUpdater instanceof Function
              ? viewOrUpdater(snapshot.getLoadable(view).contents)
              : viewOrUpdater;

          const dataset = snapshot.getLoadable(datasetName).contents;
          const subscription = snapshot.getLoadable(stateSubscription).contents;
          commit({
            variables: {
              subscription,
              session,
              view: value,
              datasetName: dataset,
              form: patch
                ? snapshot.getLoadable(
                    viewStateForm({
                      addStages: addStages
                        ? JSON.stringify(addStages)
                        : undefined,
                      modal: false,
                      selectSlice,
                      omitSelected,
                    })
                  ).contents
                : {},
              savedViewSlug,
            },
            onError,
            onCompleted: ({
              setView: {
                view,
                dataset: { viewCls, frameFields, sampleFields },
              },
            }) => {
              setter({
                viewCls,
                view,
                frameFields: collapseFields(frameFields),
                sampleFields: collapseFields(sampleFields),
              });
              onComplete && onComplete();
            },
          });
        });
      },
    [patch, selectSlice, onComplete]
  );
};

export default useSetView;
