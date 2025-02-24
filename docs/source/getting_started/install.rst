FiftyOne Installation
=====================

.. default-role:: code

.. toctree::
  :hidden:

  Virtual environments <virtualenv>
  Troubleshooting <troubleshooting>

.. note::

    Need to collaborate on your datasets? Check out
    :ref:`FiftyOne Teams <fiftyone-teams>`!

.. _install-prereqs:

Prerequisites
-------------

You will need a working Python installation. FiftyOne currently requires
**Python 3.9 - 3.11**


On Linux, we recommend installing Python through your system package manager
(APT, YUM, etc.) if it is available. On other platforms, Python can be
downloaded `from python.org <https://www.python.org/downloads>`_. To verify that
a suitable Python version is installed and accessible, run `python --version`.

We encourage installing FiftyOne in a virtual environment. See
:doc:`setting up a virtual environment <virtualenv>` for more details.

.. _installing-fiftyone:

Installing FiftyOne
-------------------

To install FiftyOne, ensure you have activated any virtual environment that you
are using, then run:

.. code-block:: shell

   pip install fiftyone

This will install FiftyOne and all of its dependencies. Once this has
completed, you can verify that FiftyOne is installed in your virtual
environment by importing the `fiftyone` package:

.. code-block:: text

    $ python
    >>>
    >>> import fiftyone as fo
    >>>

A successful installation of FiftyOne should result in no output when
`fiftyone` is imported. See :ref:`this section <install-troubleshooting>` for
install troubleshooting tips.

If you want to work with video datasets, you'll also need to install
`FFmpeg <https://ffmpeg.org>`_:

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

.. _fiftyone-quickstart:

Quickstart
----------

Dive right into FiftyOne by opening a Python shell and running the snippet
below, which downloads a :ref:`small dataset <dataset-zoo-quickstart>` and
launches the :ref:`FiftyOne App <fiftyone-app>` so you can explore it!

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("quickstart")
    session = fo.launch_app(dataset)

Note that if you are running this code in a script, you must include
:meth:`session.wait() <fiftyone.core.session.Session.wait>` to block execution
until you close the App. See :ref:`this page <creating-an-app-session>` for
more information.

.. _install-troubleshooting:

Troubleshooting
---------------

If you run into any installation issues, review the suggestions below or check
the :ref:`troubleshooting page <troubleshooting>` for more details.

.. note::

    Most installation issues can be fixed by upgrading some packages and then
    rerunning the FiftyOne install:

    .. code-block:: shell

        pip install --upgrade pip setuptools wheel build
        pip install fiftyone

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
  :ref:`alternative Linux builds <troubleshooting-mongodb>` for details.

**Windows users:**

- If you encounter a `psutil.NoSuchProcessExists` when importing `fiftyone`,
  you will need to install the 64-bit Visual Studio 2015 C++ redistributable
  library. See :ref:`here <troubleshooting-mongodb-windows>` for
  instructions.

.. _installing-extras:

Installing extras
-----------------

Various tutorials and guides that we provide on this site require additional
packages in order to run. If you encounter a missing package, you will see
helpful instructions on what you need to install. Alternatively, you can
preemptively install what you'll need by installing the following additional
packages via `pip` in your virtual environment:

* `ipython` to follow along with interactive examples more easily (note that
  a system-wide IPython installation will *not* work in a virtual environment,
  even if it is accessible)
* `torch` and `torchvision` for examples requiring PyTorch. The installation
  process can vary depending on your system, so consult the
  `PyTorch documentation <https://pytorch.org/get-started/locally/>`_ for
  specific instructions.
* `tensorflow` for examples requiring TensorFlow. The installation process
  can vary depending on your system, so consult the
  `Tensorflow documentation <https://www.tensorflow.org/install>`_ for specific
  instructions.
* `tensorflow-datasets` for examples that rely on loading
  `TensorFlow datasets <https://www.tensorflow.org/datasets>`_
* `FFmpeg <https://ffmpeg.org>`_, in order to work with video datasets in
  FiftyOne. See :ref:`this page <troubleshooting-video>` for installation
  instructions.

.. note::

  FiftyOne does not strictly require any of these packages, so you can install
  only what you need. If you run something that requires an additional package,
  you will see a helpful message telling you what to install.

.. _upgrading-fiftyone:

Upgrading FiftyOne
------------------

You can upgrade an existing FiftyOne installation by passing the ``--upgrade``
option to ``pip install``:

.. code-block:: shell

   pip install --upgrade fiftyone

.. note::

  New versions of FiftyOne occasionally introduce data model changes that
  require database migrations after you upgrade. Rest assured, these migrations
  will be **automatically** performed on a per-dataset basis whenever you load
  a dataset for the first time in a newer version of FiftyOne.

.. note::

  If you have a configured
  :ref:`MongoDB connection <configuring-mongodb-connection>`, you
  can use :ref:`database admin privileges <database-migrations>` to control
  which clients are allowed to upgrade your FiftyOne deployment.

.. note::

  If you are a FiftyOne 1.2.0 or lower user with an Ubuntu 24 operating system, 
  you will need to 
  :ref:`upgrade your mongodb binaries <mongodb-7-to-8>`.

.. note::

  FiftyOne versions greater than 1.3.0 will manage the MongoDB feature
  compatibility version if you are using the default `fiftyone-db` database
  binary. Because of this addition, Voxel51 recommends backing up your database
  between upgrades. Alternatively, you can configure your own
  :ref:`MongoDB conection <configuring-mongodb-connection>`
  outside of FiftyOnes administrative management.

.. _downgrading-fiftyone:

Downgrading FiftyOne
--------------------

If you need to downgrade to an older version of FiftyOne for any reason, you
can do so.

Since new releases occasionally introduce backwards-incompatible changes to the
data model, you must use the :ref:`fiftyone migrate <cli-fiftyone-migrate>`
command to perform any necessary downward database migrations
**before installing the older version of FiftyOne**.

Here's the workflow for downgrading to an older version of FiftyOne:

.. code-block:: shell

    # The version that you wish to downgrade to
    VERSION=0.15.1

    # Migrate the database
    fiftyone migrate --all -v $VERSION

    # Now install the older version of `fiftyone`
    pip install fiftyone==$VERSION

    # Optional: verify that your datasets were migrated
    fiftyone migrate --info

If you are reading this after encountering an error resulting from downgrading
your ``fiftyone`` package without first running
:ref:`fiftyone migrate <cli-fiftyone-migrate>`, don't worry, you simply need to
reinstall the newer version of FiftyOne and then follow these instructions.

See :ref:`this page <troubleshooting-downgrades>` if you need to install
FiftyOne v0.7.3 or earlier.

.. note::

  If you are working with a
  :ref:`custom/shared MongoDB database <configuring-mongodb-connection>`, you
  can use :ref:`database admin privileges <database-migrations>` to control
  which clients are allowed to downgrade your FiftyOne deployment.

.. _uninstalling-fiftyone:

Uninstalling FiftyOne
---------------------

FiftyOne and all of its subpackages can be uninstalled with:

.. code-block:: shell

   pip uninstall fiftyone fiftyone-brain fiftyone-db
