# FiftyOne App

The home of the
[FiftyOne App](https://voxel51.com/docs/fiftyone/user_guide/app.html).

## Installation

The following installation steps are a part of the
[install script](../install.bash).

First, install [`nvm`](https://github.com/nvm-sh/nvm) and install and set your
node version to `v17.9.0` using `nvm`.

```sh
nvm install v17.9.0
nvm use v17.9.0
```

Then install `yarn` globally in your node environment with `npm`:

```shell
npm -g install yarn
```

Install the app with `yarn` in this directory:

```shell
yarn install
```

## Development

First, start the App client development server with hot reloading by running:

```shell
yarn dev
```

Next, we generally recommend starting the backend server manually so you have
access to stack traces:

```shell
python fiftyone/server/main.py
```

If you want to run both the app client development server and the backend
server, try running:

```shell
yarn dev:wpy
```

Either way, now simply launch the App like normal:

```py
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset("quickstart")

session = fo.launch_app(dataset)
```

## Style Guide

All App code contributed to FiftyOne must follow our
[style guide](../STYLE_GUIDE.md#app-style-guide).

## Testing

All new feature and bug fix pull requests should contain associated unit tests.
Each subpackage in the monorepo has a `./test` directory in which each module
should have a corresponding `<module-name>.test.ts` module. Tests are
implemented and run with [Vitest](https://vitest.dev), a testing framework very
similar to Jest, with the `yarn test` script. Coverage is monitored in all pull
requests that modify App source code via
[Codecov](https://app.codecov.io/gh/voxel51/fiftyone/).

A recommended approach to local development is to have a running Vitest UI open
with coverage to watch for failures as you develop. Coverage can be monitored
for open files in VS Code via the Coverage Gutters extension.

```sh
yarn test --ui --coverage
```

Generally speaking, new modules and source code should have 100% coverage. If
you are refactoring or bug fixing older code without tests, please add them.

### Testing Recoil and Recoil Relay

Most Recoil and Recoil Relay selectors and hooks are defined in
[`@fiftyone/state`](packages/state). This is a primary way in which data and
state flows through the App.

#### Selectors and GraphQL Selectors

In order to write unit tests for selectors you must mock `recoil` (and
`recoil-relay` if GraphQL selectors are being tested, or selectors being tested
depend on GraphQL selectors).

These unit tests are only for testing a selector's `get` and optionally `set`
methods, treating theme as pure functions.

For `get`, the inputs are the mocked parent values. All parent selectors or
atoms must have mock values set. The output is the return value.

For `set`, the inputs are also the mocked parent values and all parent
selectors or atoms must have mock values set. The outputs are the set of
selectors or atoms that were set with the `set` function. These values can be
asserted from the mock values store after the function is run.

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("recoil");
vi.mock("recoil-relay");
// import recoil module(s) for testing after mocking
import { atom, selectorFamily } from "./recoil";

const one = atom<number>({
    key: "one",
    default: 1,
});

const two = selectorFamily<number, number>({
    key: "two",
    get: (param) => () => param,
});

const exampleSelector = selectorFamily<number, number>({
    key: "exampleSelectorFamily",
    get:
        (param) =>
        ({ get }) =>
            param + get(one) + get(two(param)),
    set:
        (param) =>
        ({ set }, newValue) =>
            set(one, newValue),
});

import {
    getValue,
    setMockAtoms,
    TestSelector,
    TestSelectorFamily,
} from "./__mocks__/recoil";

describe("my tests", () => {
    const test = <TestSelectorFamily<typeof exampleSelectorFamily>>(
        (<unknown>exampleSelectorFamily(1))
    );

    it("resolves get correctly", () => {
        setMockAtoms({
            one: 1,
            two: (param) => 1,
        });
        expect(test()).toBe(3);
    });

    it("resolves set correctly", () => {
        test.set(2);
        expect(getValue(one)).toBe(2);
    });
});
```

#### Hooks

Hooks can be tested with the
[React Hooks Testing Library](https://react-hooks-testing-library.com/). These
follow an integration testing pattern as the full recoil graph must be
manipulated to test various outcomes.

```ts
import { act, renderHook } from "@testing-library/react-hooks";
import React from "react";
import { atom, RecoilRoot, useRecoilValue } from "recoil";
import { expect, test } from "vitest";

const value = atom({
    key: "value",
    default: false,
});

const Root: React.FC<React.PropsWithChildren<{}>> = ({ children }) => {
    return (
        <RecoilRoot
            initializeState={(snapshot) => {
                snapshot.set(value, true);
            }}
        >
            {children}
        </RecoilRoot>
    );
};

const useHook = () =>
    useRecoilCallback(
        ({ set }) =>
            () =>
                set(value, false)
    );

test("Test hook", () => {
    const { result } = renderHook(
        () => ({
            run: useHook(),
            value: useRecoilValue(value),
        }),
        {
            wrapper: Root,
        }
    );

    expect(result.current.value).toBe(true);
    act(() => {
        result.current.run();
    });
    expect(result.current.value).toBe(false);
});
```

## Best practices

This section will continue to evolve as we learn more about what works best.

It should be noted that this App began as this
[boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate).

Best practices:

-   All React components should be function-based, not class-based
-   We recommend writing fully typed TypeScript, although we are still
    transitioning
-   With the app dev environment installed, you can run `yarn storybook`
