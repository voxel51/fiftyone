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

An App `session` is represented by single [server](../fiftyone/server/main.py)
holding which holds a [StateDescription](../fiftyone/core/state.py). The
`state` object is held by the
`fiftyone.server.events`(../fiftyone.server.events.py) Python module and can be
access via `fiftyone.server.events.get_state`(../fiftyone.server.events.py).

The purpose of the `StateDescription` is to hold session values such as
selected labels across App page loads, and for state changes to synchronized
between Python and the App. The most simple of example of state in the a
session is the currently selected samples, accessible in a Python `Session` via
the `selected` attributed.

Using the `selected` samples property as an example, we can walk through the
minimal set declarations required to connection Python and App session state.

### Python client state

The first set of declarations should define how a user will interact with the
state in Python. For `selected`, this consists of the following:

-   Implementing `Session.selected` getter and setter methods
-   Adding `selected` in the `StateDescription`, including serialization and
    deserialization
-   Adding initialization logic in `Session.__init__`
-   Contributing
    [API documentation](https://docs.voxel51.com/api/fiftyone.core.session.html)
-   Defining the `select_samples` event. This includes
    -   Adding an event listener in
        [\_attach_event_listeners](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/core/session/session.py#L1123)
    -   Declaring the
        [event subscription on the client](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/core/session/client.py#L94)
        (if the Python session should receive the event)
    -   Defining the
        [event dataclass](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/core/session/events.py#L143)
        in `fiftyone.core.session.events`

### Session server state

With the Python client implementation defined, the session server requires only
a small number additions.

-   [State assignment](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/server/events.py#L72)
    for the Python via dataclass event
-   Any mutation definitions for the App that should trigger the event. For
    `select_samples`, this consists of just the
    [`set_selected` mutation](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/server/mutation.py#L131)

Note that in GraphQL mutations, the
[dispatch_event](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/fiftyone/server/events.py#L55)
function is called to dispatch the event to all subscribed clients. By
including the `subscription` id, we avoid dispatching the event to the client
that triggered the event.

### Connecting the App

The final piece of wiring is declaring the state in the App. This first starts
with how App components will interact with the state via the `@fiftyone/state`
package.

The state should be made accessible via a `sessionAtom` by first declaring it
on the `Session` interface in `./app/packages/state/src/session.ts`. A default
value in `SESSION_DEFAULT` can also be added.

A `sessionAtom` should then be created. For `selected`, this is
[`selectedSamples`](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/app/packages/state/src/recoil/atoms.ts#L199)
atom (consist naming should be considered)

The final piece is implementing the syncing behavior in `@fiftyone/app`
[`Sync`](https://github.com/voxel51/fiftyone/blob/routing/app/packages/app/src/Sync.tsx)
component. This includes

-   Declaring the
    [event enum value](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/app/packages/app/src/Sync.tsx#L48)
-   Adding it to the
    [event source](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/app/packages/app/src/Sync.tsx#L189)
-   [Adding event handling](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/app/packages/app/src/Sync.tsx#L130)
    in the event source
-   Implementing
    [write handling](https://github.com/voxel51/fiftyone/blob/9502b4c9d948791fadbe55096c2a2a8605db795c/app/packages/app/src/Sync.tsx#L444)
    to dispatch the event from the App.

## Copyright

Copyright 2017-2023, Voxel51, Inc.<br> voxel51.com
