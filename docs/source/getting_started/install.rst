FiftyOne Installation
=====================

.. default-role:: code

.. toctree::
  :hidden:

  Virtual environments <virtualenv>

Prerequisites
-------------

You will need a working Python installation. FiftyOne currently requires
**Python 3.6** or newer. On Linux, we recommended installing Python through
your system package manager (APT, YUM, etc.) if it is available. On other
platforms, Python can be downloaded
`from python.org <https://www.python.org/downloads>`_. To verify that a
suitable Python version is installed and accessible, run `python3 --version`
or `python --version`.

We encourage installing FiftyOne in a virtual environment. See
:doc:`setting up a virtual environment <virtualenv>` for more details.

.. _installing-fiftyone:

Installing FiftyOne
-------------------

.. note::

  **FiftyOne is currently in private beta!** If you have registered, your
  welcome email contains a token that you will need to run some of the commands
  below. Replace all instances of ``YOUR_TOKEN`` below with your token.

  If you haven't registered for the FiftyOne Beta,
  `you can sign up here! <https://share.hsforms.com/1KuTDtQYWRTyU0yHNGgBFfw2ykyk>`_

To install FiftyOne in a virtual environment, ensure you have activated any
virtual environment that you are using, then run:

.. code-block:: shell

   pip install --upgrade pip setuptools wheel
   pip install --index https://YOUR_TOKEN@pypi.voxel51.com fiftyone

This will install FiftyOne and all of its dependencies, which may take some
time. Once this has completed, you can verify that FiftyOne is installed in
your virtual environment by importing the `fiftyone` package:

.. code-block:: text

   $ python
   Python 3.6.9 (default, Apr 18 2020, 01:56:04)
   [GCC 8.4.0] on linux
   Type "help", "copyright", "credits" or "license" for more information.
   >>>
   >>> import fiftyone as fo
   >>>

A successful installation of FiftyOne should result in no output when
`fiftyone` is imported. See below for help with troubleshooting error
messages that you may encounter.

**Mac users:**

- You must have the
  `XCode Command Line Tools <https://developer.apple.com/library/archive/technotes/tn2339/_index.html>`_
  package installed on your machine. You likely already have it, but if you
  encounter an error message like
  `error: command 'clang' failed with exit status 1`, then you may need to
  install it via `xcode-select --install`, or see
  `this page <https://stackoverflow.com/q/9329243>`_ for other options.

**Linux users:**

- The ``psutil`` package may require Python headers to be installed on your
  system. On Debian-based distributions, these are available in the
  ``python3-dev`` package.
- If you encounter an error related to MongoDB failing to start, such as `Could
  not find mongod`, you may need to install additional packages. See the
  `troubleshooting section <#troubleshooting>`_ for details.

**Windows users:**

- If you encounter errors related to missing `msvcp140.dll`, you will need to
  install the 64-bit Visual Studio 2015 C++ redistributable library,
  `available here <https://www.microsoft.com/en-us/download/details.aspx?id=48145>`_
  (choose the x64 version).

Installing extra packages
-------------------------

Various tutorials and guides that we provide on this site require additional
packages in order to run. If you encounter a missing package, you will see
helpful instructions on what you need to install. Alternatively, you can
preemptively install what you'll need by installing the following additional
packages via `pip` in your virtual environment:

* `ipython` to follow along with interactive examples more easily
* `tensorflow` for examples requiring TensorFlow. The installation process
  can vary depending on your system, so consult the
  `Tensorflow documentation <https://www.tensorflow.org/install>`_ for specific
  instructions.
* `tensorflow-datasets` for examples that rely on loading
  `TensorFlow datasets <https://www.tensorflow.org/datasets>`_
* `torch` and `torchvision` for examples requiring PyTorch. The installation
  process can vary depending on your system, so consult the
  `PyTorch documentation <https://pytorch.org/get-started/locally/>`_ for
  specific instructions.

For your own work, FiftyOne does not strictly require any of these packages, so
you can install only what you need.

Upgrading FiftyOne
------------------

Passing the `--upgrade` (or `-U`) option to `pip install` can be used to
upgrade an existing FiftyOne installation:

.. code-block:: shell

   pip install --index https://YOUR_TOKEN@pypi.voxel51.com --upgrade fiftyone

Uninstalling FiftyOne
---------------------

FiftyOne and all of its subpackages can be uninstalled with:

.. code-block:: shell

   pip uninstall fiftyone fiftyone-brain fiftyone-db fiftyone-gui

Troubleshooting
---------------

Installing MongoDB on Linux
^^^^^^^^^^^^^^^^^^^^^^^^^^^

FiftyOne relies on a version of MongoDB that works on Ubuntu 18.04 and several
other modern distributions. If this version does not work on your distribution,
there are alternative builds available, or you can use an existing installation
of MongoDB.

Alternative builds
~~~~~~~~~~~~~~~~~~

Alternative builds are available as pip packages for the distributions listed
below, and can be installed by running the corresponding command. Note that
these packages must be installed *after* the `fiftyone` package; if you install
`fiftyone` afterwards, you can fix your MongoDB installation by adding
`--force-reinstall` to the commands below.

.. tabs::

  .. tab:: Ubuntu 16.04

    .. code-block:: shell

      pip install --index https://YOUR_TOKEN@pypi.voxel51.com fiftyone-db-ubuntu1604

  .. tab:: Debian 9

    .. code-block:: shell

      pip install --index https://YOUR_TOKEN@pypi.voxel51.com fiftyone-db-debian9

Manual installation
~~~~~~~~~~~~~~~~~~~

FiftyOne also supports using an existing MongoDB installation (version 3.6 or
newer). This can be installed through many distributions' package managers.
Note that only the `mongod` (server) binary is required, so you may not need
the complete MongoDB package. For example, Debian-based distributions make this
available in the `mongodb-server` package.

If your distribution does not provide a new-enough version of MongoDB, or if
you would like to install a newer version, see
`the MongoDB documentation <https://docs.mongodb.com/manual/administration/install-on-linux/>`_
for instructions on installing MongoDB on your distribution. Note that you only
need the `mongodb-org-server` package in this case.

To verify the version of your MongoDB installation, run `mongod --version`,
which should produce output that looks like this:

.. code-block:: text

   db version v4.2.6
   git version: 20364840b8f1af16917e4c23c1b5f5efd8b352f8
   OpenSSL version: OpenSSL 1.1.1  11 Sep 2018
   allocator: tcmalloc
   modules: none
   build environment:
       distmod: ubuntu1804
       distarch: x86_64
       target_arch: x86_64

Verify that the version after "db version" is at least 3.6.
