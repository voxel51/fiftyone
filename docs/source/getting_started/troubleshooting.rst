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

    fiftyone requires Python '>=3.7' but the running Python is 3.4.10

To resolve this, you will need to use Python 3.7 or newer, and pip 19.3 or
newer. See the :ref:`installation guide <installing-fiftyone>` for details. If
you have installed a suitable version of Python in a virtual environment and
still encounter this error, ensure that the virtual environment is activated.
See the
:doc:`virtual environment setup guide <virtualenv>` for more details.

.. note::

    FiftyOne does not support 32-bit platforms.

"Package 'fiftyone' requires a different Python"
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

This error occurs when attempting to install FiftyOne with an unsupported
Python version (either too old or too new). See the
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

On Linux, this error can occur when attempting to install OpenCV with an old
pip version. To fix this, upgrade pip. See the
:ref:`installation guide <installing-fiftyone>` for instructions, or the
`opencv-python FAQ <https://pypi.org/project/opencv-python-headless/>`_ for
more details.

.. _troubleshooting-video:

Videos do not load in the App
-----------------------------

You need to install `FFmpeg <https://ffmpeg.org>`_ in order to work with video
datasets:

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

Without FFmpeg installed, videos may appear in the App, but they will not be
rendered with the correct aspect ratio and thus label overlays will not be
positioned correctly.

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

.. _troubleshooting-mongodb:

Import and database issues
--------------------------

FiftyOne includes a `fiftyone-db` package wheel for your operating system and
hardware. If you have not
:ref:`configured your own database connection <configuring-mongodb-connection>`,
then FiftyOne's database service will attempt to start up on import using the
MongoDB distribution provided by `fiftyone-db`. If the database fails to start,
importing `fiftyone` will result in exceptions being raised.

.. _troubleshooting-downgrades:

Downgrading to old versions
---------------------------

The :ref:`fiftyone migrate <cli-fiftyone-migrate>` command was introduced in
FiftyOne v0.7.3. If you would like to downgrade from a FiftyOne version
prior to v0.7.3 (to a yet older version), then you will first need to
:ref:`upgrade <upgrading-fiftyone>` to v0.7.3 or later and then
:ref:`downgrade <downgrading-fiftyone>`:

.. code-block:: shell

  # The version that you wish to downgrade to
  VERSION=0.7.0

  pip install fiftyone==0.7.3
  fiftyone migrate --all -v $VERSION
  pip install fiftyone==$VERSION

To install a FiftyOne version prior to v0.7.0, you must add ``--index``:

.. code-block:: shell

    pip install --index https://pypi.voxel51.com fiftyone==<version>

.. _troubleshooting-mongodb-exits:

Database exits
--------------

On some UNIX systems, the default open file limit setting is too small for
FiftyOne's MongoDB connection. The database service will exit in this case.
Running `ulimit -n 64000` should resolve the issue. 64,000 is the recommended
open file limit.  MongoDB has full documentation on the issue
`here <https://docs.mongodb.com/manual/reference/ulimit/>`_. 

.. _troubleshooting-mongodb-linux:

Troubleshooting Linux imports
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

On Linux machines in particular, the MongoDB build works for Ubuntu
18.04+ and several other modern distributions.

However, if a suitable MongoDB build is not available or otherwise does not
work in your environment, you may encounter a `ServerSelectionTimeoutError`.

If you have output similar to the below, you may just need to install
`libssl` packages.

.. code-block:: text

  Subprocess ['.../site-packages/fiftyone/db/bin/mongod', ...] exited with error 127:
  .../site-packages/fiftyone/db/bin/mongod: error while loading shared libraries:
    libcrypto.so.1.1: cannot open shared object file: No such file or directory

On Ubuntu, `libssl` packages can be install with the following command:

.. code-block:: shell

  sudo apt install libssl-dev

If you still face issues with imports, you can follow
:ref:`these instructions <configuring-mongodb-connection>` to configure
FiftyOne to use a MongoDB instance that you have installed yourself.

On Linux, alternative :ref:`fiftyone-db builds <alternative-builds>` are
available as well.

.. _alternative-builds:

Alternative Linux builds
~~~~~~~~~~~~~~~~~~~~~~~~

Alternative builds of MongoDB are available as pip packages for the Linux
distributions listed below, and can be installed by running the corresponding
command.

Note that these packages must be installed *after* installing the `fiftyone`
package; if you (re)install `fiftyone` afterwards, you can fix your MongoDB
installation by adding `--force-reinstall` to the commands below.

.. tabs::

  .. tab:: Ubuntu 16.04

    .. code-block:: shell

      # be sure you have libcurl4 installed
      # apt install libcurl4
      pip install fiftyone-db-ubuntu2004

  .. tab:: Debian 9

    .. code-block:: shell

      pip install fiftyone-db-debian9

  .. tab:: RHEL 7

    .. code-block:: shell

      pip install fiftyone-db-rhel7

.. _troubleshooting-mongodb-windows:

Troubleshooting Windows imports
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

If your encounter a `psutil.NoSuchProcessExists` exists when importing
`fiftyone`, you are likely missing the C++ libraries MongoDB requires.

.. code-block::

    psutil.NoSuchProcess: psutil.NoSuchProcess process no longer exists (pid=XXXX)
  
Downloading and installing the Microsoft Visual C++ Redistributable from this
`page <https://support.microsoft.com/en-us/topic/the-latest-supported-visual-c-downloads-2647da03-1eea-4433-9aff-95f26a218cc0>`_
should resolve the issue. Specifically, you will want to download the
`vc_redist.x64.exe` redistributable.
