import {
  setFieldVisibilityStage,
  setFieldVisibilityStageMutation,
} from "@fiftyone/relay";
import { stateSubscription } from "@fiftyone/state";
import { commitMutation } from "relay-runtime";
import { pendingEntry } from "../Renderer";
import { RegisteredSetter } from "./registerSetter";

const onSetFieldVisibilityStage: RegisteredSetter =
  ({ environment, router }) =>
  ({ get, set }, input) => {
    if (!input) return;
    set(pendingEntry, true);
    console.log("input", input);
    commitMutation<setFieldVisibilityStageMutation>(environment, {
      mutation: setFieldVisibilityStage,
      variables: {
        input: {
          cls: input?._cls,
          kwargs: {
            fieldNames: input?.kwargs.field_names,
            allowMissing: input?.kwargs._allow_missing,
          },
        },
        subscription: get(stateSubscription),
      },
      onCompleted: () => {
        console.log({
          _cls: input?._cls,
          kwargs: {
            field_names: input?.kwargs.field_names,
            _allow_missing: input?.kwargs._allow_missing,
          },
        });
        router.history.replace(
          `${router.history.location.pathname}${router.history.location.search}`,
          {
            ...router.get().state,
            extendedStages: [
              {
                _cls: input?._cls,
                kwargs: {
                  field_names: input?.kwargs.field_names,
                  _allow_missing: input?.kwargs._allow_missing,
                },
              },
            ],
          }
        );
      },
    });
  };

export default onSetFieldVisibilityStage;
