# Relay

This package contains shared FiftyOne Relay GraphQL queries, mutations, and
subscriptions along with some core interfaces for syncing Relay data with
Recoil data flow.

### GraphQL Atoms

#### [`graphQLSyncFragmentAtom`](./src/graphQLSyncFragmentAtom.ts)

`graphQLSyncFragmentAtom` wraps a Recoil Atom, tying it to the Relay store via
the `Writer`. Given a list of fragments, the `Writer` will attempt to sync the
atom with the current data for the last fragment in the list, after recursing
the previous fragment keys. On optional `read` function can be provided for
mapping the fragment data to a new shape.

#### [`graphQLSyncFragmentAtom`](./src/graphQLSyncFragmentAtom.ts)

A parameterized version of `graphQLSyncFragmentAtom`. Includes the optional
`sync` parameter to conditionally opt-in to fragment syncing given an atom
instance's parameters `P`.

### Relay interfaces

#### [`Writer`](./src/Writer.tsx)

`Writer` is the core interface containing the environment implementation
controlling the atomic updates with the Relay store.
