import {
  setFieldVisibilityStage,
  setFieldVisibilityStageMutation,
  subscribeBefore,
} from "@fiftyone/relay";
import { stateSubscription } from "@fiftyone/state";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { RegisteredSetter } from "./registerSetter";

const onSetFieldVisibilityStage: RegisteredSetter =
  ({ environment, router, sessionRef }) =>
  ({ get, set }, input) => {
    if (!input) return;
    set(pendingEntry, true);
    console.log("useWriter:onSetFieldVisibilityStage", input);
    const fieldNames = input?.kwargs?.field_names || [];
    const cls = input?.cls || "fiftyone.core.stages.ExcludeFields";
    commitMutation<setFieldVisibilityStageMutation>(environment, {
      mutation: setFieldVisibilityStage,
      variables: {
        input: {
          cls,
          kwargs: {
            fieldNames,
            allowMissing: true,
          },
        },
        subscription: get(stateSubscription),
      },
      onCompleted: () => {
        console.log("useWriter:onSetFieldVisibilityStage:onComplete", input);

        const unsubscribe = subscribeBefore(() => {
          console.log("onSetFieldVisibilityStage:unsubscribe");
          sessionRef.current.fieldVisibilityStage = {
            cls: input.cls,
            kwargs: {
              field_names: fieldNames,
              allow_missing: true,
            },
          };
          unsubscribe();
        });
        router.history.replace(
          `${router.history.location.pathname}${router.history.location.search}`,
          {
            ...router.get().state,
            extendedStages: [
              {
                _cls: cls,
                kwargs: {
                  field_names: fieldNames,
                  _allow_missing: true,
                },
              },
            ],
          }
        );
      },
    });
  };

export default onSetFieldVisibilityStage;
