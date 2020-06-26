Installing FiftyOne
===================

.. default-role:: code

This page describes how to install FiftyOne in a
`virtual environment <https://docs.python.org/3/tutorial/venv.html>`_.

Using a virtual environment is strongly recommended because it allows
maintaining an isolated environment in which FiftyOne and its dependencies can
be installed. FiftyOne has many dependencies, some versions of which may
conflict with versions already installed on your machine.

Prerequisites
-------------

You will need a working Python installation. FiftyOne currently requires
**Python 3.6** or newer. On Linux, we recommended installing Python through
your system package manager (APT, YUM, etc.) if it is available. On other
platforms, Python can be downloaded
`from python.org <https://www.python.org/downloads>`_. To verify that a
suitable Python version is installed and accessible, run `python3 --version`
or `python --version`.

Creating a virtual environment
------------------------------

First, identify a suitable Python executable. On many systems, this will be
`python3` , but it may be `python` on other systems instead. To confirm your
Python version, pass `--version` to Python. Here is example output from running
these commands:

.. code-block:: shell

   $ python --version
   Python 2.7.17
   $ python3 --version
   Python 3.6.9

In this case, `python3` should be used in the next step.

Navigate to a folder where you would like to create the virtual environment.
Using the suitable Python version you have identified, run the following to
create a virtual environment called `env` (you can choose any name):

.. code-block:: shell

   python3 -m venv env

Replace `python3` at the beginning of a command if your Python executable has a
different name. This will create a new virtual environment in the `env` folder,
with standalone copies of Python and pip, as well as an isolated location to
install packages to. However, this environment will not be used until it is
*activated*. To activate the virtual environment, run the following command:

.. tabs::

  .. group-tab:: Linux/macOS

    .. code-block:: shell

      . env/bin/activate

    Be sure to include the leading `.`

  .. group-tab:: Windows

    .. code-block:: text

       env\Scripts\activate.bat

After running this command, your shell prompt should begin with `(env)` , which
indicates that the virtual environment has been activated. This state will only
affect your current shell, so if you start a new shell, you will need to
activate the virtual environment again to use it. When the virtual environment
is active, `python` without any suffix will refer to the Python version you
used to create the virtual environment, so you can use this for the remainder
of this guide. For example:

.. code-block:: shell

   $ python --version
   Python 3.8.3

Also note that `python` and `pip` live inside the `env` folder (in this output,
the path to the current folder is replaced with `...`):

.. tabs::

  .. group-tab:: Linux/macOS

    .. code-block:: shell

      $ which python
      .../env/bin/python
      $ which pip
      .../env/bin/pip

  .. group-tab:: Windows

    .. code-block:: text

      > where python
      ...\env\Scripts\python.exe
      C:\Program Files\Python38\python.exe
      > where pip
      ...\env\Scripts\pip.exe
      C:\Program Files\Python38\Scripts\pip.exe

Before you continue, you should upgrade `pip` and some related packages in the
virtual environment. FiftyOne's packages rely on some newer pip features, so
older pip versions may fail to locate a downloadable version of FiftyOne
entirely. To upgrade, run the following command:

.. code-block:: shell

   pip install --upgrade pip setuptools wheel

More virtual environment resources
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

If you ever want to leave an activated virtual environment and return to using
your system-wide Python installation, run `deactivate`.

There are lots of ways to set up and work with virtual environments, some of
which are listed here. These may be particularly useful to review if you are
dealing with virtual environments frequently:

* The `venv` module used in this guide is documented
  `here <https://docs.python.org/3/library/venv.html>`_, with information on
  additional arguments that the `venv` command accepts.
* There is a similar
  `virtualenv package <https://pypi.org/project/virtualenv/>`_
  (`pip install virtualenv`) that supports older Python versions.
* `virtualenvwrapper <https://virtualenvwrapper.readthedocs.io/en/latest/>`_
  adds some convenient shell support for creating and managing virtual
  environments.

Installing FiftyOne
-------------------

To install FiftyOne in a virtual environment, ensure that the virtual
environment is active as described in the previous section, then run:

.. tabs::

  .. group-tab:: Private Beta

    .. code-block:: text

        FiftyOne is currently in private beta. If you have registered, check
        your FiftyOne Beta welcome email to find this command.

        If you haven't registered for the FiftyOne Beta, you can sign up at
        https://voxel51.com/fiftyone/#beta

This will install FiftyOne and all of its dependencies, which may take some
time. Once this has completed, you can verify that FiftyOne is installed in
your virtual environment:

.. code-block:: shell

   $ python
   Python 3.6.9 (default, Apr 18 2020, 01:56:04)
   [GCC 8.4.0] on linux
   Type "help", "copyright", "credits" or "license" for more information.
   >>>
   >>> import fiftyone as fo
   >>> fo.__file__
   '.../env/lib/python3.X/site-packages/fiftyone/__init__.py'
   >>>
   >>> session = fo.launch_dashboard()
   >>> exit()

**Linux users:** if you encounter an error related to MongoDB failing to start,
such as "Could not find mongod", you may need to install additional packages.
See the `troubleshooting section <#troubleshooting>`_ for details.

**Windows users:** If you encounter errors related to missing `msvcp140.dll`,
you will need to install the 64-bit Visual Studio 2015 C++ redistributable
library,
`available here <https://www.microsoft.com/en-us/download/details.aspx?id=48145>`_
(choose the x64 version).

Installing extra packages
-------------------------

Various tutorials and guides that we provide on this site require additional
packages in order to run. If you encounter a missing package, you will see
helpful instructions on what you need to install. Or, you can preemptively
install what you'll need by installing the following additional packages via
`pip` in your virtual environment:

* `ipython` to follow along with interactive examples more easily
* `tensorflow` for examples requiring TensorFlow. The installation process
  can vary depending on your system, so consult the
  `Tensorflow documentation <https://www.tensorflow.org/install>`_ for specific
  instructions.
* `tensorflow-datasets` for examples that rely on loading TensorFlow datasets
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

.. tabs::

  .. group-tab:: Private Beta

    .. code-block:: text

        FiftyOne is currently in private beta. If you have registered, check
        your FiftyOne Beta welcome email to find this command.

        If you haven't registered for the FiftyOne Beta, you can sign up at
        https://voxel51.com/fiftyone/#beta

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

  .. group-tab:: Private Beta

    .. code-block:: text

        FiftyOne is currently in private beta. If you have registered, check
        your FiftyOne Beta welcome email to find this command.

        If you haven't registered for the FiftyOne Beta, you can sign up at
        https://voxel51.com/fiftyone/#beta

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

.. code-block:: shell

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
