# Episode intervals

The seam through which anything that holds over a span of an episode reaches
two places at once: the grid tile's interval lane, and the modal timeline.

Open source knows about exactly one such thing — temporal tags. Events, label
tags, signals, and summaries are Enterprise concepts, and they arrive here as
registered sources. Nothing in this directory knows they exist.

## The contract

A source reduces whatever it knows about to `EpisodeInterval`: a name, a color,
and a span in nanoseconds from the episode start. That is the whole vocabulary.

```ts
registerEpisodeIntervalSource({
    id: "teams:events", // namespaced; also the section id + track prefix
    order: 210, // placement in the timeline drawer
    label: "Events", // section heading
    Component: EventIntervalSource,
});
```

`Component` is a render-prop component, not a hook, so it can own a fetch
lifecycle and mount providers:

```tsx
// Module level, so the inactive contribution keeps one identity across every
// render of every tile — see rule 2 below.
const INACTIVE = { intervals: [] };

const EventIntervalSource = ({ ctx, children }) => {
    const filterValues = useActiveFilterValues(EVENTS_PATH);
    if (filterValues.length === 0) return <>{children(INACTIVE)}</>;
    return (
        <FetchAndReport ctx={ctx} values={filterValues}>
            {children}
        </FetchAndReport>
    );
};
```

Three things a source is responsible for:

1. **Gating itself.** Consumers mount every source on every multimodal tile,
   unconditionally — hooks cannot be conditional, so the source's own early
   return is the only thing between an unfiltered grid and one request per
   tile. A source with nothing to contribute must report an empty list _and_
   issue no request.
2. **Memoizing its contribution.** The chain memoizes on contribution identity;
   a fresh object each render defeats every memo downstream, in a subtree that
   includes the whole playback shell.
3. **Naming its pins separately.** `pinnedRowKeys` says which rows the grid was
   filtered by. Derive it from the filter, not from the fetched intervals, so
   it is known before they load — that is what makes a track pin when it lands
   rather than being missed.

## What the consumers do with it

- `grid-overlay/EpisodeGridOverlay.tsx` flattens every source's intervals into
  one `packIntervals` call, so marks from different sources share stacked
  levels and adding a source never makes the tile taller.
- `views/episode/shell/ModalRenderer.tsx` turns each source into one
  `TimelineSection` (`intervalTimelineSections`) and concatenates its pins onto
  `defaultPinnedTrackIds` (`intervalPinnedTrackIds`).

Temporal tags are a built-in source for the grid only. In the timeline they
keep their own hand-built section, because they are editable — create, update,
delete — and the read-only interval shape has no room for that.

## Two behaviors worth knowing

- **Section headers.** `useTimelineSections` injects group header rows only
  once two or more sections are non-empty. With no sources registered (open
  source) that threshold is never crossed and the drawer looks as it always
  has; register one and headers appear for every group.
- **Late pins.** `TrackProvider` applies `initialPinnedIds` at mount and again
  to ids that join the list afterwards, once their track exists. An
  asynchronously resolved source therefore still pins on open without the
  provider being remounted — remounting it would reset the tile layout, which
  lives inside it.
