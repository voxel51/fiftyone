FiftyOne Installation
=====================

.. default-role:: code

.. toctree::
  :hidden:

  Virtual environments <virtualenv>
  Troubleshooting <troubleshooting>

.. note::

  FiftyOne is growing!
  `Sign up for the mailing list <https://share.hsforms.com/1zpJ60ggaQtOoVeBqIZdaaA2ykyk>`_
  to learn about new features as they come out.

.. _install-prereqs:

Prerequisites
-------------

You will need a working Python installation. FiftyOne currently requires
**Python 3.6 - 3.9**.

Although Python 3.9 is supported, note that some dependencies, notably
`scikit-image` and `scikit-learn`, will need to be built from source. Also
note that `tensorflow` does not yet support 3.9.

On Linux, we recommended installing Python through your system package manager
(APT, YUM, etc.) if it is available. On other platforms, Python can be
downloaded `from python.org <https://www.python.org/downloads>`_. To verify that
a suitable Python version is installed and accessible, run `python3 --version`
or `python --version`.

We encourage installing FiftyOne in a virtual environment. See
:doc:`setting up a virtual environment <virtualenv>` for more details.

.. _installing-fiftyone:

Installing FiftyOne
-------------------

To install FiftyOne, ensure you have activated any virtual environment that you
are using, then run:

.. code-block:: shell

   pip install fiftyone

This will install FiftyOne and all of its dependencies, which may take some
time. Once this has completed, you can verify that FiftyOne is installed in
your virtual environment by importing the `fiftyone` package:

.. code-block:: text

    $ python
    >>>
    >>> import fiftyone as fo
    >>>

A successful installation of FiftyOne should result in no output when
`fiftyone` is imported.

.. _fiftyone-quickstart:

Quickstart
----------

Dive right into FiftyOne by running the command below. It will download a
:ref:`small dataset <dataset-zoo-quickstart>`, launch the App, and print some
suggestions for exploring the dataset!

.. code-block:: shell

    fiftyone quickstart

.. _installing-fiftyone-desktop:

FiftyOne Desktop App
--------------------

By default, the :ref:`FiftyOne App <fiftyone-app>` will be opened in your web
browser when you launch it.

However, we also provide a desktop version of the FiftyOne App that you can
install as follows:

.. code-block:: shell

  pip install fiftyone-desktop

.. note::

    Commands like :func:`launch_app() <fiftyone.core.session.launch_app>`
    provide an optional ``desktop`` flag that let you control whether to launch
    the App in your browser or as a desktop App.

    You can also set the ``desktop_app`` flag of your
    :ref:`FiftyOne config <configuring-fiftyone>` to use the desktop App by
    default.

.. _install-troubleshooting:

Troubleshooting
---------------

If you run into any installation issues, review the suggestions below or check
the :ref:`troubleshooting page <troubleshooting>` for more details.

.. note::

    Most installation issues can be fixed by upgrading some packages and then
    rerunning the FiftyOne install:

    .. code-block:: shell

        pip install --upgrade pip setuptools wheel
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

.. _downgrading-fiftyone:

Downgrading FiftyOne
--------------------

If you need to downgrade to an older version of FiftyOne for any reason, you
can do so.

Since new releases occasionally introduce backwards-incompatible changes to the
data model, we provide a :ref:`fiftyone migrate <cli-fiftyone-migrate>` command
that can perform any necessary downward database migrations.

Here's the workflow for downgrading to an older version of FiftyOne:

.. code-block:: shell

    # The version that you wish to downgrade to
    VERSION=0.7.1  # for example

    # Migrate the database
    fiftyone migrate --all -v $VERSION

    # Verify that all of your datasets were migrated
    fiftyone migrate --info

    # Now install the older version of `fiftyone`
    pip install fiftyone==$VERSION

.. note::

    The :ref:`fiftyone migrate <cli-fiftyone-migrate>` command was introduced
    in FiftyOne v0.7.3. If you would like to downgrade from a FiftyOne version
    prior to v0.7.3 (to a yet older version), then you will first need to
    *upgrade* to v0.7.3 or later and then follow the instructions above.

.. note::

    To install a FiftyOne version **prior to v0.7.0**, you must add an
    ``--index`` option to ``pip install``:

    .. code-block:: shell

        pip install --index https://pypi.voxel51.com fiftyone==<version>

.. _uninstalling-fiftyone:

Uninstalling FiftyOne
---------------------

FiftyOne and all of its subpackages can be uninstalled with:

.. code-block:: shell

   pip uninstall fiftyone fiftyone-brain fiftyone-db voxel51-eta

If you installed the optional desktop App, you can uninstall that via:

.. code-block:: shell

   pip uninstall fiftyone-desktop
