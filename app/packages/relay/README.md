# Relay

FiftyOne App Relay GraphQL queries, mutations, and subscriptions. This package
also defines interfaces for syncing Relay data with Recoil data flow that are
outlined below.

## Interfaces

### Recoil clients

#### [`graphQLFragmentEffect`](./src/graphQLFragmentEffect.ts)

This Recoil Atom Effect allows for automatic syncing between a global fragment
used across page queries. Must be used within the `PageQueryContext` described
below. These atoms are not writable and should be considered as `RecoilValue`
interfaces and not `RecoilState`.

#### [`graphQLSyncFragmentAtom`](./src/graphQLSyncFragmentAtom.ts)

`graphQLSyncFragmentAtom` wraps a Recoil Atom, tying it to a Recoil Sync store
defined by the `Writer` with the same store key. Given a list of fragments, the
`Writer` will attempt to sync the atom with the current data for the last
fragment in the list, after recursing the previous fragment keys. On optional
`read` function can be provided for mapping the fragment data to a new shape.

#### [`graphQLSyncFragmentAtom`](./src/graphQLSyncFragmentAtom.ts)

A parametrized version of `graphQLSyncFragmentAtom`. Includes the optionl
`sync` parameter to conditionally opt-in to fragment syncing given an atom
instance's parameters `P`.

### Relay interfaces

#### [`PageQeryContext`](./src/PageQuery.tsx)

The `PageQueryContext` controls the initialization and updates of an atom using
the `graphQLFragmentEffect`.

#### [`Writer`](./src/Writer.tsx)

`Writer` is the core interface containing the environment implementation
controlling the atomic updates with Relay.
