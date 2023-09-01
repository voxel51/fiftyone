# FiftyOne App

The FiftyOne App is a lightwieght single page wrapper around the
`@fiftyone/core` components. It is the client controller for syncing session
state with the server.

## Contracts

### Receiving session updates

Session updates are received by the App via
[`useEventSource`](./src/useEventSource.ts). Events to handle updates are
registered in the [`./src/useEvents`](./src/useEvents/) directory. To add a new
event, add a new `EventHandlerHook` in the directory and add register it in
[`./useEvents/index.ts`](./src/useEvents/index.ts) with a corresponding server
event name name (in came case).

### Writing session updates

The core session values are defined in `@fiftyone/state` as `sessionAtom`s.
When a `sessionAtom` is written to via a `recoil` set call, the value
immediately takes effect in the `sessionAtom`. Side effects of writing to the
atom can be registered in [`./src/useWriter`](./src/useWriters/index.ts). Side
effects are explicitly enumerated by the `RegisteredWriter` type and derive
from `@fiftyone/state`'s `Session` definition.

### Updating via Setters

The complex case of handling state updates that affect other recoil state is
encapsulated in [`./src/useSetters`](./src/useSetters/). One example of this is
updating the `view` in the App. The `view` atom in `@fiftyone/state` is
implemented as a
[`graphQLSyncFragmentAtom`](../relay/src/graphQLSyncFragmentAtom.ts) because
its value is tied to the current page query. Setting the atom is handled with
indirection by including the `selectorEffect` when creating the
`graphQLSyncFragmentAtom`. This requires an associated setter is registered in
[`./src/useSetters`](./src/useSetters/) that will control how to transition to
the next state. See
[`./src/useSetters/onSetView.ts`](./src/useSetters/onSetView.ts) for a concrete
example.
