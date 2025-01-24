# Contributing to the FiftyOne App

Help wanted! This document describes best practices for contributing to the
FiftyOne App codebase.

## Best Practices

-   All React components should be function-based, not class-based
-   We recommend writing fully typed TypeScript, although we are still
    transitioning
-   [Prettier](https://prettier.io/) is used for autoformatting CSS,
    TypeScript, YAML, Markdown, etc. Installing FiftyOne with the development
    flag (`-d`) should have installed this step as a pre-commit hook

## Getting started

See the App's [README.md](README.md) for installation instructions.

## Extending the Session

An App `session` is represented by a single
[server](../fiftyone/server/main.py) that holds a
[StateDescription](../fiftyone/core/state.py). This `state` object is defined
as a global in [`fiftyone.server.events`](../fiftyone.server.events.py) and can
be retrieved with
[`fiftyone.server.events.get_state`](../fiftyone.server.events.py).

### Python Session client state

Adding new state involves the following additions to the
[`fiftyone.server.session`](../fiftyone/core/session/) and
[`fiftyone.core.state`](../fiftyone/core/state)

-   Property and/or method definitions, e.g. `Session.selected` getter and
    setter methods
-   Adding new attributes for serialization and deserialization in the
    `StateDescription`
-   Initialization logic in `Session.__init__`
-   Contributing
    [API documentation](https://docs.voxel51.com/api/fiftyone.core.session.html)
-   Defining any new events associated with the new state
    -   Adding an event listener in
        [\_attach_event_listeners](../fiftyone/core/session/session.py)
    -   Declaring the
        [event subscription on the client](../fiftyone/core/session/events.py)
    -   Defining the [event dataclass](../fiftyone/core/session/events.py) in
        `fiftyone.core.session.events`

Note that some events are App specific, and some are Python Session specific.
See the [`@fiftyone/app`](./packages/app) for information on App event details

### Session server state

Implementing session state on the server requires processing the state and
receiving App mutations

-   [State processing](../fiftyone/server/events.py)
-   [GraphQL Mutations](../fiftyone/server/mutation.py)

Note that dispatching an event in
[fiftyone.server.events](../fiftyone/server/events.py), including a
`subscription` id prevents dispatching the event to the client that triggered
the event.

## Copyright

Copyright 2017-2025, Voxel51, Inc.<br> voxel51.com
