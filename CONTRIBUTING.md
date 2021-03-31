# Contributing to FiftyOne

FiftyOne is open source and community contributions are welcome!

If you have not already, we highly recommend browsing currently active
[projects](https://github.com/voxel51/fiftyone/projects) to get a sense of what
is planned for FiftyOne as it is steered toward a 1.0 release. Each project is
a component of FiftyOne that we, the maintainers, deem critical to a great
CV/ML tool for both datasets and models.

Please do not be frightened by the procedures outlined below. They are not
dogmatic and are only meant to help guide development as the project and number
of contributors grow.

## Contribution process

The FiftyOne contribution process starts with filing a GitHub issue. FiftyOne
defines four categories of issues: feature requests, bug reports, documentation
fixes, and installation issues. Details about each issue type and the issue
lifecycle are discussed in the [FiftyOne Issue Policy](ISSUE_POLICY.md).
Documentation typos, and generally any small improvements need not a have a
corresponding issue.

FiftyOne maintainers actively [triage](ISSUE_TRIAGE.md) and respond to GitHub
issues. In general, we recommend waiting for feebdack from a FiftyOne
maintainer or community member before proceeding to implement a feature or
patch. This is particularly important for
[significant changes](#write-designs-for-significant-changes), and will
typically be labeled during triage with `needs design`.

After you have agreed upon an implementation strategy for your feature or patch
with a FiftyOne maintainer, the next step is to introduce your changes (see
[developing changes](#developing-changes-to-fiftyone)) as a pull request
against the FiftyOne Repository. If it is a feature request that should be
associated with a [project](https://github.com/voxel51/fiftyone/projects), a
FiftyOne maintainer will do so.

Once your pull request against the FiftyOne Repository has been merged, your
corresponding changes will be automatically included in the next FiftyOne
release. Congratulations, you have just contributed to FiftyOne\! We appreciate
your contribution\!

## Contribution guidelines

In this section, we provide guidelines to consider as you develop new features
and patches for FiftyOne.

### Write designs for significant changes

For significant changes to FiftyOne, we recommend outlining a design for the
feature or patch and discussing it with a FiftyOne maintainer before investing
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
backwards compatibility implications of a particular change, feel free to ask a
FiftyOne maintainer or community member for input.

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
be sure that all tests are passing. See the README in `fiftyone/tests` for
instructions on running these tests locally.

Please be sure to write tests when you add new features.

### App development and best practices

This document will continue to evolve as we learn more about what works best.
It should be noted that this App was began as this
[boilerplate](https://github.com/electron-react-boilerplate/electron-react-boilerplate).

Best practices:

-   All React components should be function-based, not class-based
-   We recommend writing fully typed TypeScript, although we are still
    transitioning
-   [Prettier](https://prettier.io/) is used for autoformatting CSS,
    TypeScript, YAML, Markdown, etc. Installing FiftyOne with the development
    flag (`-d`) should have installed this step as a pre-commit hook

After installing the App development environment (see the App
[README.md](README.md)) you can run `yarn storybook`.
