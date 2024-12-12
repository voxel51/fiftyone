import { setSpaces, type setSpacesMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import type { LocationState } from "../routing";
import { resolveURL } from "../utils";
import type { RegisteredWriter } from "./registerWriter";

const onSetSessionSpaces: RegisteredWriter<"sessionSpaces"> =
  ({ environment, router, subscription }) =>
  (spaces) => {
    const state = router.history.location.state as LocationState;
    router.replace(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        extra: {
          workspace: spaces._name || null,
        },
      }),
      { ...state, event: "spaces", workspace: spaces._name || null }
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
