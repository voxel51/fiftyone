# Contributing to the FiftyOne App

This document describes best practices for contributing to the FiftyOne
App codebase.

## Introduction

We follow the [Component-Driven Development](https://blog.hichroma.com/component-driven-development-ce1109d56c8e) (CDD) methodology for FiftyOne App development. This approach begins with [React](https://reactjs.org/) and [Storybook](https://storybook.js.org/).

This document will continue to evolve as we learn more about what works best. It should be noted that this App was began as [this boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate).

Our best practices are largely informed by Storybook's [Design System for Developers](https://www.learnstorybook.com/design-systems-for-developers/react) guide. Reading it all the way through is the best way to get started, and will help you understand where we are headed.

## Best Practices

- All React components should be function-based, not class-based
- We recommend writing fully typed TypeScript, although we are still transitioning
- Each TSX file should have at least one story, exceptions may apply
- We use [Chromatic](https://www.chromatic.com/), which builds on top of Storybook, for design reviews and logging visual changes. You can read more about it begininning in the [Review section](https://www.learnstorybook.com/design-systems-for-developers/react/en/review/) in the Design System for Developer's tutorial
- For any React components (or stories) that have been changed or added in a PR, please link the relevant story in the PR description.
- Storybook's Docs addon should be used for component documentation. Inline comments and documentation may be added as needed
- [Prettier](https://prettier.io/) is used for autoformatting CSS, TypeScript, YAML, Markdown, etc. Installing FiftyOne with the development flag (`-d`) should have installed this step as a pre-commit hook

## Getting started

After installing the App development environment (see the App [README.md](README.md)) you can run `yarn storybook`.

## Chromatic homepage

Our Chromatic homepage can be found [here](https://www.chromatic.com/builds?appId=5f1875aa9080b80022532573)

## Recommendations

[VS Code](https://code.visualstudio.com/) is our recommended front-end development text editor. Configuring Prettier to autoformat on save in VS Code is invaluable. See [here](https://www.robinwieruch.de/how-to-use-prettier-vscode).

## TODOS

- ESLint configuration
- Webpack cleanup
- Unit tests - see [here](https://www.learnstorybook.com/design-systems-for-developers/react/en/test/)
- Recoil best practices
- TSDoc documentation for non-component code?
- Add custom introduction page to Storybook

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br>
voxel51.com
