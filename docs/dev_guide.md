# FiftyOne Developer's Guide

This document describes best practices for contributing to the FiftyOne
codebase.

We currently follow all of the practices established in
[ETA](https://github.com/voxel51/eta) for the Python code in this repository,
so this guide is mostly pointers to the relevant resources there.

> Happy exception: FiftyOne is strictly Python 3 code, so we do not follow the
> Python 2 compability instructions in ETA!

## Coding style

-   [Python style guide](https://github.com/voxel51/eta/blob/develop/docs/python_style_guide.md)
-   [Linting guide](https://github.com/voxel51/eta/blob/develop/docs/linting_guide.md)
-   [Logging guide](https://github.com/voxel51/eta/blob/develop/docs/logging_guide.md)
-   [Markdown style guide](https://github.com/voxel51/eta/blob/develop/docs/markdown_style_guide.md)

## Documentation

`docs/generate_docs.bash` is the script used to build the documentation. You
will need `fiftyone` and `fiftyone-brain` installed in your environment for it
to work. A few flags are supported:

-   `-c` performs a clean build by removing the docs/build folder beforehand.
    This is sometimes necessary to force updates, e.g. if you have edited a
    template and want to see how it affects pages whose source files haven't
    changed.
-   `-s` will update static files only (i.e. `custom.css` and `custom.js`
    mentioned below).

Theme files are located in the `docs/theme` folder. However, you should prefer
to make changes in the following locations instead of the theme itself whenever
possible:

-   `docs/source/_static` contains `custom.css` and `custom.js` files, where
    any CSS overrides or custom JS should be added.
-   `docs/source/_templates` contains HTML files (Jinja2 templates) that
    override theme templates of the same name. These should extend the theme
    templates - see the existing templates for how to do this. If you need to
    override part of the theme template that isn't conveniently marked as a
    block (and isn't a separate file that you can override), our convention is
    to add a block prefixed with `custom_` to the theme template, then override
    that block locally.

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

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
