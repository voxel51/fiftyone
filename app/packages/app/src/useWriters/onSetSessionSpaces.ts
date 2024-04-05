import { setSpaces, setSpacesMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { resolveURL } from "../utils";
import { RegisteredWriter } from "./registerWriter";

const onSetSessionSpaces: RegisteredWriter<"sessionSpaces"> =
  ({ environment, router, subscription }) =>
  (spaces) => {
    router.history.replace(
      resolveURL({
        currentPathname: router.history.location.pathname,
        currentSearch: router.history.location.search,
        extra: {
          workspace: null,
        },
      }),
      { ...router.history.location.state, workspace: null }
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
