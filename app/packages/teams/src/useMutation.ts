import React, { useCallback, useEffect, useRef, useState } from "react";
import { useErrorHandler } from "react-error-boundary";
import { useRelayEnvironment } from "react-relay/hooks";
import {
  commitMutation,
  Disposable,
  GraphQLTaggedNode,
  MutationConfig,
  MutationParameters,
} from "relay-runtime";

const useMutation = (
  mutation: GraphQLTaggedNode
): [
  boolean,
  (config?: Omit<MutationConfig<MutationParameters>, "mutation">) => void
] => {
  const environment = useRelayEnvironment();
  const handleError = useErrorHandler();
  const [isPending, setPending] = useState(false);
  const requestRef = useRef<Disposable | null>(null);
  const mountedRef = useRef(false);
  const execute = useCallback(
    (config = { variables: {} }) => {
      if (requestRef.current != null) {
        return;
      }
      const request = commitMutation(environment, {
        ...config,
        onCompleted: (...args) => {
          if (!mountedRef.current) {
            return;
          }
          requestRef.current = null;
          setPending(false);
          config.onCompleted && config.onCompleted(...args);
        },
        onError: (error) => {
          if (!mountedRef.current) {
            return;
          }
          requestRef.current = null;
          setPending(false);
          config.onError ? config.onError(error) : handleError(error);
        },
        mutation,
      });
      requestRef.current = request;
      setPending(true);
    },
    [mutation, environment]
  );
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  return [isPending, execute];
};

export default useMutation;
