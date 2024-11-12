<div align="center">
<p align="center">

<!-- prettier-ignore -->
<img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="55px"> &nbsp;
<img src="https://user-images.githubusercontent.com/25985824/106288518-24bb7680-6216-11eb-8f10-60052c519586.png" height="50px">

**The open-source tool for building high-quality datasets and computer vision
models**

---

<!-- prettier-ignore -->
<a href="https://voxel51.com/fiftyone">Website</a> •
<a href="https://voxel51.com/docs/fiftyone">Docs</a> •
<a href="https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb">Try it Now</a> •
<a href="https://voxel51.com/docs/fiftyone/tutorials/index.html">Tutorials</a> •
<a href="https://github.com/voxel51/fiftyone-examples">Examples</a> •
<a href="https://voxel51.com/blog/">Blog</a> •
<a href="https://slack.voxel51.com">Community</a>

[![PyPI python](https://img.shields.io/pypi/pyversions/fiftyone)](https://pypi.org/project/fiftyone)
[![PyPI version](https://badge.fury.io/py/fiftyone.svg)](https://pypi.org/project/fiftyone)
[![Downloads](https://static.pepy.tech/badge/fiftyone)](https://pepy.tech/project/fiftyone)
[![Docker Pulls](https://badgen.net/docker/pulls/voxel51/fiftyone?icon=docker&label=pulls)](https://hub.docker.com/r/voxel51/fiftyone/)
[![Build](https://github.com/voxel51/fiftyone/workflows/Build/badge.svg?branch=develop&event=push)](https://github.com/voxel51/fiftyone/actions?query=workflow%3ABuild)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://slack.voxel51.com)
[![Medium](https://img.shields.io/badge/Medium-12100E?logo=medium&logoColor=white)](https://medium.com/voxel51)
[![Mailing list](http://bit.ly/2Md9rxM)](https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk)
[![Twitter](https://img.shields.io/twitter/follow/Voxel51?style=social)](https://twitter.com/voxel51)

[![FiftyOne](https://voxel51.com/images/fiftyone_poster.png)](https://fiftyone.ai)

</p>
</div>

---

Nothing hinders the success of machine learning systems more than poor quality
data. And without the right tools, improving a model can be time-consuming and
inefficient.

[FiftyOne](https://fiftyone.ai) supercharges your machine learning workflows by
enabling you to visualize datasets and interpret models faster and more
effectively.

Use FiftyOne to get hands-on with your data, including visualizing complex
labels, evaluating your models, exploring scenarios of interest, identifying
failure modes, finding annotation mistakes, and much more!

You can get involved by joining our Slack community, reading our blog on
Medium, and following us on social media:

[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://slack.voxel51.com)
[![Medium](https://img.shields.io/badge/Medium-12100E?logo=medium&logoColor=white)](https://medium.com/voxel51)
[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?logo=twitter&logoColor=white)](https://twitter.com/voxel51)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?logo=linkedin&logoColor=white)](https://www.linkedin.com/company/voxel51)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?logo=facebook&logoColor=white)](https://www.facebook.com/voxel51)


## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Table of Contents

- [Table of Contents](#table-of-contents)
- [Prerequisites](#-prerequisites)
- [Installation](#-installation)
- [Quickstart](#-quickstart)
- [Documentation](#-documentation)
- [Examples](#-examples)
- [Contributing to fiftyone](#-contributing)
- [Installing from source](#-fromsource)
- [Troubleshooting](#-troubleshooting)
- [Contributors](#-contributors)
- [Citation](#-citation)
- [FAQ and additional resources](#-faq)

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-prerequisites'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Prerequisites

fiftyone requires Python, Git and other dependencies. To get started, select the guide for your operating system or environment:

| [Windows](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [Linux](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [macOS](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [NodeRed,js](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [CentOS](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [Azure ML](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [Docker](https://github.com/voxel51/fiftyone/blob/develop/README.md) | [Amazon SageMaker](https://github.com/voxel51/fiftyone/blob/develop/README.md) |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-installation'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Installation

You can install the latest stable version of FiftyOne via `pip`:

```shell
pip install fiftyone
```

Consult the
[installation guide](https://voxel51.com/docs/fiftyone/getting_started/install.html)
for troubleshooting and other information about getting up-and-running with
FiftyOne.

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-quickstart'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Quickstart

Dive right into FiftyOne by opening a Python shell and running the snippet
below, which downloads a
[small dataset](https://voxel51.com/docs/fiftyone/user_guide/dataset_zoo/datasets.html#quickstart)
and launches the
[FiftyOne App](https://voxel51.com/docs/fiftyone/user_guide/app.html) so you
can explore it:

```py
import fiftyone as fo
import fiftyone.zoo as foz

dataset = foz.load_zoo_dataset("quickstart")
session = fo.launch_app(dataset)
```

Then check out
[this Colab notebook](https://colab.research.google.com/github/voxel51/fiftyone-examples/blob/master/examples/quickstart.ipynb)
to see some common workflows on the quickstart dataset.

Note that if you are running the above code in a script, you must include
`session.wait()` to block execution until you close the App. See
[this page](https://voxel51.com/docs/fiftyone/user_guide/app.html#creating-a-session)
for more information.

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-documentation'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Documentation

Full documentation for FiftyOne is available at
[fiftyone.ai](https://fiftyone.ai). In particular, see these resources:

-   [Tutorials](https://voxel51.com/docs/fiftyone/tutorials/index.html)
-   [Recipes](https://voxel51.com/docs/fiftyone/recipes/index.html)
-   [User Guide](https://voxel51.com/docs/fiftyone/user_guide/index.html)
-   [CLI Documentation](https://voxel51.com/docs/fiftyone/cli/index.html)
-   [API Reference](https://voxel51.com/docs/fiftyone/api/fiftyone.html)


[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-examples'/>

## Examples

Check out the [fiftyone-examples](https://github.com/voxel51/fiftyone-examples)
repository for open source and community-contributed examples of using
FiftyOne.

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-contributing'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Contributing to FiftyOne

FiftyOne and [FiftyOne Brain](https://github.com/voxel51/fiftyone-brain) are
open source and community contributions are welcome!

Check out the
[contribution guide](https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md)
to learn how to get involved.


[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()

<div id='-fromsource'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Installing from source

The instructions below are for macOS and Linux systems. Windows users may need
to make adjustments. If you are working in Google Colab,
[skip to here](#source-installs-in-google-colab).

### Prerequisites

You will need:

-   [Python](https://www.python.org) (3.9 - 3.11)
-   [Node.js](https://nodejs.org) - on Linux, we recommend using
    [nvm](https://github.com/nvm-sh/nvm) to install an up-to-date version.
-   [Yarn](https://yarnpkg.com) - once Node.js is installed, you can
    [enable Yarn](https://yarnpkg.com/getting-started/install) via
    `corepack enable`
-   On Linux, you will need at least the `openssl` and `libcurl` packages. On
    Debian-based distributions, you will need to install `libcurl4` or
    `libcurl3` instead of `libcurl`, depending on the age of your distribution.
    For example:

```shell
# Ubuntu
sudo apt install libcurl4 openssl

# Fedora
sudo dnf install libcurl openssl
```

### Installation

We strongly recommend that you install FiftyOne in a
[virtual environment](https://voxel51.com/docs/fiftyone/getting_started/virtualenv.html)
to maintain a clean workspace.

First, clone the repository:

```shell
git clone https://github.com/voxel51/fiftyone
cd fiftyone
```

Then run the install script:

```shell
# Mac or Linux
bash install.bash

# Windows
.\install.bat
```

**NOTE:** If you run into issues importing FiftyOne, you may need to add the
path to the cloned repository to your `PYTHONPATH`:

```shell
export PYTHONPATH=$PYTHONPATH:/path/to/fiftyone
```

**NOTE:** The install script adds to your `nvm` settings in your `~/.bashrc` or
`~/.bash_profile`, which is needed for installing and building the App

**NOTE:** When you pull in new changes to the App, you will need to rebuild it,
which you can do either by rerunning the install script or just running
`yarn build` in the `./app` directory.

### Upgrading your source installation

To upgrade an existing source installation to the bleeding edge, simply pull
the latest `develop` branch and rerun the install script:

```shell
git checkout develop
git pull
bash install.bash
```

### Developer installation

If you would like to
[contribute to FiftyOne](https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md),
you should perform a developer installation using the `-d` flag of the install
script:

```shell
# Mac or Linux
bash install.bash -d

# Windows
.\install.bat -d
```

Although not required, developers typically prefer to configure their FiftyOne
installation to connect to a self-installed and managed instance of MongoDB,
which you can do by following
[these simple steps](https://docs.voxel51.com/user_guide/config.html#configuring-a-mongodb-connection).

### Source installs in Google Colab

You can install from source in
[Google Colab](https://colab.research.google.com) by running the following in a
cell and then **restarting the runtime**:

```shell
%%shell

git clone --depth 1 https://github.com/voxel51/fiftyone.git
cd fiftyone

# Mac or Linux
bash install.bash

# Windows
.\install.bat
```

### Docker installs

Refer to
[these instructions](https://voxel51.com/docs/fiftyone/environments/index.html#docker)
to see how to build and run Docker images containing source or release builds
of FiftyOne.

### Generating documentation

See the
[docs guide](https://github.com/voxel51/fiftyone/blob/develop/docs/README.md)
for information on building and contributing to the documentation.

### Uninstallation

You can uninstall FiftyOne as follows:

```shell
pip uninstall fiftyone fiftyone-brain fiftyone-db
```

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()
<div id='-contributors'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Contributors

Special thanks to these amazing people for contributing to FiftyOne! 🙌

<a href="https://github.com/voxel51/fiftyone/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=voxel51/fiftyone" />
</a>

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()
<div id='-citation'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> Citation

If you use FiftyOne in your research, feel free to cite the project (but only
if you love it 😊):

```bibtex
@article{moore2020fiftyone,
  title={FiftyOne},
  author={Moore, B. E. and Corso, J. J.},
  journal={GitHub. Note: https://github.com/voxel51/fiftyone},
  year={2020}
}
```

[![-----------------------------------------------------](https://github.com/user-attachments/assets/a8cf754d-fa86-4b29-9c3e-4ad64cf5c3dd)]()
<div id='-faq'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> FAQ & Additional Resources

- [FAQ](https://github.com/voxel51/fiftyone/issues): Reqport you issue in our Github repo.
- [fiftyone-team](https://github.com/voxel51/fiftyone-teams): Upgrade to FiftyOne Teams to enable multiple users to securely collaborate on the same datasets and models, either on-premises or in the cloud, all built on top of the open source FiftyOne workflows that you’re already relying on.
- [VoxelGPT](https://github.com/voxel51/voxelgpt): VoxelGPT is an open source plugin for FiftyOne that translates your natural language prompts into actions that organize and explore your data.
- [Plugins](https://voxel51.com/plugins/): Use FiftyOne Plugins to unlock infinite ways to extend and customize your AI workbench so you can save time, focus on building exceptional AI, and get to production faster.
- [Vector Search](https://voxel51.com/blog/the-computer-vision-interface-for-vector-search/): Vector search engines solve this problem by transforming complex data into entities called embedding vectors.
- [Dataset Zoo](https://docs.voxel51.com/dataset_zoo/index.html): The FiftyOne Dataset Zoo provides a powerful interface for downloading datasets and loading them into FiftyOne.
- [Model Zoo](https://docs.voxel51.com/model_zoo/index.html): The FiftyOne Model Zoo provides a powerful interface for downloading models and applying them to your FiftyOne datasets.
- [Fiftyone Brain](https://docs.voxel51.com/brain.html): The FiftyOne Brain provides powerful machine learning techniques that are designed to transform how you curate your data from an art into a measurable science.
