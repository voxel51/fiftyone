# FiftyOne Documentation

The official FiftyOne documentation, available at
[fiftyone.ai](https://fiftyone.ai).

FiftyOne uses [Sphinx](https://www.sphinx-doc.org/en/master) and
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon) to
generate its documentation and API reference from source.

## Prerequisites

Before building the docs locally, ensure you have:

-   Python 3.11 installed and a
    [virtual environment](https://docs.voxel51.com/getting_started/virtualenv.html)
    created specifically for documentation.

    **Note:** Do **NOT** use the same environment where you ran `install.bash`
    with the `-d` (dev mode) flag, as docs dependencies conflict with test
    dependencies.

-   [pandoc](https://pandoc.org/installing.html) installed.

-   A Unix-like shell environment to execute bash commands.

## Setup

To build the documentation locally, follow these steps:

1.  Ensure documentation-specific requirements are installed:

```shell
cd ..
pip install -r requirements/docs.txt
```

2.  To use the `fiftyone` repository to autogenerate docs, you need to add it
    to your `PYTHONPATH`:

```shell
export PYTHONPATH=$PYTHONPATH:/path/to/fiftyone
```

**Tip:** to avoid running this every time you build the docs, add the previous
line to your `~/.bashrc`, `~/.zshrc`, system path or the appropriate file for
your shell.

## Building

You can build the docs from source by running the `generate_docs.bash` script
in this folder:

```shell
bash docs/generate_docs.bash
```

A couple notable flags are supported:

-   `-c` performs a clean build by removing the `docs/build` folder beforehand.
    This is sometimes necessary to force updates, e.g. if you have edited a
    template and want to see how it affects pages whose source files haven't
    changed
-   `-s` will update static files only, i.e. `custom.css` and `custom.js`
    mentioned below
-   `-f` will perform a fast build, i.e. zoo and plugin docs will be skipped

## Contributing

### Main Content

The main content is located in the `docs/source` folder. The files are written
in [Sphinx RST format](https://sphinx-tutorial.readthedocs.io/step-1).

The API documentation is automatically generated from the Python source code,
whose docstrings are written in
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon) format.

Check out the existing patterns in the source files and you'll catch on.

### FiftyOne Brain

For Voxel51 developers who are working with a source install of the FiftyOne
Brain: the build script will automatically use your source install!

### Teams SDK

Voxel51 developers can include Teams SDK-related components in their local docs
build by including the `-t` flag:

```shell
bash docs/generate_docs.bash -t /path/to/fiftyone-teams
```

### Style Guide

All documentation, including RST and all code samples embedded in it, must
follow our [style guide](../STYLE_GUIDE.md#documentation-style-guide).

Note that pre-commit hooks will automatically enforce the whitespace-related
components of our style when you commit changes.

### Themes

Theme files are located in the `docs/theme` folder. However, you should prefer
to make changes in the following locations instead of the theme itself whenever
possible:

-   `docs/source/_static` contains `custom.css` and `custom.js` files, where
    any CSS overrides or custom JS should be added
-   `docs/source/_templates` contains HTML files (Jinja2 templates) that
    override theme templates of the same name. These should extend the theme
    templates - see the existing templates for how to do this. If you need to
    override part of the theme template that isn't conveniently marked as a
    block (and isn't a separate file that you can override), our convention is
    to add a block prefixed with `custom_` to the theme template, then override
    that block locally

To work on the theme JavaScript (not `custom.js`), you will need to install a
couple dependencies for the build process:

```sh
cd docs/theme
yarn install
```

A few commands are available:

-   `yarn build` bundles all JS files into the single file expected by the
    theme
-   `yarn deploy` builds and copies this file into the built documentation
    (which avoids the need to run `generate_docs.bash` again)
-   `yarn watch` re-runs `yarn deploy` whenever a JS source file changes
