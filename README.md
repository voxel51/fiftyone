# [FiftyOne](http://www.voxel51.com/fiftyone): Explore, Analyze and Curate Your Visual Data

<img src="https://user-images.githubusercontent.com/25985824/89583450-5b38ab80-d808-11ea-909e-4fa8bc366d7f.png" alt="FiftyOne"/>

[FiftyOne](http://www.voxel51.com/docs/fiftyone) is a machine learning tool that helps you get closer to your data. Rapidly experiment with and iterate on your visual data without wrangling or custom scripting. [FiftyOne](http://www.voxel51.com/docs/fiftyone) is lightweight, with core functionalities that are open sourced, to enable you to quantitatively analyze which data will be most valuable in solving your ML problems. 

Check it out here: http://www.voxel51.com/fiftyone


## Table of Contents

- [Core Features](#core-features)
- [Getting Started](#getting-started)
- [Community](#community)
- [Install from source](#installing-fiftyone-from-source)
- [Uninstall](#uninstallation)


## Core Features
* Find annotation mistakes
* Remove redundant images for a unique, diverse dataset
* Bootstrap a dataset from raw images
* Identify optimal samples to add to your training dataset
* Hands on evaluation of your model 


## Getting Started

### Installation

Install [FiftyOne](http://www.voxel51.com/docs/fiftyone) in just minutes with two lines of code.

```python
pip install --upgrade pip setuptools wheel
pip install --index https://pypi.voxel51.com fiftyone
```

Our [Install Guide](https://voxel51.com/docs/fiftyone/getting_started/install.html) is a helpful resource for getting FiftyOne up and running.  

### Documentation


For [Tutorials](https://voxel51.com/docs/fiftyone/tutorials/index.html), [Recipes](https://voxel51.com/docs/fiftyone/recipes/index.html), and a [User Guide](https://voxel51.com/docs/fiftyone/user_guide/index.html), go to our official [FiftyOne Documentation](https://voxel51.com/docs/fiftyone/). 


## Community
To keep up to date on all things FiftyOne, collaborate with other FiftyOne users, and get support from the Voxel51 Team, join our [FiftyOne Slack Community](https://join.slack.com/t/fiftyone-users/shared_invite/zt-g9w0pu1f-ZMJjRfGDrTmCT2ZOutUApQ).

Check out our [Voxel51 Blog](https://medium.com/voxel51) for regular posts on computer vision, machine learning, and data science topics and follow us on social media. 


<a href="http://www.twitter.com/voxel51" rel="twitter"><img src="https://github.com/voxel51/fiftyone/blob/readme/docs/source/_static/images/icons/logo-twitter-dark.svg" width="20" height="20" /></a>
<a href="http://www.facebook.com/voxel51" rel="facebook"><img src="https://github.com/voxel51/fiftyone/blob/readme/docs/source/_static/images/icons/logo-facebook-dark.svg" width="20" height="20" /></a>


## Installing FiftyOne from source

This section explains how to install the development version of [FiftyOne](http://www.voxel51.com/docs/fiftyone) from
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

### Installation from source

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


### Generating Documentation

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
pip uninstall fiftyone fiftyone-brain fiftyone-db fiftyone-gui
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com

<a href="http://www.twitter.com/voxel51" rel="twitter"><img src="https://github.com/voxel51/fiftyone/blob/readme/docs/source/_static/images/icons/logo-twitter-dark.svg" width="20" height="20" /></a>
<a href="http://www.facebook.com/voxel51" rel="facebook"><img src="https://github.com/voxel51/fiftyone/blob/readme/docs/source/_static/images/icons/logo-facebook-dark.svg" width="20" height="20" /></a>
