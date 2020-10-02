# Contributing to FiftyOne

FiftyOne is open source and community contributions are welcome!

This page provides useful information about contributing to FifyOne.

## Contribution process

The FiftyOne contribution process starts with filing a GitHub issue. We use
four categories of issues: feature requests, bug reports, documentation fixes,
and installation issues. Details about each issue type and the issue lifecycle
are discussed in the [FiftyOne Issue Policy](ISSUE_POLICY.md).

FiftyOne committers actively [triage](ISSUE_TRIAGE.md) and respond to GitHub
issues. In general, we recommend waiting for feebdack from an FiftyOne
committer or community member before proceeding to implement a feature or
patch. This is particularly important for
[significant changes](#write-designs-for-significant-changes), and will
typically be labeled during triage with `needs design`.

After you have agreed upon an implementation strategy for your feature or patch
with an FiftyOne committer, the next step is to introduce your changes (see
[developing changes](#developing-changes-to-fiftyone)) as a pull request
against the FiftyOne Repository. FiftyOne committers actively review pull
requests.

Once your pull request against the FiftyOne Repository has been merged, your
corresponding changes will be automatically included in the next FiftyOne
release. Congratulations, you have just contributed to FiftyOne\! We appreciate
your contribution\!

## Contribution guidelines

In this section, we provide guidelines to consider as you develop new features
and patches for FiftyOne.

### Write designs for significant changes

For significant changes to FiftyOne, we recommend outlining a design for the
feature or patch and discussing it with an FiftyOne committer before investing
heavily in implementation. During issue triage, we try to proactively identify
issues that require design by labeling them with `needs design`. This is
particularly important if your proposed implementation:

-   Introduces new user-facing FiftyOne APIs
    -   FiftyOne's API surface is carefully designed to generalize across a
        variety of common CV/ML use cases. It is important to ensure that new
        APIs are broadly useful to CV/ML engineers and scientists, easy to work
        with, and simple yet powerful.
-   Adds new library dependencies to FiftyOne
-   Makes changes to critical internal abstractions

### Make changes backwards compatible

FiftyOne's users rely on specific App and Core behaviors in their daily
workflows. As new versions of FiftyOne's are developed and released, it is
important to ensure that users' workflows continue to operate as expected.
Accordingly, please take care to consider backwards compatibility when
introducing changes to the FiftyOne codebase. If you are unsure of the
backwards compatibility implications of a particular change, feel free to ask
an FiftyOne committer or community member for input.

## Developing changes to FiftyOne

The majority of the FiftyOne codebase is developed in Python and TypeScript.

### Prerequisites

Install the Python FiftyOne package from source - this is required for
developing & testing changes across all languages and APIs. The
[main README](README.md) provides installation setup. The
[App README](electron/README.md) provides App source installation and
development instructions.

### Core development and best practices

#### Python 2 and 3 compatibility

FiftyOne exclusively supports Python 3.

#### Style Guide

FiftyOne's Python codebase is formatted with
[black](https://github.com/python/black) and
[pylint](https://github.com/PyCQA/pylint), as well as other formatting tools.

It is recommended that you install [pre-commit](https://pre-commit.com/) into
your git hooks, to automatically check and fix any formatting issue before
creating a git commit.

To enable `pre-commit` simply run:

```console
$ pre-commit install
```

See the `.pre-commit-config.yaml` configuration file for more information on
how it works.

#### Documentation

FiftyOne's API Reference Documentation is automatically generated using
[sphinx-apidoc](https://www.sphinx-doc.org/en/master/man/sphinx-apidoc.html).
Docstrings follow
[Google docstrings](https://google.github.io/styleguide/pyguide.html#381-docstrings)
format.

When adding a new feature to FiftyOne, or changing core functionality, be sure
to update both the docstrings in source code and the corresponding
documentation in all relevant locations.

#### Tests

FiftyOne has a suite of tests in the `fiftyone/tests` subdirectory. These tests
are run automatically on code in outstanding PRs. When making a PR to FiftyOne
be sure that all tests are passing. To run these tests locally either run each
test individually:

```bash
python tests/db_conn_test.py
python tests/unittests.py
python tests/stage_tests.py
...
```

Or alternatively use [pytest](https://github.com/pytest-dev/pytest) to run the
entire test suite:

```bash
cd tests
pytest
```

If adding a new feature be sure to write one or more tests for the feature.

### App development and best practices

We follow the
[Component-Driven Development](https://blog.hichroma.com/component-driven-development-ce1109d56c8e)
(CDD) methodology for FiftyOne App development. This approach begins with
[React](https://reactjs.org/) and [Storybook](https://storybook.js.org/).

This document will continue to evolve as we learn more about what works best.
It should be noted that this App was began as this
[boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate).

Our best practices are largely informed by Storybook's
[Design System for Developers](https://www.learnstorybook.com/design-systems-for-developers/react)
guide. Reading it all the way through is the best way to get started, and will
help you understand where we are headed.

Best practices:

-   All React components should be function-based, not class-based
-   We recommend writing fully typed TypeScript, although we are still
    transitioning
-   Each TSX file should have at least one story, exceptions may apply
-   We use [Chromatic](https://www.chromatic.com/), which builds on top of
    Storybook, for design reviews and logging visual changes. You can read more
    about it begininning in the
    [Review section](<https://www.learnstorybook.com/design-systems-for-developers/react/en/review/)%20in%20the%20Design%20System%20for%20Developer's%20tutorial>)
-   For any React components (or stories) that have been changed or added in a
    PR, please link the relevant story in the PR description.
-   Storybook's Docs addon should be used for component documentation. Inline
    comments and documentation may be added as needed
-   [Prettier](https://prettier.io/) is used for autoformatting CSS,
    TypeScript, YAML, Markdown, etc. Installing FiftyOne with the development
    flag (`-d`) should have installed this step as a pre-commit hook

After installing the App development environment (see the App
[README.md](README.md)) you can run `yarn storybook`.

Chromatic homepage: Our Chromatic homepage can be found
[here](https://www.chromatic.com/builds?appId=5f1875aa9080b80022532573)

[//]: # "TODOS"
[//]: # "-   ESLint configuration"
[//]: # "-   Webpack cleanup"
[//]: # "-   Unit tests - see here"
[//]:
    #
    "https://www.learnstorybook.com/design-systems-for-developers/react/en/test/"
[//]: # "-   Recoil best practices"
[//]: # "-   TSDoc documentation for non-component code?"
[//]: # "-   Add custom introduction page to Storybook"
