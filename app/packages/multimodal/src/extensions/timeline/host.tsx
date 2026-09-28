import React, { Fragment, useMemo } from "react";
import { useTimelineExtensions } from "./registry";
import { useSelectedAnnotationStreams } from "./selected-annotation-streams";
import { useTimelineSections } from "./sections";
import type {
  TimelineComposition,
  TimelineContribution,
  TimelineExtension,
  TimelineExtensionContext,
  TimelinePreferences,
  TimelineSection,
} from "./types";

interface TimelineExtensionHostProps extends Omit<
  TimelineExtensionContext,
  "selectedAnnotationStreams"
> {
  readonly builtInSections: readonly TimelineSection[];
  readonly children: (composition: TimelineComposition) => React.ReactNode;
}

/**
 * Runs the registered timeline extensions, collects their contributions, and
 * combines them with the built-in sections before rendering the playback
 * shell. Extensions stay mounted in a nested chain so each one can use React
 * hooks and providers while contributing tracks, preferences, and runtime UI.
 */
export const TimelineExtensionHost: React.FC<TimelineExtensionHostProps> = ({
  builtInSections,
  children,
  ...context
}) => {
  const extensions = useTimelineExtensions();
  const selectedAnnotationStreams = useSelectedAnnotationStreams();
  const extensionContext: TimelineExtensionContext = {
    ...context,
    selectedAnnotationStreams,
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
  readonly context: TimelineExtensionContext;
  readonly contributions: readonly RegisteredContribution[];
  readonly extensions: readonly TimelineExtension[];
  readonly index: number;
}

interface RegisteredContribution {
  readonly extensionId: string;
  readonly value: TimelineContribution;
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
  readonly builtInSections: readonly TimelineSection[];
  readonly children: (composition: TimelineComposition) => React.ReactNode;
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
  const { decorateTrack, tracks } = useTimelineSections(sections);
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
  const rulerOverlay = useMemo(() => {
    const overlays = contributions.flatMap((contribution) =>
      contribution.value.rulerOverlay
        ? [
            {
              id: contribution.extensionId,
              render: contribution.value.rulerOverlay,
            },
          ]
        : [],
    );
    return overlays.length === 0
      ? undefined
      : (labelWidth: number) => (
          <>
            {overlays.map((overlay) => (
              <Fragment key={overlay.id}>{overlay.render(labelWidth)}</Fragment>
            ))}
          </>
        );
  }, [contributions]);

  return (
    <>
      {children({
        decorateTrack,
        onDrawerOpenChange,
        preferences,
        rulerOverlay,
        runtime,
        tracks,
      })}
    </>
  );
};

function mergePreferences(
  contributions: readonly RegisteredContribution[],
): TimelinePreferences {
  const preferences: TimelinePreferences = {};
  for (const contribution of contributions) {
    Object.assign(preferences, contribution.value.preferences);
  }
  return preferences;
}
