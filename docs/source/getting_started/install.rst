FiftyOne Installation
=====================

.. default-role:: code

.. toctree::
  :hidden:

  Virtual environments <virtualenv>
  Troubleshooting <troubleshooting>

.. note::

    FiftyOne is rapidly growing.
    `Sign up for the mailing list <https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk>`_
    so we can keep you posted on new features as they come out!

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

To install FiftyOne, ensure you have activated any virtual environment that you
are using, then run:

.. code-block:: shell

   pip install --upgrade pip setuptools wheel
   pip install --index https://pypi.voxel51.com fiftyone

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
`fiftyone` is imported.

.. _fiftyone-quickstart:

Quickstart
----------

.. note::

    Get started in seconds by running the quickstart!

Dive right into FiftyOne by running the command below. It will download a small
dataset, launch the App, and print some suggestions for exploring the dataset!

.. code-block:: shell

    # Launch the FiftyOne quickstart
    fiftyone quickstart

.. _install-troubleshooting:

Troubleshooting
---------------

If you run into any installation issues, review the suggestions below or check
the :ref:`troubleshooting page <troubleshooting>` for more details.

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
  :ref:`troubleshooting page <troubleshooting-mongodb-linux>` for details.

**Windows users:**

- If you encounter errors related to missing `msvcp140.dll`, you will need to
  install the 64-bit Visual Studio 2015 C++ redistributable library,
  `available here <https://www.microsoft.com/en-us/download/details.aspx?id=48145>`_
  (choose the x64 version).

.. _installing-extras:

Installing extra packages
-------------------------

Various tutorials and guides that we provide on this site require additional
packages in order to run. If you encounter a missing package, you will see
helpful instructions on what you need to install. Alternatively, you can
preemptively install what you'll need by installing the following additional
packages via `pip` in your virtual environment:

* `ipython` to follow along with interactive examples more easily (note that
  a system-wide IPython installation will *not* work in a virtual environment,
  even if it is accessible)
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

.. _upgrading-fiftyone:

Upgrading FiftyOne
------------------

Passing the `--upgrade` (or `-U`) option to `pip install` can be used to
upgrade an existing FiftyOne installation:

.. code-block:: shell

   pip install --index https://pypi.voxel51.com --upgrade fiftyone

.. _uninstalling-fiftyone:

Uninstalling FiftyOne
---------------------

FiftyOne and all of its subpackages can be uninstalled with:

.. code-block:: shell

   pip uninstall fiftyone fiftyone-brain fiftyone-db fiftyone-gui
