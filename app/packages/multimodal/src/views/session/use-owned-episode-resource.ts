import { useEffect, useRef, useState } from "react";

import type {
  EpisodeOpenOptions,
  EpisodeSource,
  SampleDescriptor,
} from "../../ports";
import { errorMessage } from "../../utils/errors";

interface DisposableEpisodeResource {
  dispose(): void;
}

/** State vocabulary and lifecycle operations for one owned episode resource. */
export interface OwnedEpisodeResourceLifecycle<
  Resource extends DisposableEpisodeResource,
  State,
> {
  readonly activate?: (resource: Resource) => void;
  readonly error: (message: string) => State;
  readonly idle: State;
  readonly loading: State;
  readonly open: (
    sample: SampleDescriptor,
    source: EpisodeSource,
    options: EpisodeOpenOptions,
  ) => Promise<Resource | null>;
  readonly ready: (resource: Resource) => State;
  readonly unavailable?: State;
}

interface OwnedEpisodeResourceState<
  Resource extends DisposableEpisodeResource,
  State,
> {
  readonly enabled: boolean;
  readonly mediaReferenceIdentity: string | undefined;
  readonly mediaType: string | undefined;
  readonly path: string | null | undefined;
  readonly resource: Resource | null;
  readonly source: EpisodeSource | null;
  readonly value: State;
}

/** Opens, publishes, aborts, and disposes one request-keyed episode resource. */
export function useOwnedEpisodeResource<
  Resource extends DisposableEpisodeResource,
  State,
>(
  sample: SampleDescriptor,
  source: EpisodeSource | null,
  enabled: boolean,
  lifecycle: OwnedEpisodeResourceLifecycle<Resource, State>,
): State {
  const { mediaReference, mediaType, path } = sample;
  const mediaReferenceKind = mediaReference?.kind;
  const mediaReferenceKey = mediaReference?.key;
  const hasMediaReference = mediaReference != null;
  const mediaReferenceIdentity = hasMediaReference
    ? JSON.stringify([mediaReferenceKind, mediaReferenceKey])
    : undefined;
  const liveResourceRef = useRef<Resource | null>(null);
  const [ownedState, setOwnedState] = useState<
    OwnedEpisodeResourceState<Resource, State>
  >(() => ({
    enabled,
    mediaReferenceIdentity,
    mediaType,
    path,
    resource: null,
    source,
    value: enabled && source ? lifecycle.loading : lifecycle.idle,
  }));

  useEffect(() => {
    if (!enabled || !source) {
      setOwnedState({
        enabled,
        mediaReferenceIdentity,
        mediaType,
        path,
        resource: null,
        source,
        value: lifecycle.idle,
      });
      return undefined;
    }

    let active = true;
    let opened: Resource | null = null;
    const controller = new AbortController();
    setOwnedState({
      enabled,
      mediaReferenceIdentity,
      mediaType,
      path,
      resource: null,
      source,
      value: lifecycle.loading,
    });
    void lifecycle
      .open(
        {
          mediaReference:
            mediaReferenceKey !== undefined && mediaReferenceKind !== undefined
              ? {
                  key: mediaReferenceKey,
                  kind: mediaReferenceKind,
                }
              : undefined,
          mediaType,
          path,
        },
        source,
        { signal: controller.signal },
      )
      .then((resource) => {
        if (!resource) {
          if (active) {
            setOwnedState({
              enabled,
              mediaReferenceIdentity,
              mediaType,
              path,
              resource: null,
              source,
              value: lifecycle.unavailable ?? lifecycle.idle,
            });
          }
          return;
        }
        if (!active) {
          resource.dispose();
          return;
        }
        opened = resource;
        liveResourceRef.current = resource;
        lifecycle.activate?.(resource);
        setOwnedState({
          enabled,
          mediaReferenceIdentity,
          mediaType,
          path,
          resource,
          source,
          value: lifecycle.ready(resource),
        });
      })
      .catch((error) => {
        if (!active) return;
        if (opened) {
          if (liveResourceRef.current === opened) {
            liveResourceRef.current = null;
          }
          opened.dispose();
          opened = null;
        }
        setOwnedState({
          enabled,
          mediaReferenceIdentity,
          mediaType,
          path,
          resource: null,
          source,
          value: lifecycle.error(errorMessage(error)),
        });
      });

    return () => {
      active = false;
      controller.abort();
      if (opened) {
        if (liveResourceRef.current === opened) {
          liveResourceRef.current = null;
        }
        opened.dispose();
      }
    };
  }, [
    enabled,
    hasMediaReference,
    lifecycle,
    mediaReferenceIdentity,
    mediaReferenceKey,
    mediaReferenceKind,
    mediaType,
    path,
    source,
  ]);

  // React cleans up the previous effect after rendering the new request.
  // Derive ownership here so stale resources are never observable in between.
  const ownsCurrentRequest =
    ownedState.enabled === enabled &&
    ownedState.mediaReferenceIdentity === mediaReferenceIdentity &&
    ownedState.mediaType === mediaType &&
    ownedState.path === path &&
    ownedState.source === source;
  if (!ownsCurrentRequest) {
    return enabled && source ? lifecycle.loading : lifecycle.idle;
  }
  if (ownedState.resource && liveResourceRef.current !== ownedState.resource) {
    return lifecycle.loading;
  }
  return ownedState.value;
}
