import {
  commitMutation,
  Disposable,
  GraphQLTaggedNode,
  IEnvironment,
  MutationConfig,
  MutationParameters,
  PayloadError,
} from "relay-runtime";
import {
  useMutation as useRelayMutation,
  UseMutationConfig,
} from "react-relay";
import { useNotification } from "@fiftyone/hooks";
import { useContext } from "react";
import {
  OSSRelayEnvironment,
  TeamsRelayEnvironment,
} from "@fiftyone/teams-state";

type MutationError = Error | PayloadError[];

type ExtendedConfig<TMutation extends MutationParameters> = {
  successMessage?: string;
  errorMessage?: string;
  onFailure?: ((error: MutationError) => void) | undefined;
  onSuccess?: ((response: TMutation["response"]) => void) | undefined;
};

export default function useMutation<TMutation extends MutationParameters>(
  mutation: GraphQLTaggedNode,
  commitMutationFn?: (
    environment: IEnvironment,
    config: MutationConfig<TMutation>
  ) => Disposable,
  oss: boolean = false
): [
  (
    config: UseMutationConfig<TMutation> & ExtendedConfig<TMutation>
  ) => Disposable,
  boolean
] {
  const environment = useContext(
    oss ? OSSRelayEnvironment : TeamsRelayEnvironment
  );

  const [_, sendNotification] = useNotification();
  const [invokeRelayMutation, inProgress] = useRelayMutation<TMutation>(
    mutation,
    commitMutationFn
      ? (_, config) => commitMutationFn(environment, config)
      : (_, config) => commitMutation(environment, config)
  );

  function invokeMutation(
    config: UseMutationConfig<TMutation> & ExtendedConfig<TMutation>
  ): Disposable {
    const {
      successMessage,
      onCompleted,
      onSuccess,
      onFailure,
      errorMessage,
      onError,
    } = config;

    function handleError(error: MutationError) {
      // handle error and show notification
      const mutationError = error?.source?.errors?.[0]?.message;
      console.error(error);
      if (errorMessage)
        sendNotification({ msg: errorMessage, variant: "error" });
      else if (mutationError) {
        // show the error from mutation response
        sendNotification({ msg: mutationError, variant: "error" });
      }
      if (error instanceof Error && onError) onError(error);
      if (onFailure) onFailure(error);
    }

    return invokeRelayMutation({
      ...config,
      onCompleted: (data, errors) => {
        const hasErrors = errors?.length > 0;
        // handle internal error and show notification
        if (onCompleted) onCompleted(data, errors);
        if (hasErrors) {
          handleError(errors);
        } else {
          if (successMessage)
            sendNotification({ msg: successMessage, variant: "success" });
          if (onSuccess) onSuccess(data);
        }
      },
      onError: handleError,
    });
  }

  return [invokeMutation, inProgress];
}
