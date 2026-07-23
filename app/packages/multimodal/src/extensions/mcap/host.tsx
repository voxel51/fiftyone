import React, {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  getMcapSourceBootstrapSnapshot,
  mcapSourceBootstrapKey,
  subscribeMcapSourceBootstrap,
} from "../../adapters/mcap/source-bootstrap-cache";
import { MCAP_ACTIVE_TIMELINE } from "../../adapters/mcap/types";
import type { McapTimelineRange } from "../../adapters/mcap";
import { useMcapTimelineExtensions } from "./registry";
import { useMcapSelectedAnnotationTopics } from "./selected-annotation-topics";
import { useMcapTimelineSections } from "./sections";
import type {
  McapTimelineComposition,
  McapTimelineContribution,
  McapTimelineExtension,
  McapTimelineExtensionContext,
  McapTimelinePreferences,
  McapTimelineSection,
} from "./types";

interface McapTimelineExtensionHostProps extends Omit<
  McapTimelineExtensionContext,
  "selectedAnnotationTopics" | "timelineRange"
> {
  readonly builtInSections: readonly McapTimelineSection[];
  readonly children: (composition: McapTimelineComposition) => React.ReactNode;
}

/**
 * Runs the registered timeline extensions, collects their contributions, and
 * combines them with the built-in sections before rendering the playback
 * shell. Extensions stay mounted in a nested chain so each one can use React
 * hooks and providers while contributing tracks, preferences, and runtime UI.
 */
export const McapTimelineExtensionHost: React.FC<
  McapTimelineExtensionHostProps
> = ({ builtInSections, children, ...context }) => {
  const extensions = useMcapTimelineExtensions();
  const selectedAnnotationTopics = useMcapSelectedAnnotationTopics();
  const timelineRange = useMcapTimelineRange(context.client, context.source);
  const extensionContext: McapTimelineExtensionContext = {
    ...context,
    selectedAnnotationTopics,
    timelineRange,
  };

  return (
    <ExtensionChain
      context={extensionContext}
      extensions={extensions}
      index={0}
      contributions={[]}
    >
      {(contributions) => (
        <ComposedTimeline
          builtInSections={builtInSections}
          contributions={contributions}
        >
          {children}
        </ComposedTimeline>
      )}
    </ExtensionChain>
  );
};

interface ExtensionChainProps {
  readonly children: (
    contributions: readonly RegisteredContribution[],
  ) => React.ReactNode;
  readonly context: McapTimelineExtensionContext;
  readonly contributions: readonly RegisteredContribution[];
  readonly extensions: readonly McapTimelineExtension[];
  readonly index: number;
}

interface RegisteredContribution {
  readonly extensionId: string;
  readonly value: McapTimelineContribution;
}

const ExtensionChain: React.FC<ExtensionChainProps> = ({
  children,
  context,
  contributions,
  extensions,
  index,
}) => {
  // Each extension is render-prop middleware: it receives the same host
  // context, reports one contribution, and wraps the rest of the chain. The
  // nesting preserves any providers an extension mounts for later extensions.
  const extension = extensions[index];
  if (!extension) return <>{children(contributions)}</>;
  const Component = extension.Component;
  return (
    <Component {...context}>
      {(contribution) => (
        <ExtensionChain
          context={context}
          contributions={[
            ...contributions,
            { extensionId: extension.id, value: contribution },
          ]}
          extensions={extensions}
          index={index + 1}
        >
          {children}
        </ExtensionChain>
      )}
    </Component>
  );
};

const ComposedTimeline: React.FC<{
  readonly builtInSections: readonly McapTimelineSection[];
  readonly children: (composition: McapTimelineComposition) => React.ReactNode;
  readonly contributions: readonly RegisteredContribution[];
}> = ({ builtInSections, children, contributions }) => {
  // This is the merge boundary. Section ordering and track decoration are
  // resolved together, preference fields use registration order as their
  // override order, and runtime nodes mount alongside the playback shell.
  const sections = useMemo(
    () => [
      ...builtInSections,
      ...contributions.flatMap(
        (contribution) => contribution.value.sections ?? [],
      ),
    ],
    [builtInSections, contributions],
  );
  const { decorateTrack, tracks } = useMcapTimelineSections(sections);
  const preferences = useMemo(
    () => mergePreferences(contributions),
    [contributions],
  );
  const onDrawerOpenChange = useMemo(() => {
    const listeners = contributions.flatMap((contribution) =>
      contribution.value.onDrawerOpenChange
        ? [contribution.value.onDrawerOpenChange]
        : [],
    );
    return listeners.length === 0
      ? undefined
      : (open: boolean) => {
          for (const listener of listeners) listener(open);
        };
  }, [contributions]);
  const runtime = contributions.map((contribution) => (
    <Fragment key={contribution.extensionId}>
      {contribution.value.runtime}
    </Fragment>
  ));

  return (
    <>
      {children({
        decorateTrack,
        onDrawerOpenChange,
        preferences,
        runtime,
        tracks,
      })}
    </>
  );
};

function mergePreferences(
  contributions: readonly RegisteredContribution[],
): McapTimelinePreferences {
  const preferences: McapTimelinePreferences = {};
  for (const contribution of contributions) {
    Object.assign(preferences, contribution.value.preferences);
  }
  return preferences;
}

/** Resolves one exact range per source and suppresses stale async commits. */
function useMcapTimelineRange(
  client: McapTimelineExtensionContext["client"],
  source: McapTimelineExtensionContext["source"],
): McapTimelineRange | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      source ? subscribeMcapSourceBootstrap(source, listener) : () => undefined,
    [source],
  );
  const getSnapshot = useCallback(
    () => (source ? getMcapSourceBootstrapSnapshot(source) : null),
    [source],
  );
  const bootstrap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const sourceKey = source ? mcapSourceBootstrapKey(source) : null;
  const [resolved, setResolved] = useState<{
    readonly range: McapTimelineRange;
    readonly sourceKey: string;
  } | null>(null);
  const cachedRange = bootstrap?.timelineRange;

  // This effect resolves a missing range for the current source and ignores a
  // result if that source is replaced before the read completes.
  useEffect(() => {
    if (!source || !sourceKey || cachedRange) return undefined;
    let cancelled = false;
    void client
      .readTimelineRange({ activeTimeline: MCAP_ACTIVE_TIMELINE.LOG, source })
      .then((range) => {
        if (!cancelled) setResolved({ range, sourceKey });
      })
      .catch(() => {
        // Inventory owns the source error; extensions remain withheld.
      });
    return () => {
      cancelled = true;
    };
  }, [cachedRange, client, source, sourceKey]);

  return (
    cachedRange ?? (resolved?.sourceKey === sourceKey ? resolved.range : null)
  );
}
