# FiftyOne

Project FiftyOne.

<img src="https://user-images.githubusercontent.com/3719547/74191434-8fe4f500-4c21-11ea-8d73-555edfce0854.png" alt="voxel51-logo.png" width="40%"/>

## Installing FiftyOne from source

This section explains how to install the development version of FiftyOne from
GitHub. This is necessary if you want to contribute to FiftyOne or use the
latest unreleased changes. If you simply want to install FiftyOne, see the
[FiftyOne documentation](https://voxel51.com/docs/fiftyone/getting_started/install.html)
instead.

This process currently targets macOS and Linux systems. Windows users may need
to make adjustments.

### Prerequisites

You will need:

-   [Python](https://www.python.org/) (3.5 or newer)
-   ETA - this is installed by `install.bash` below, but its
    [system requirements](https://github.com/voxel51/eta#local-installation)
    apply to FiftyOne as well.
-   [Node.js](https://nodejs.org/) - on Linux, we recommend using
    [nvm](https://github.com/nvm-sh/nvm) to obtain an up-to-date version.
-   [Yarn](https://yarnpkg.com/) - once Node.js is installed, install this with
    `npm install -g yarn`
-   On Linux, you will need at least the `openssl` and `libcurl` packages. On
    Debian-based distributions, you will need to install `libcurl4` or
    `libcurl3` instead of `libcurl`, depending on the age of your distribution.
    For example:

    ```shell
    # Ubuntu 18.04
    sudo apt install libcurl4 openssl
    # Fedora 32
    sudo dnf install libcurl openssl
    ```

### Installation

We strongly recommend that you install FiftyOne in a
[virtual environment](https://voxel51.com/docs/fiftyone/getting_started/virtualenv.html)
to maintain a clean workspace.

1. Clone the repository:

    ```shell
    git clone --recursive https://github.com/voxel51/fiftyone
    cd fiftyone
    ```

2. Run the installation script:

    ```shell
    bash install.bash
    ```

If you want to use the `fiftyone-brain` package, you will need to install it
separately after installing FiftyOne:

```shell
pip install --index https://pypi.voxel51.com fiftyone-brain
```

These steps will perform a lite ETA installation, which should be sufficient
for most users. If you want a full ETA installation, or want to customize your
ETA installation, see the instructions in the
[ETA readme](https://github.com/voxel51/eta/blob/develop/README.md). Note that
you will need to enter the `eta` folder before running its installation script.

### Developer installation

If you are a developer contributing to FiftyOne or generating its documentation
from source, you should perform a developer installation using the `-d` flag of
the install script:

```shell
bash install.bash -d
```

You should also check out the
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
