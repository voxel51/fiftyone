import * as fos from "@fiftyone/state";
import * as foq from "@fiftyone/relay";
import { useContext } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import { useMutation } from "react-relay";

/**
 *
 * @returns a callback to set the selectedFields stage
 */
export default function useSetSelectedFieldsStage() {
  const dataset = useRecoilValue(fos.dataset);
  const router = useContext(fos.RouterContext);
  const [setView] = useMutation<foq.setViewMutation>(foq.setView);
  const datasetName = dataset?.name;

  return {
    setViewToFields: useRecoilCallback(
      ({ snapshot, set }) =>
        async (value) => {
          set(fos.selectedFieldsStageState, value);

          // router is loaded only in OSS
          if (router.loaded) return;
          const view = await snapshot.getPromise(fos.view);
          const subscription = await snapshot.getPromise(fos.stateSubscription);
          setView({
            variables: {
              view: value ? [...view, value] : view,
              datasetName: datasetName,
              form: {},
              subscription,
            },
            onCompleted: ({ setView: { dataset } }) => {
              // in an embedded context, we update the dataset schema through the
              // state proxy
              set(fos.stateProxy, (current) => ({
                ...(current || {}),
                dataset,
              }));
            },
          });
        },
      [setView, router, datasetName]
    ),
  };
}
