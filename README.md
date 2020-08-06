# FiftyOne

<img src="https://user-images.githubusercontent.com/25985824/89583450-5b38ab80-d808-11ea-909e-4fa8bc366d7f.png" alt="FiftyOne"/>

## Installation

Clone the repository:

```shell
git clone https://github.com/voxel51/fiftyone
cd fiftyone
```

and install it:

```shell
bash install.bash
```

We strongly recommend that you install FiftyOne in a
[virtual environment](https://virtualenv.pypa.io/en/stable) to maintain a clean
workspace.

### Developer installation

If you are a developer contributing to FiftyOne or generating its documentation
from source, you should perform a developer installation using the `-d` flag of
the install script:

```shell
bash install.bash -d
```

You should also checkout the
[Developer's Guide](https://github.com/voxel51/fiftyone/blob/develop/docs/dev_guide.md)
to get started.

## Quickstart

Get your feet wet with FiftyOne by running some of examples in the
[examples folder](https://github.com/voxel51/fiftyone/tree/develop/examples).

### CLI

Installing FiftyOne automatically installs `fiftyone`, a command-line interface
(CLI) for interacting with FiftyOne. To explore the CLI, type
`fiftyone --help`.

## Generating Documentation

This project uses
[Sphinx-Napoleon](https://pypi.python.org/pypi/sphinxcontrib-napoleon) to
generate its documentation from source.

To generate the documentation, you must install the developer dependencies by
running the `install.bash` script with the `-d` flag.

Then you can generate the docs by running:

```shell
bash docs/generate_docs.bash
```

To view the documentation, open the `docs/build/html/index.html` file in your
browser.

The
[Developer's Guide](https://github.com/voxel51/fiftyone/blob/develop/docs/dev_guide.md#Documentation)
has more information on working with the documentation.

## Uninstallation

```shell
pip uninstall fiftyone
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
