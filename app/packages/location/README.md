# @fiftyone/location

The location, as the URL states it: a route the **host** defines, and a query
that is params all the way down. One reader, one writer, one registry.

Nothing in here names a dataset, a sample, a version or a section. The package
owns the mechanism; the host owns what its URLs mean. That is what lets more
than one host share it without either one's route tree leaking into the
other's.

## Terms

| Term            | Means                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **host**        | The application that mounts this package. Each one has its own URL shapes and its own way of navigating, and neither is described in here.        |
| **location**    | Where the app currently is, as one value: a route plus params. `LocationModel<R>`.                                                                |
| **route**       | What a pathname means, as a type the host defines. This package never inspects one.                                                               |
| **codec**       | The host's `parse` / `format` / `scopes` for its routes. `RouteCodec<R>`.                                                                         |
| **adapter**     | The host's read and write of the URL, and its notification that the URL moved. `Adapter`.                                                         |
| **param**       | One query key, owned by whoever declares it: how to read it, how to write it, whether it pushes, and which scope it belongs to. `defineParam`.    |
| **scope**       | A named subject that params belong to, e.g. a dataset. The host says what each scope currently is; a param clears when its scope's token changes. |
| **session key** | One piece of session state that is not only in the URL, with legs to and from the server. `defineSessionKey`.                                     |
| **generation**  | A counter that advances on every location change. Lets work started for one location discard itself when another has replaced it.                 |

## Layout

| Path            | Rule                                                     |
| --------------- | -------------------------------------------------------- |
| `src/model/`    | Framework-free. No React, no router, no state library.   |
| `src/hooks.tsx` | The React binding, and the only place React is imported. |
| `src/bridge.ts` | Non-React access, for server pushes and operators.       |
| `src/testing/`  | The adapter conformance suite and an in-memory harness.  |

`src/model/` is held to that rule by a `no-restricted-imports` override in
`app/.eslintrc.js`, not by convention.

## Adapters

A host supplies an `Adapter`, its whole contribution to reading and writing the
URL:

```ts
interface Adapter {
    get(): string;
    push(href: string): void;
    replace(href: string): void;
    subscribe(listener: () => void): () => void;
}
```

Every href is root-relative — `/path` or `/path?query`, never absolute and
never a fragment. Origin and any deployment prefix are the adapter's business,
so no route or param has to know where the app is served from.

Expressible with `location.pathname`, `location.search`, `history.pushState`,
`history.replaceState` and `popstate` alone. A method that needs `as`,
`options`, `shallow`, a pop veto or a parsed query object means a router
concept has leaked and the interface is wrong.

Because `push` only receives an href, an adapter decides _how_ to apply it.
That is what makes an incremental exit from another router possible: a host
mid-migration can send a migrated path through `history.pushState` and hand a
path its old router still owns to that router instead. The package cannot tell
the difference.

Every adapter runs `CONFORMANCE_CASES` from `./testing` against its own
harness. The harness exposes `back()` and `depth()`, which `Adapter`
deliberately does not: history depth belongs to the user, so only the suite
observes it.

## Routes

```ts
interface RouteCodec<R> {
    parse(pathname: string): R;
    format(route: R): string;
    scopes(route: R): Record<string, string>;
}
```

`R` is the host's own union. Since the host writes both `parse` and `format`, a
path it does not model round-trips by construction — writing a param can never
rewrite a page this package has never heard of.

Adopt one route at a time with `composeRoutes`: each `RouteMatcher` returns
`undefined` for paths that are not its own, and the fallback covers everything
still unmigrated.

```ts
const routes = composeRoutes([manageRoutes, sampleRoutes], unmigrated);
```

### Scopes are the host's, and opaque

Scope names are the host's own — this package ships no list of them. `scopes`
returns a token per scope naming what that scope's params belong to; a param
clears when its scope's token changes. The package compares tokens and never
interprets them, which is what lets a host fold versioning into identity. Where
a host serves a dataset at a pinned version, that is not the same subject as
the same dataset at head, so it composes both into one token:

```ts
scopes: (route) => ({
    dataset: `${route.dataset}@${route.version ?? "head"}`,
    sample: route.sampleId,
});
```

A `{ dataset, sample }` struct could not express that without the package
learning what a version is.

## Params

```ts
export const mode = defineParam<"explore" | "annotate">({
    key: "mode",
    parse: (raw) => (raw === "annotate" ? "annotate" : "explore"),
    format: (value) => (value === "annotate" ? "annotate" : undefined),
    history: "replace",
    scope: "dataset",
});

const [value, setValue] = useLocationParam(mode);
```

`format` returning `undefined` omits the key. Keys no param claims are carried
through untouched, so a param typed by hand survives every navigation.

`scope: "dataset"` and not `"sample"` — a sample-scoped `mode` would drop back
to Inspect on every arrow to the next sample.

## Session keys

`defineSessionKey` is a param plus server legs, for state that is not only in
the URL:

```ts
defineSessionKey<ColorScheme>({
  key: "colorScheme",
  fromServer: (store, payload) => …,
  toServer: (store, value) => …,
  location: undefined,
});
```

The legs are the host's own code, so the store is all they are handed — they
close over their own transport, storage, error reporting and loading indicator.
Named for `Session` in `@fiftyone/state`, which is what the setter, writer and
event registries are already keyed on. A key with only `location` is a param
and needs no declaration here.

A leg that talks to a server has to survive being overtaken. `generation()`
advances on every location change, a pop included, so capture it after writing
and drop the result once `isCurrent` is false:

```ts
toServer: (store, value) => {
    const generation = store.generation();
    send(value).then((result) => {
        if (!store.isCurrent(generation)) return;
        apply(result);
    });
};
```

A pop is never blocked, only outrun — it has already happened by the time we
hear about it.
