/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type React from "react";
import { useEffect } from "react";
import { RelayEnvironmentProvider } from "react-relay";
import type { IEnvironment } from "relay-runtime";

/**
 * Names an environment so state defined at module scope, before any
 * environment exists, can still say which one it queries against.
 */
export class EnvironmentKey {
  constructor(private readonly name: string) {}

  toJSON(): string {
    return this.name;
  }
}

const environments = new Map<EnvironmentKey, IEnvironment>();

const cleanups = new Map<EnvironmentKey, ReturnType<typeof setTimeout>>();

export function registerEnvironment(
  environment: IEnvironment,
  environmentKey: EnvironmentKey,
): () => void {
  const previous = environments.get(environmentKey);
  if (previous !== undefined && previous !== environment) {
    throw new Error(
      `one Relay environment per EnvironmentKey, and "${environmentKey.toJSON()}" already names another`,
    );
  }

  environments.set(environmentKey, environment);

  const pending = cleanups.get(environmentKey);
  if (pending !== undefined) {
    clearTimeout(pending);
    cleanups.delete(environmentKey);
  }

  return () => {
    /**
     * Deferred by an event loop turn because StrictMode tears one registration
     * down before the next is made, and an unregistered key makes every query
     * that names it throw.
     */
    const stale = cleanups.get(environmentKey);
    if (stale !== undefined) {
      clearTimeout(stale);
    }

    cleanups.set(
      environmentKey,
      setTimeout(() => {
        environments.delete(environmentKey);
        cleanups.delete(environmentKey);
      }, 0),
    );
  };
}

export function resolveEnvironment(
  option: EnvironmentKey | IEnvironment,
): IEnvironment {
  if (!(option instanceof EnvironmentKey)) {
    return option;
  }

  const environment = environments.get(option);
  if (environment === undefined) {
    throw new Error(
      `<ReverbRelayEnvironment> must register an environment for EnvironmentKey "${option.toJSON()}" above any state that names it`,
    );
  }

  return environment;
}

interface ReverbRelayEnvironmentProps {
  children?: React.ReactNode;
  environment: IEnvironment;
  environmentKey: EnvironmentKey;
}

/**
 * Registers during render as well as on mount, because state initialized by a
 * descendant in the same commit resolves its environment before effects run.
 */
export const ReverbRelayEnvironment = ({
  children,
  environment,
  environmentKey,
}: ReverbRelayEnvironmentProps) => {
  registerEnvironment(environment, environmentKey);

  useEffect(
    () => registerEnvironment(environment, environmentKey),
    [environment, environmentKey],
  );

  return <>{children}</>;
};

export const ReverbRelayEnvironmentProvider = ({
  children,
  environment,
  environmentKey,
}: ReverbRelayEnvironmentProps) => (
  <ReverbRelayEnvironment
    environment={environment}
    environmentKey={environmentKey}
  >
    <RelayEnvironmentProvider environment={environment}>
      {children}
    </RelayEnvironmentProvider>
  </ReverbRelayEnvironment>
);
