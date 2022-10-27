# Contributing to FiftyOne

FiftyOne is open source and community contributions are welcome!

If you have not already, we highly recommend browsing currently
[active projects](https://github.com/voxel51/fiftyone/projects?type=classic) to
get a sense of what is planned for FiftyOne. Each project is a component of
FiftyOne that we, the maintainers, deem critical to building a world-class
ecosystem for building high quality CV/ML datasets and models.

Don't be intimidated by the procedures outlined below. They are not dogmatic
and are only meant to help guide development as the project and number of
contributors grow.

## Contribution Process

### GitHub Issues

The FiftyOne contribution process generally starts with filing a
[GitHub issue](https://github.com/voxel51/fiftyone/issues).

FiftyOne defines four categories of issues: feature requests, bug reports,
documentation fixes, and installation issues. Details about each issue type and
the issue lifecycle are discussed in our [issue policy](ISSUE_POLICY.md). Small
tweaks such as typos or other small improvements do not need to have a
corresponding issue.

FiftyOne maintainers [actively triage](ISSUE_TRIAGE.md) and respond to GitHub
issues. In general, we recommend waiting for feedback from a FiftyOne
maintainer or community member before proceeding to implement a feature or
patch. This is particularly important for
[significant changes](#write-designs-for-significant-changes), and will
typically be labeled during triage with `needs design`.

### Pull Requests

After you have agreed upon an implementation strategy for your feature or patch
with a FiftyOne maintainer, the next step is to introduce your changes (see
[developer guide](#developer-guide)) as a pull request against the FiftyOne
repository.

Steps to make a pull request:

-   Fork https://github.com/voxel51/fiftyone
-   Implement your feature as a branch off of the `develop` branch
-   Create a pull request into the `develop` branch of
    https://github.com/voxel51/fiftyone

The `develop` branch contains the bleeding edge version of FiftyOne. If you are
contributing to an existing feature branch, then make your pull requests into
that branch instead. When in doubt, work against the `develop` branch.

Once your pull request has been merged, your changes will be automatically
included in the next FiftyOne release!

## Contribution Guidelines

Here's some general guidelines for developing new features and patches for
FiftyOne:

### Write designs for significant changes

For significant changes to FiftyOne, we recommend outlining a design for the
feature or patch (in the GitHub issue itself) and discussing it with a FiftyOne
maintainer before investing heavily in implementation.

During issue triage, we try to proactively identify issues that require design
by labeling them with `needs design`. This is particularly important if your
proposed implementation:

-   Introduces new user-facing FiftyOne APIs
    -   FiftyOne's API surface is carefully designed to generalize across a
        variety of common CV/ML use cases. It is important to ensure that new
        APIs are broadly useful to CV/ML engineers and scientists, easy to work
        with, and simple yet powerful
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

## Developer Guide

### Installation

To contribute any feature to FiftyOne, you must install from source, including
the `-d` flag to install developer dependencies, pre-commit hooks, etc:

```shell
bash install.bash -d
```

Refer to the [main README](README.md#installing-from-source) to make sure you
have the necessary system packages installed on your machine.

If you are making a change to the FiftyOne App, refer to the
[App README](app/README.md) for development instructions.

### Pre-commit hooks

Performing a developer install per the above instructions will install some
[pre-commit hooks](https://pre-commit.com/) that will automatically apply code
formatting before allowing you to create a git commit.

See `.pre-commit-config.yaml` for the definitions of our hooks.

To manually install our pre-commit hooks, simply run:

```shell
pre-commit install
```

To manually lint a file, run the following:

```shell
# Manually run linting configured in the pre-commit hook
pre-commit run --files <file>
```

Note that the pylint component of the pre-commit hook only checks for errors.
To see the full output, run:

```shell
pylint <file>
```

### Python API

The [FiftyOne API](https://voxel51.com/docs/fiftyone/user_guide/basics.html) is
implemented in Python and the source code lives in
[fiftyone/fiftyone](https://github.com/voxel51/fiftyone/tree/develop/fiftyone).
Refer to `setup.py` to see the Python versions that the project supports.

All Python code contributed to FiftyOne must follow our
[style guide](STYLE_GUIDE.md#python-style-guide).

### FiftyOne App

The [FiftyOne App](https://voxel51.com/docs/fiftyone/user_guide/app.html) is an
Electron App implemented in TypeScript and the source code lives in
[fiftyone/app](https://github.com/voxel51/fiftyone/tree/develop/app).

All App code contributed to FiftyOne must follow our
[style guide](STYLE_GUIDE.md#app-style-guide).

### Documentation

The [FiftyOne Documentation](https://fiftyone.ai) is written using
[Sphinx](https://www.sphinx-doc.org/en/master) and
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon) and the
source code lives in
[fiftyone/docs](https://github.com/voxel51/fiftyone/tree/develop/docs).

When adding a new feature to FiftyOne or changing core functionality, be sure
to update both the docstrings in source code and the corresponding
documentation in all relevant locations.

All documentation, including RST and all code samples embedded in it, must
follow our [style guide](STYLE_GUIDE.md#documentation-style-guide).

### Tests

FiftyOne has a suite of tests in
[fiftyone/tests](https://github.com/voxel51/fiftyone/tree/develop/tests).

These tests are automatically run on any PRs into the `develop` branch, and all
tests must pass in order for the branch to be mergeable.

Please be sure to write tests when you add new features.
