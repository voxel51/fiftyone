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
  readonly mediaReferenceKey: string | undefined;
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
  const mediaReferenceKey = mediaReference?.key;
  const liveResourceRef = useRef<Resource | null>(null);
  const [ownedState, setOwnedState] = useState<
    OwnedEpisodeResourceState<Resource, State>
  >(() => ({
    enabled,
    mediaReferenceKey,
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
        mediaReferenceKey,
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
      mediaReferenceKey,
      mediaType,
      path,
      resource: null,
      source,
      value: lifecycle.loading,
    });
    void lifecycle
      .open({ mediaReference, mediaType, path }, source, {
        signal: controller.signal,
      })
      .then((resource) => {
        if (!resource) {
          if (active) {
            setOwnedState({
              enabled,
              mediaReferenceKey,
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
          mediaReferenceKey,
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
          mediaReferenceKey,
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
    lifecycle,
    mediaReference,
    mediaReferenceKey,
    mediaType,
    path,
    source,
  ]);

  // React cleans up the previous effect after rendering the new request.
  // Derive ownership here so stale resources are never observable in between.
  const ownsCurrentRequest =
    ownedState.enabled === enabled &&
    ownedState.mediaReferenceKey === mediaReferenceKey &&
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
