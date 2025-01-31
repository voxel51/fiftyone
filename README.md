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
[![Discord](https://img.shields.io/badge/Discord-7289DA?logo=discord&logoColor=white)](https://discord.gg/fiftyone-community)
[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://slack.voxel51.com)
[![Medium](https://img.shields.io/badge/Medium-12100E?logo=medium&logoColor=white)](https://medium.com/voxel51)
[![Mailing list](http://bit.ly/2Md9rxM)](https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk)
[![Twitter](https://img.shields.io/twitter/follow/Voxel51?style=social)](https://twitter.com/voxel51)

</p>
</div>

# 👋 hey there!

We created an open-source tool that supercharges your computer vision and
machine learning workflows by enabling you to visualize datasets, analyze
models, and improve data quality more efficiently than ever before. Embark with
us in this adventure 🤝. **[FiftyOne](https://fiftyone.ai)**.

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> **installation** 💻

As simple as:

```shell
pip install fiftyone
```

<details>
<summary>More details here</summary>

**FiftyOne** supports Python 3.9 - 3.11. See the
[prerequisites section](#-prerequisites) for system specific information. We
provide two ways for being installed. The first one is through PyPI, and the
second is through a local installation. PyPI is the straight forward
installation method if you are not looking for any changes in the source code,
if you want to make changes to the source code, then a local installation is
recommended.

We strongly recommend that you install FiftyOne in a
[virtual environment](https://voxel51.com/docs/fiftyone/getting_started/virtualenv.html)
to maintain a clean workspace. The [prerequisites section](#-prerequisites)
also contains instructions for creating system specific virtual environments.

Installing the library from PyPI with `pip` is the easiest way to get started
with fiftyone. You can install the latest stable version of `fiftyone` via
`pip`:

Consult the
[installation guide](https://voxel51.com/docs/fiftyone/getting_started/install.html)
for troubleshooting and other information about getting up-and-running with
FiftyOne.

</details>

<details>
<summary>Install from source</summary>

To install from source, you need to clone the repository and install the
library using `pip` with editable mode enabled. The instructions below are for
macOS and Linux systems. Windows users may need to make adjustments. If you are
working in Google Colab, [skip to here](#source-installs-in-google-colab).

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

### Generating documentation

See the
[docs guide](https://github.com/voxel51/fiftyone/blob/develop/docs/README.md)
for information on building and contributing to the documentation.

### Uninstallation

You can uninstall FiftyOne as follows:

```shell
pip uninstall fiftyone fiftyone-brain fiftyone-db
```

</details>

<div id='-prerequisites'/>

<details>
<summary>Prerequisites for beginners</summary>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> prerequisites for beginners 🧸

**FiftyOne** supports Python 3.9 - 3.11. To get started, select the guide for
your operating system or environment, if you are an experienced developer you
can skip this section. If you are looking for scaling solution to be installed
in Cloud Enterprise Systems, please take a look of **FiftyOne Teams**
[here](https://voxel51.com/book-a-demo/)

<details>
<summary>Windows</summary>

<div id='-prerequisites_windows'/>

### 1. Install Python and Git

#### 1.1 Install Python

**Note:** ⚠️ The version of Python that is available in the Microsoft Store is
**not recommended**.

Download a Python installer from
[python.org](https://www.python.org/downloads/). Choose Python **3.9**,
**3.10**, or **3.11** and make sure to pick a **64-bit** version. For example,
this
[Python 3.10.11 installer](https://www.python.org/ftp/python/3.10.11/python-3.10.11-amd64.exe).
Double-click on the installer to run it, and follow the steps in the installer.

-   **Check the box to add Python to your PATH**, and to install py.
-   At the end of the installer, there is an option to **disable the PATH
    length limit**. It is recommended to click this.

#### 1.2 Install Git

Download Git from [this link](https://git-scm.com/download/win). Double-click
on the installer to run it, and follow the steps in the installer.

### 2. Install Microsoft Visual C++ Redistributable and FFmpeg (Optional)

Download
[Microsoft Visual C++ Redistributable](https://learn.microsoft.com/en-us/cpp/windows/latest-supported-vc-redist).
Double-click on the installer to run it, and follow the steps in the installer.

#### Install FFmpeg

Download FFmpeg binary from [here](https://ffmpeg.org/download.html). Set
FFmpeg's path (e.g., C:\ffmpeg\bin) to the PATH environmental variable on
Windows.

### 3. Create a Virtual Environment

-   Press `Win + R`. type `cmd`, and press `Enter`. Alternatively, search
    **Command Prompt** in the Start Menu.
-   Navigate to your project. ` cd C:\path\to\your\project`
-   Create the environment `python -m venv fiftyone_env`
-   Activate the environment typing this in the command line window
    `fiftyone_env\Scripts\activate`
-   After activation, your command prompt should change and show the name of
    the virtual environment `(fiftyon_env) C:\path\to\your\project`
-   Now you are ready to install **FiftyOne**. Full instructions can be found
    [here](#-installation).
-   Once you want to deactivate your environment, just type `deactivate`

</details>

<details>
<summary>Linux</summary>

<div id='-prerequisites_linux'/>

### 1. Install Python and Git

You may need to install some additional libraries on Ubuntu Linux. These steps
work on a clean install of Ubuntu Desktop 24.04, and should also work on Ubuntu
24.04 and 22.04, and on Ubuntu Server.

```shell
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install python3-venv build-essential python3-dev git-all libgl1-mesa-dev ffmpeg
```

-   On Linux, you will need at least the `openssl` and `libcurl` packages.
-   On Debian-based distributions, you will need to install `libcurl4`
    or`libcurl3` instead of `libcurl`, depending on the age of your
    distribution.

    For example:

```shell
# Ubuntu
sudo apt install libcurl4 openssl

# Fedora
sudo dnf install libcurl openssl
```

### 2. Create and activate the Virtual Environment

```shell
python3 -m venv fiftyone_env
source fiftyone_env/bin/activate
```

Now you are ready to install **FiftyOne**. Full instructions can be found
[here](#-installation)

</details>

<details>
<summary>MacOS</summary>

<div id='-prerequisites_macos'/>

### 1. Install Xcode Command Line Tools

```shell
xcode-select --install
```

### 2. Install Homebrew

```shell
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

After you install it, follow the instructions from the Homebrew installation to
set it up.

### 3. Install Python and dependencies

```shell
brew install python@3.9
brew install protobuf

# optional but recommendeded for full video dataset support
brew install ffmpeg
```

### 4. Create and activate the Virtual Environment

```shell
python3 -m venv fiftyone_env
source fiftyone_env/bin/activate
```

Now you are ready to install **FiftyOne**. Full instructions can be found
[here](#-installation).

</details>

<details>
<summary>Docker</summary>

<div id='-prerequisites_docker'/>

Refer to
[these instructions](https://voxel51.com/docs/fiftyone/environments/index.html#docker)
to see how to build and run Docker images containing source or release builds
of FiftyOne.

</details>

<div align="center">
<p align="center">

| [Windows](#-prerequisites_windows) | [Linux](#-prerequisites_linux) | [macOS](#-prerequisites_macos) | [Docker](#-prerequisites_docker) |
| ---------------------------------- | ------------------------------ | ------------------------------ | -------------------------------- |

</p>
</div>

**Important Notes:** Remember, you will need...

-   [Python](https://www.python.org) (3.9 - 3.11)
-   [Node.js](https://nodejs.org) - on Linux, we recommend using
    [nvm](https://github.com/nvm-sh/nvm) to install an up-to-date version.
-   [Yarn](https://yarnpkg.com) - once Node.js is installed, you can
    [enable Yarn](https://yarnpkg.com/getting-started/install) via
    `corepack enable`

</details>

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> **quickstart** 🚀

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

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> **key features** 🔑

-   **[Visualize Complex Datasets:](https://docs.voxel51.com/user_guide/app.html)**
    Easily explore images, videos, and associated labels in a powerful visual
    interface.

https://github.com/user-attachments/assets/bd53e964-81a9-4e31-b719-28cf66dae19f

-   **[Explore Embeddings:](https://docs.voxel51.com/user_guide/app.html#embeddings-panel)**
    Select points of interest and view the corresponding samples/labels.

https://github.com/user-attachments/assets/7701deff-3317-410a-947c-b6cb293b8e7b

-   **[Analyze and Improve Models:](https://docs.voxel51.com/user_guide/evaluation.html)**
    Evaluate model performance, identify failure modes, and fine-tune your
    models.

https://github.com/user-attachments/assets/fc06d33d-8d17-4f67-af26-8c1a5abb5d9d

-   **[Advanced Data Curation:](https://docs.voxel51.com/brain.html)** Quickly
    find and fix data issues, annotation errors, and edge cases.

https://github.com/user-attachments/assets/da97d84d-1213-40cf-a501-7a0d7efbe426

-   **[Rich Integration:](https://docs.voxel51.com/integrations/index.html)**
    Works with popular deep learning libraries like TensorFlow, PyTorch, Keras,
    and more.

-   **[Open and Extensible](https://docs.voxel51.com/plugins/index.html)**
    Customize and extend FiftyOne to fit your specific needs.

https://github.com/user-attachments/assets/dd91272d-2808-4373-90c5-5e906a0b80f1

<div align="center">
<p align="center">

### <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> additional resources 🚁

| [fiftyone-teams](#-teams) | [VoxelGPT](https://github.com/voxel51/voxelgpt) | [Plugins](https://voxel51.com/plugins/) | [Vector Search](https://voxel51.com/blog/the-computer-vision-interface-for-vector-search/) | [Dataset Zoo](https://docs.voxel51.com/dataset_zoo/index.html) | [Model Zoo](https://docs.voxel51.com/model_zoo/index.html) | [FiftyOne Brain](https://docs.voxel51.com/brain.html) |
| ------------------------- | ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |

</p>
</div>

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

<div id='-documentation'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> documentation 🪪

Full documentation for FiftyOne is available at
[fiftyone.ai](https://fiftyone.ai). In particular, see these resources:

<div align="center">
<p align="center">

| [Tutorials](https://voxel51.com/docs/fiftyone/tutorials/index.html) | [Recipes](https://voxel51.com/docs/fiftyone/recipes/index.html) | [Examples](https://github.com/voxel51/fiftyone-examples) | [User Guide](https://voxel51.com/docs/fiftyone/user_guide/index.html) | [CLI Documentation](https://voxel51.com/docs/fiftyone/cli/index.html) | [API Reference](https://voxel51.com/docs/fiftyone/api/fiftyone.html) |
| ------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |

</p>
</div>

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

<div id='-teams'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> FiftyOne Teams 🏎️

Do you need to securely collaborate on datasets with millions of samples in the
cloud and leverage built-in workflow automations? Check out
[FiftyOne Teams](https://github.com/voxel51/fiftyone-teams).

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> faq & troubleshooting ⛓️‍💥

[This page](https://docs.voxel51.com/getting_started/troubleshooting.html)
lists common issues encountered when installing FiftyOne and possible
solutions. If you encounter an issue that this page doesn’t help you resolve,
feel free to
[open an issue on GitHub](https://github.com/voxel51/fiftyone/issues) or
contact us on [Slack](https://slack.voxel51.com/) or
[Discord](https://discord.gg/fiftyone-community).

[FAQ](https://docs.voxel51.com/faq/index.html): Maybe you are facing a
situation already solved, take a look of the frequently asked questions.

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

<div id='-contributing'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> contributing to FiftyOne 🧡

FiftyOne and [FiftyOne Brain](https://github.com/voxel51/fiftyone-brain) are
open source and community contributions are welcome!

Check out the
[contribution guide](https://github.com/voxel51/fiftyone/blob/develop/CONTRIBUTING.md)
to learn how to get involved.

<div align="center">
<p align="center">

### 🤝 **Join Our Community** 🤝

Connect with us through your preferred channels:

[![Discord](https://img.shields.io/badge/Discord-7289DA?logo=discord&logoColor=white)](https://discord.gg/fiftyone-community)
[![Slack](https://img.shields.io/badge/Slack-4A154B?logo=slack&logoColor=white)](https://slack.voxel51.com)
[![Medium](https://img.shields.io/badge/Medium-12100E?logo=medium&logoColor=white)](https://medium.com/voxel51)
[![Twitter](https://img.shields.io/badge/Twitter-1DA1F2?logo=twitter&logoColor=white)](https://twitter.com/voxel51)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0077B5?logo=linkedin&logoColor=white)](https://www.linkedin.com/company/voxel51)
[![Facebook](https://img.shields.io/badge/Facebook-1877F2?logo=facebook&logoColor=white)](https://www.facebook.com/voxel51)

**Share your workflow improvements on social media and tag us @Voxel51 and
#FiftyOne!**.

🎊 You will be in our rewarded list. 🎊

</p>
</div>

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

<div id='-contributors'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> contributors 🤓

Special thanks to these amazing people for contributing to FiftyOne! 🙌

<a href="https://github.com/voxel51/fiftyone/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=voxel51/fiftyone" />
</a>

![------------------------------------------------------------------](https://github.com/user-attachments/assets/fb0573d0-bb56-40ff-9ae1-a5e8f62f5f42)

<div id='-citation'/>

## <img src="https://user-images.githubusercontent.com/25985824/106288517-2422e000-6216-11eb-871d-26ad2e7b1e59.png" height="20px"> citation 📖

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
