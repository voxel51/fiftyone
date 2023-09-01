import { setSpaces, setSpacesMutation } from "@fiftyone/relay";
import { commitMutation } from "relay-runtime";
import { RegisteredWriter } from "./registerWriter";

const onSetSessionSpaces: RegisteredWriter<"sessionSpaces"> =
  ({ environment, subscription }) =>
  (spaces) => {
    commitMutation<setSpacesMutation>(environment, {
      mutation: setSpaces,
      variables: {
        spaces,
        subscription,
      },
    });
  };

export default onSetSessionSpaces;
