.. _troubleshooting:

Install Troubleshooting
=======================

.. default-role:: code

This page lists common issues encountered when installing FiftyOne and possible
solutions. If you encounter an issue that this page doesn't help you resolve,
feel free to
`open an issue on GitHub <https://github.com/voxel51/fiftyone/issues/new?labels=bug&template=installation_issue_template.md&title=%5BSETUP-BUG%5D>`_
or `contact us on Slack <https://join.slack.com/t/fiftyone-users/shared_invite/zt-s6936w7b-2R5eVPJoUw008wP7miJmPQ>`_.

.. note::

    Most installation issues can be fixed by upgrading some packages and then
    rerunning the FiftyOne install. So, try this first before reading on:

    .. code-block:: shell

        pip install --upgrade pip setuptools wheel
        pip install fiftyone

.. _troubleshooting-pip:

Python/pip incompatibilities
----------------------------

"No matching distribution found"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If you attempt to install FiftyOne with a version of Python or pip that is too
old, you may encounter errors like these:

.. code-block:: text

    ERROR: Could not find a version that satisfies the requirement fiftyone (from versions: none)
    ERROR: No matching distribution found for fiftyone

.. code-block:: text

    Could not find a version that satisfies the requirement fiftyone-brain (from versions: )
    No matching distribution found for fiftyone-brain

.. code-block:: text

    fiftyone requires Python '>=3.6' but the running Python is 3.4.10

To resolve this, you will need to use Python 3.6 or newer, and pip 19.3 or
newer. See the :ref:`installation guide <installing-fiftyone>` for details. If
you have installed a suitable version of Python in a virtual environment and
still encounter this error, ensure that the virtual environment is activated.
See the
:doc:`virtual environment setup guide <virtualenv>` for more details.

"Package 'fiftyone' requires a different Python"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

This error occurs when attempting to install FiftyOne with an unsupported Python
version (either too old or too new). See the
:ref:`installation guide <install-prereqs>` for details on which versions of
Python are supported by FiftyOne.

If you have multiple Python installations, you may be using `pip` from an
incompatible Python installation. Run `pip --version` to see which Python
version `pip` is using. If you see an unsupported or unexpected Python version
reported, there are several possible causes, including:

* You may not have activated a virtual environment in your current shell. Refer
  to the :doc:`virtual environment setup guide <virtualenv>` for details.
* If you are intentionally using your system Python installation instead of a
  virtual environment, your system-wide `pip` may use an unsupported Python
  version. For instance, on some Linux systems, `pip` uses Python 2, and `pip3`
  uses Python 3. If this is the case, try installing FiftyOne with `pip3`
  instead of `pip`.
* You may not have a compatible Python version installed. See the
  :ref:`installation guide <install-prereqs>` for details.

"No module named skbuild"
~~~~~~~~~~~~~~~~~~~~~~~~~

On Linux, this error can occur when attempting to install OpenCV with an old pip
version. To fix this, upgrade pip. See the
:ref:`installation guide <installing-fiftyone>` for instructions, or the
`opencv-python FAQ <https://pypi.org/project/opencv-python-headless/>`_ for more
details.

.. _troubleshooting-video:

Videos do not load in the App
-----------------------------

You will need to install `FFmpeg <https://ffmpeg.org>`_ in order to work with
video datasets:

.. tabs::

  .. group-tab:: Linux

    .. code-block:: shell

        sudo apt install -y ffmpeg

  .. group-tab:: macOS

    .. code-block:: python

        brew install ffmpeg

  .. group-tab:: Windows

    You can download a Windows build from
    `here <https://ffmpeg.org/download.html#build-windows>`_. Unzip it and be
    sure to add it to your path.

.. _troubleshooting-ipython:

IPython installation
--------------------

If you are using IPython and a virtual environment for FiftyOne, IPython must
be installed in the virtual environment, per the
:ref:`installation guide <installing-extras>`. If you attempt to use a
system-wide IPython installation in a virtual environment with FiftyOne, you
may encounter errors such as:

.. code-block:: text

    .../IPython/core/interactiveshell.py:935: UserWarning: Attempting to work in a virtualenv. If you encounter problems, please install IPython inside the virtualenv.

.. code-block:: text

    File ".../fiftyone/core/../_service_main.py", line 29, in <module>
        import psutil
    ModuleNotFoundError: No module named 'psutil'

.. code-block:: text

    ServerSelectionTimeoutError: localhost:27017: [Errno 111] Connection refused

To resolve this, install IPython in your active virtual environment (see the
:ref:`virtual environment guide <virtualenv-guide>` for more information):

.. code-block:: shell

    pip install ipython

.. _troubleshooting-mongodb-linux:

MongoDB compatibility issues on Linux
-------------------------------------

The ``fiftyone-db`` package includes a build of MongoDB that works on Ubuntu
18.04 and several other modern distributions. If this build does not work on
your distribution, you may encounter an error similar to:

.. code-block:: text

    /usr/local/lib/python3.6/dist-packages/fiftyone/db/bin/mongod: failed to launch:
    /usr/local/lib/python3.6/dist-packages/fiftyone/db/bin/mongod: error while loading shared libraries:
    libcrypto.so.1.1: cannot open shared object file: No such file or directory

.. code-block:: text

    RuntimeError: Could not find mongod >= 4.4

To resolve this, you can install an alternative package on some distributions,
detailed below, or install a compatible version of MongoDB system-wide.

.. _alternative-builds:

Alternative builds
~~~~~~~~~~~~~~~~~~

Alternative builds of MongoDB are available as pip packages for the
distributions listed below, and can be installed by running the corresponding
command. Note that these packages must be installed *after* the `fiftyone`
package; if you install `fiftyone` afterwards, you can fix your MongoDB
installation by adding `--force-reinstall` to the commands below.

.. tabs::

  .. tab:: Ubuntu 16.04

    .. code-block:: shell

      # be sure you have libcurl3 installed
      # apt install libcurl3
      pip install fiftyone-db-ubuntu1604

  .. tab:: Debian 9

    .. code-block:: shell

      pip install fiftyone-db-debian9

Manual installation
~~~~~~~~~~~~~~~~~~~

FiftyOne also supports using an existing MongoDB installation (version 4.4 or
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

Verify that the version after "db version" is at least 4.4.
