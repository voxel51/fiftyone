import { setSpaces, setSpacesMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { LocationState } from "../routing";
import { resolveURL } from "../utils";
import { RegisteredWriter } from "./registerWriter";

const onSetSessionSpaces: RegisteredWriter<"sessionSpaces"> =
  ({ environment, router, subscription }) =>
  (spaces) => {
    const state = router.history.location.state as LocationState;
    router.history.replace(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        extra: {
          workspace: null,
        },
      }),
      { ...state, workspace: null }
    );

    commitMutation<setSpacesMutation>(environment, {
      mutation: setSpaces,
      variables: {
        spaces,
        subscription,
      },
    });
  };

export default onSetSessionSpaces;
