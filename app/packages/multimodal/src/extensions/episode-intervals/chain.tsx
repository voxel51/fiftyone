import type { SampleRendererProps } from "@fiftyone/plugins";
import React, { useMemo } from "react";
import { sortSources, useEpisodeIntervalSources } from "./registry";
import type {
  EpisodeIntervalContribution,
  EpisodeIntervalSource,
  ResolvedEpisodeIntervals,
} from "./types";

const NO_INTERVALS: EpisodeIntervalContribution = { intervals: [] };
const NO_RESOLVED: readonly ResolvedEpisodeIntervals[] = [];

interface EpisodeIntervalSourcesProps {
  readonly ctx: SampleRendererProps["ctx"];
  /**
   * Sources the caller mounts unconditionally, alongside whatever is
   * registered. Temporal tags reach the grid tile this way: they ship in the
   * same package as the consumer, so routing them through the registry would
   * add a registration step without adding a seam.
   */
  readonly builtInSources?: readonly EpisodeIntervalSource[];
  readonly children: (
    resolved: readonly ResolvedEpisodeIntervals[],
  ) => React.ReactNode;
}

/**
 * Mounts every episode-interval source for one sample and hands the caller
 * what they all reported.
 *
 * Sources stay mounted in a nested chain, the same way timeline extensions do,
 * so each one can use hooks and mount providers while reporting its intervals.
 * Every source is mounted on every render — a source that should contribute
 * nothing reports nothing and, crucially, fetches nothing; see
 * {@link EpisodeIntervalSource}.
 */
export const EpisodeIntervalSources: React.FC<EpisodeIntervalSourcesProps> = ({
  builtInSources,
  children,
  ctx,
}) => {
  const registered = useEpisodeIntervalSources();
  const sources = useMemo(
    () =>
      builtInSources?.length
        ? sortSources([...builtInSources, ...registered])
        : registered,
    [builtInSources, registered],
  );

  return (
    <SourceChain ctx={ctx} index={0} resolved={NO_RESOLVED} sources={sources}>
      {children}
    </SourceChain>
  );
};

interface SourceChainProps {
  readonly ctx: SampleRendererProps["ctx"];
  readonly index: number;
  readonly resolved: readonly ResolvedEpisodeIntervals[];
  readonly sources: readonly EpisodeIntervalSource[];
  readonly children: (
    resolved: readonly ResolvedEpisodeIntervals[],
  ) => React.ReactNode;
}

const SourceChain: React.FC<SourceChainProps> = ({
  children,
  ctx,
  index,
  resolved,
  sources,
}) => {
  const source = sources[index];
  if (!source) return <>{children(resolved)}</>;
  const Component = source.Component;
  return (
    <Component ctx={ctx}>
      {(contribution) => (
        <ChainStep
          contribution={contribution}
          ctx={ctx}
          index={index}
          resolved={resolved}
          source={source}
          sources={sources}
        >
          {children}
        </ChainStep>
      )}
    </Component>
  );
};

/**
 * Accumulates one source's contribution and continues the chain.
 *
 * A component rather than inline work in the render prop above so the growing
 * list can be memoized: the consumers derive timeline tracks and pin ids from
 * it, and rebuilding the list on every render would hand them a new array each
 * time and defeat every memo downstream. A source that memoizes its own
 * contribution therefore keeps the whole chain's output stable.
 */
const ChainStep: React.FC<
  SourceChainProps & {
    readonly contribution: EpisodeIntervalContribution | undefined;
    readonly source: EpisodeIntervalSource;
  }
> = ({ children, contribution, ctx, index, resolved, source, sources }) => {
  const next = useMemo(
    () => [...resolved, { source, contribution: contribution ?? NO_INTERVALS }],
    [contribution, resolved, source],
  );
  return (
    <SourceChain ctx={ctx} index={index + 1} resolved={next} sources={sources}>
      {children}
    </SourceChain>
  );
};
