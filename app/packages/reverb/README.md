# Reverb

Reverb is the App's state store. It is built on [Jotai][jotai], and its API is
deliberately narrow: state is declared with `atom` or `selector`, read and
written through hooks, and grouped into families when it is keyed by a
parameter.

```ts
import { atom, selector, useReverbValue } from "@fiftyone/reverb";

const count = atom<number>({ key: "count", default: 0 });

const doubled = selector<number>({
  key: "doubled",
  get: ({ get }) => get(count) * 2,
});

const Component = () => <span>{useReverbValue(doubled)}</span>;
```

Do not export atoms from a package. Export a domain hook that reads or writes
one, the way `@fiftyone/state` does — see
[CODING_STANDARDS.md](../../CODING_STANDARDS.md).

### State

#### [`atom`](./src/atom.ts)

Writable state holding a value. `default` may be a value, another piece of
state to read it from, or — through `resolve` — a function called on the first
read. `resolve` exists because an atom effect does not run until something
subscribes, so state that seeds itself from outside the store would otherwise
read as empty until it had a consumer.

`effects` run once per store, with `onSet` called for every write and `setSelf`
available to write back.

#### [`selector`](./src/selector.ts)

Derived state. `get` receives its own `get`, and a selector with a `set` is
writable. A pending dependency suspends the whole read rather than handing
`get` a promise, and settled values are remembered so the re-run makes
progress.

#### [`atomFamily`, `selectorFamily`](./src/family.ts)

State keyed by a parameter. Members are keyed by **value**, not reference, so a
parameter built inline at a call site does not mint a new member on every
render. Sets, maps and non-finite numbers are serialized explicitly, because
`JSON.stringify` alone would give unequal parameters the same member. `remove`
and `clear` drop members.

### Reading and writing

#### [`hooks`](./src/hooks.ts)

`useReverbValue`, `useReverbState`, `useSetReverbState` and
`useResetReverbState` subscribe a component. `useAssertedReverbValue` throws
when the value is absent, for call sites where that is a bug rather than a
state to render. `useReverbValueLoadable` and `useReverbStateLoadable` expose a
[`Loadable`](./src/loadable.ts) instead of suspending.

`useReverbCallback` and [`useReverbTransaction`](./src/transaction.ts) hand a
callback `get`/`set`/`reset` without subscribing it. Every write made inside
one commits together, and a read inside sees the writes before it.

### Resets

#### [`DefaultValue`](./src/sentinel.ts)

`reset(state)` writes the `DefaultValue` sentinel into the target's own write
path rather than restoring a value behind its back. A plain atom substitutes
its default; a writable selector receives the sentinel in `set` and decides
what a reset means — several forward it on to the server.

### Roots

#### [`ReverbRoot`](./src/root.tsx)

Wraps the tree. It uses Jotai's default store so non-React code reads what
React wrote; pass `store` to isolate one, which is what tests do so two roots
do not see each other's writes.

[jotai]: https://jotai.org
