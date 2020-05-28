# FiftyOne Installation Guide

This document describes how to install FiftyOne in a
[virtual environment](https://docs.python.org/3/tutorial/venv.html). Using a
virtual environment is strongly recommended because it allows maintaining an
isolated environment in which FiftyOne and its dependencies can be installed.
FiftyOne has many dependencies, some versions of which may conflict with
versions already installed on your machine.

## Prerequisites

Before starting this guide, you will need a working Python installation.
FiftyOne currently requires **Python 3.6** or newer. On Linux, we recommended
installing Python through your system package manager (APT, YUM, etc.) if it is
available. On other platforms, Python can be downloaded
[from python.org](https://www.python.org/downloads/). To verify that a suitable
Python version is installed and accessible, run `python3 --version` or
`python --version`.

This guide also assumes that you are comfortable using a command line for basic
operations (running commands, moving between folders, etc.).

## Creating a virtual environment

First, identify a suitable Python executable. On many systems, this will be
`python3`, but it may be `python` on other systems instead. To confirm your
Python version, pass `--version` to Python. Here is example output from running
these commands:

```sh
$ python --version
Python 2.7.17
$ python3 --version
Python 3.6.9
```

In this case, `python3` should be used in the next step.

Navigate to a folder where you would like to install the virtual environment
(this folder can be empty). Using the suitable Python version you have
identified, run the following to create a virtual environment (replace
`python3` at the beginning of a command if your Python executable has a
different name):

```sh
python3 -m venv env
```

This will create a new virtual environment in the `env` folder, with standalone
copies of Python and pip, as well as an isolated location to install packages
to. However, this environment will not be used until it is _activated_. To
activate the virtual environment, run the following command (do not omit the
leading `.` or space):

```
. env/bin/activate
```

After running this command, your shell prompt should begin with `(env)`, which
indicates that the virtual environment has been activated. This state will only
affect your current shell, so if you start a new shell, you will need to
activate the virtual environment again to use it. When the virtual environment
is active, `python` without any suffix will refer to the Python version you
used to create the virtual environment, so you can use this for the remainder
of this guide. For example:

```sh
$ python --version
Python 3.6.9
```

Also note that `python` and `pip` live inside the `env` folder (in this output,
the path to the current folder is replaced with `...`):

```sh
$ which python
.../env/bin/python
$ which pip
.../env/bin/pip
```

Before you continue, you should upgrade `pip` and some related packages in the
virtual environment. FiftyOne's packages rely on some newer pip features, so
older pip versions may fail to locate a downloadable version of FiftyOne
entirely. To upgrade, run the following command:

```sh
pip install --upgrade pip setuptools wheel
```

### More virtual environment resources

If you ever want to leave an activated virtual environment and return to using
your system-wide Python installation, run `deactivate`.

There are lots of ways to set up and work with virtual environments, some of
which are listed here. These may be particularly useful to review if you are
dealing with virtual environments frequently:

-   The `venv` module used in this guide is documented
    [here](https://docs.python.org/3/library/venv.html), with information on
    additional arguments that the `venv` command accepts.
-   There is a similar
    ["virtualenv" package](https://pypi.org/project/virtualenv/) (installable
    with `pip`) that supports older Python versions.
-   [virtualenvwrapper](https://virtualenvwrapper.readthedocs.io/en/latest/)
    adds some convenient shell support for creating and managing virtual
    environments.

## Installing FiftyOne

To install FiftyOne in a virtual environment, ensure that the virtual
environment is active as described in the previous section, then run:

```sh
pip install --index https://pypi.voxel51.com fiftyone
```

This will install FiftyOne and all of its dependencies, which may take some
time. Once this has completed, you can verify that FiftyOne is installed in
your virtual environment:

```
$ python
Python 3.6.9 (default, Apr 18 2020, 01:56:04)
[GCC 8.4.0] on linux
Type "help", "copyright", "credits" or "license" for more information.
>>> import fiftyone as fo
>>> fo.__file__
'.../env/lib/python3.X/site-packages/fiftyone/__init__.py'
>>> session = fo.launch_dashboard()
>>> exit()
```

Once FiftyOne is installed, you can proceed with any of the
[examples](examples/index) in the documentation. The
["Fifteen minutes to FiftyOne" walkthrough](examples/fifteen_to_fiftyone) is a
good place to start.

## Installing extra packages

Note that you may want to install additional packages in the virtual
environment (with `pip install` followed by the given package names):

-   `ipython` to follow along with interactive examples more easily
-   `tensorflow` for examples requiring TensorFlow (depending on your system,
    other versions may be required)
-   `tensorflow-datasets` for examples that rely on loading TensorFlow datasets
-   `torch` and `torchvision` for examples requiring PyTorch

For your own work, FiftyOne does not strictly require any of these packages, so
you can install only what you need.

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
