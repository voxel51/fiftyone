
.. _faq:

Frequently Asked Questions
==========================

.. default-role:: code

.. _faq-desktop-app-support:

Can I run the FiftyOne App as a desktop application?
----------------------------------------------------

Yes! Simply :ref:`install the Desktop App <installing-fiftyone-desktop>`.

Commands like :func:`launch_app() <fiftyone.core.session.launch_app>` provide
an optional ``desktop`` flag that let you control whether to launch the App in
your browser or as a desktop App.

You can also set the ``desktop_app`` flag of your
:ref:`FiftyOne config <configuring-fiftyone>` to use the desktop App by
default.

Check out the :ref:enviornments guide <environments>` to see how to use
FiftyOne in all common local, remote, cloud, and notebook environments.

.. _faq-browser-support:

Can I open the FiftyOne App in a browser?
-----------------------------------------

Yes! In fact, as of :ref:`FiftyOne v0.7 <release-notes-v0.7.0>`, this is the
default behavior; FiftyOne will open the App in your default web browser.

You can also run FiftyOne
:ref:`as a desktop application <faq-desktop-app-support>` if you prefer.

Check out the :ref:`enviornments guide <environments>` to see how to use
FiftyOne in all common local, remote, cloud, and notebook environments.

.. _faq-notebook-support:

Can I run this in a notebook?
-----------------------------

Yes! FiftyOne supports both `Jupyter Notebooks <https://jupyter.org>`_ and
`Google Colab Notebooks <https://colab.research.google.com>`_.

All the usual FiftyOne commands can be run in notebook environments. The only
difference is that you call
:meth:`session.show() <fiftyone.core.session.Session.show>` to open the App
in the output of a cell.

For example, a typical workflow is:

.. code-block:: python
    :linenos:

    import fiftyone as fo

    # Load a FiftyOne dataset
    dataset = fo.load_dataset(...)

    # Launch an App session
    session = fo.launch_app(dataset)

.. code-block:: python
    :linenos:

    # Open the App in this cell's output
    session.show()

.. code-block:: python
    :linenos:

    # Updates the App in the above output
    session.view = dataset.take(10)

.. note::

    If you run :meth:`session.show() <fiftyone.core.session.Session.show>` in
    multiple cells, only the most recent instance will be connected to your
    |Session| object.

.. _faq-remote-server-data:

Can I access data stored on a remote server?
--------------------------------------------

Yes! If you install FiftyOne on both your remote server and local machine, then
you can :ref:`load a dataset remotely <remote-data>` and then explore it via an
:ref:`App session on your local machine <creating-an-app-session>`.

.. _faq-cloud-data:

Can I access data stored in the cloud?
--------------------------------------

Yes! The recommended best practice is to mount the cloud bucket to a cloud
compute instance in your cloud environment and then use the
:ref:`remote server workflow <remote-data>` to work with the data.

Check out the :doc:`environments guide </environments/index>` for instructions
for working in AWS, GCP, and Azure.

.. _faq-supported-labels:

What label types are supported?
-------------------------------

FiftyOne provides support for all of the following label types for both image
and video datasets:

- :ref:`Classifications <classification>`
- :ref:`Multilabel classifications <multilabel-classification>`
- :ref:`Object detections <object-detection>`
- :ref:`Instance segmentations <objects-with-instance-segmentations>`
- :ref:`Object attributes <objects-with-attributes>`
- :ref:`Polylines and polygons <polylines>`
- :ref:`Keypoints <keypoints>`
- :ref:`Semantic segmentations <semantic-segmentation>`

Check out :ref:`this guide <manually-building-datasets>` for simple recipes to
load labels in each of these formats.

.. _faq-image-types:

What image file types are supported?
------------------------------------

In general, FiftyOne supports `all image types supported by Chromium
<https://en.wikipedia.org/wiki/Comparison_of_web_browsers#Image_format_support>`_,
which includes standard image types like JPEG, PNG, and BMP.

.. _faq-video-types:

What video file types are supported?
------------------------------------

Core methods that process videos can generally handle any
`codec supported by ffmpeg <https://www.ffmpeg.org/general.html#Video-Codecs>`_.

The App can play any video codec that is supported by
`HTML5 video on Chromium <https://en.wikipedia.org/wiki/HTML5_video#Browser_support>`_,
including MP4 (H.264), WebM, and Ogg.

If you try to view a video with an unsupported codec in the App, you will be
prompted to use the :func:`reencode_videos() <fiftyone.utils.video.reencode_videos>`
utility method to reencode the source video so it is viewable in the App.

.. _faq-supported-os:

What operating systems does FiftyOne support?
---------------------------------------------

FiftyOne is guaranteed to support the latest versions of MacOS, Windows, and
popular Linux distributions. FiftyOne will generally also support any version
of these popular operating systems from the past few years.

We also provide :ref:`custom install instructions <alternative-builds>` to use
FiftyOne on old-but-popular setups like Ubuntu 16.04 and Debian 9.

.. _faq-share-dataset-export:

Can I share a dataset with someone else?
----------------------------------------

Yes! Here's a couple options:

**Option 1: Export and share**

You can easily :ref:`export a dataset <exporting-datasets>` in one line of
code, zip it, and share the zip with your collaborator, who can then
:ref:`load it in a few lines of code <loading-datasets-from-disk>`.

**Option 2: Sharing a remote session**

Alternatively, :ref:`see this FAQ <faq-multiple-sessions-same-dataset>` for
instructions on launching a remote session and inviting collaborator(s) to
connect to it from their local machines.

.. _faq-brain-closed-source:

Are the Brain methods open source?
----------------------------------

No. Although the `core library <https://github.com/voxel51/fiftyone>`_ is open
source and the :ref:`Brain methods <fiftyone-brain>` are freely available for
use for any commerical or non-commerical purposes, the Brain methods are closed
source.

Check out the :ref:`Brain documentation <fiftyone-brain>` for detailed
instructions on using the various Brain methods.

.. _faq-multiple-apps:

Can I launch multiple App instances on a machine?
-------------------------------------------------

Yes! Simply specify a different `port` for each App instance that you create.

.. tabs::

  .. group-tab:: CLI

    .. code-block:: shell

        # Launch first App instance
        fiftyone app launch <dataset1> --port XXXX

    .. code-block:: shell

        # Launch second App instance
        fiftyone app launch <dataset2> --port YYYY

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        # Launch first App instance
        dataset1 = fo.load_dataset(...)
        session1 = fo.launch_app(dataset1, port=XXXX)

        # Launch second App instance
        # This can be done in either the same or another process
        dataset2 = fo.load_dataset(...)
        session2 = fo.launch_app(dataset2, port=YYYY)

.. _faq-multiple-sessions-same-dataset:

Can I connect multiple App instances to the same dataset?
---------------------------------------------------------

Yes, multiple App instances can be connected to the same |Dataset| via remote
sessions.

.. note::

    Keep in mind that all users must have ssh access to the system from which
    the remote session(s) are launched in order to connect to them.

You can achieve multiple connections in two ways:

**Option 1: Same dataset, multiple sessions**

The typical way to connect multiple App instances to the same dataset is to
create a separate remote session instance on the machine that houses the
|Dataset| of interest for each local App instance that you want to create.
:ref:`See this FAQ <faq-serve-multiple-remote-sessions>` for instructions on
doing this.

**Option 2: Same dataset, same session**

Another option is to connect multiple App instances to a single remote session.

First, :ref:`create a remote session <remote-session>` on the system that
houses the |Dataset| using either the CLI or Python:

.. tabs::

  .. group-tab:: CLI

    .. code-block:: shell

        # On remote machine
        fiftyone app launch <dataset> --remote  # (optional) --port XXXX

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        # On remote machine
        import fiftyone as fo

        dataset = fo.load_dataset(...)

        session = fo.launch_app(dataset, remote=True)  # (optional) port=XXXX

Then one or more users can use the CLI on their local machine to
:ref:`connect to the remote session: <remote-app-local-machine>`, or manually
configure a connection to the session. The latter approach does not require
`fiftyone` to be installed, only a web browser.

The CLI only requires the following command. The App will open in your
configured window setting.

.. code-block:: shell

    # On local machine(s)
    # If a custom port was used, append --port XXXX
    fiftyone app connect --destination <username>@<remote-ip-address>

Manually configuring a connection requires setting up port forwarding:

.. code-block:: shell

    # `[<username>@]<hostname>` refers to your remote machine
    ssh -N -L 5151:localhost:XXXX [<username>@]<hostname>
    # where XXXX is the remote port number (5151 if you did not provide one)

And then opening `http://localhost:5151` in your web browser.

.. note::

    When multiple App instances are connected to the same |Session|, any
    actions taken that affect the session (e.g.,
    :ref:`loading a view <app-create-view>`) will be reflected in all connected
    App instances.

.. _faq-connect-to-multiple-remote-sessions:

Can I connect to multiple remote sessions?
------------------------------------------

Yes, you can launch multiple instances of the App locally, each connected to a
different remote session.

The key here is to specify a different *local port* for each App instance that
you create.

Suppose you are connecting to multiple remote |Session| instances that were
created on different remote systems (e.g., an EC2 instance and a remote server
that you own), using commands similar to:

.. tabs::

  .. group-tab:: CLI

    .. code-block:: shell

        # On each remote machine
        fiftyone app launch <dataset> --remote

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        # On each remote machine
        import fiftyone as fo

        dataset = fo.load_dataset(...)

        session = fo.launch_app(dataset, remote=True)

On your local machine, you can launch App instances to
:ref:`connect to the remote sessions <remote-app-local-machine>` on each
machine by specifying a different `--local-port` for each App instance to use,
or by manually configuring each connection. The latter approach does not
require `fiftyone` to be installed on you local machine:

`XXXX` and `YYYY` used below are any open ports on your machine.

The CLI only requires one command. The App will open in your configured window
setting.

.. code-block:: shell

    # Connect to first remote session
    fiftyone app connect --destination <username1>@<remote-ip-address1> --local-port XXXX

.. code-block:: shell

    # Connect to second remote session
    fiftyone app connect --destination <username2>@<remote-ip-address2> --local-port YYYY

Manually configuring a connection requires setting up port forwarding. `RRRR`
is the remote port number of the session you wish to connect to.

.. code-block:: shell

    # `[<username>@]<hostname>` refers to your remote machine
    ssh -N -L XXXX:localhost:RRRR [<username>@]<hostname>
    # then open `http://localhost:XXXX` in your web browser.

.. code-block:: shell

    ssh -N -L YYYY:localhost:RRRR [<username>@]<hostname>

.. note::

    You can also serve multiple remote sessions
    :ref:`from the same machine <faq-serve-multiple-remote-sessions>`.

.. _faq-serve-multiple-remote-sessions:

Can I serve multiple remote sessions from a machine?
----------------------------------------------------

Yes, you can create multiple remote sessions on the same remote machine by
specifying different ports for each |Session| that you create:

.. tabs::

  .. group-tab:: CLI

    .. code-block:: shell

        # On remote machine

        # Create first remote session
        fiftyone app launch <dataset1> --remote --port XXXX

    .. code-block:: shell

        # On remote machine

        # Create second remote session
        fiftyone app launch <dataset2> --remote --port YYYY

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        # On remote machine
        import fiftyone as fo

        # Create first remote session
        dataset1 = fo.load_dataset(...)
        session1 = fo.launch_app(dataset1, remote=True, port=XXXX)

        # Create second remote session
        # This can be done in either the same or another process
        dataset2 = fo.load_dataset(...)
        session2 = fo.launch_app(dataset2, remote=True, port=YYYY)

On your local machine(s), you can launch App instances to
:ref:`connect to the remote sessions <remote-app-local-machine>` that you
created by specifying the corresponding remote ports that you used, or by
manually configuring each connection. The latter approach does not require
`fiftyone` to be installed on you local machine:

The CLI only requires one command. The App will open in your configured window
setting.

.. code-block:: shell

    # On a local machine

    # Connect to first remote session
    fiftyone app connect \
        --destination <username>@<remote-ip-address> \
        --port XXXX --local-port WWWW

.. code-block:: shell

    # On a local machine

    # Connect to second remote session
    fiftyone app connect \
        --destination <username>@<remote-ip-address> \
        --port YYYY --local-port ZZZZ

Manually configuring a connection requires setting up port forwarding.

.. code-block:: shell

    # `[<username>@]<hostname>` refers to your remote machine
    ssh -N -L WWWW:localhost:XXXX [<username>@]<hostname>
    # then open `http://localhost:WWWW` in your web browser.

.. code-block:: shell

    ssh -N -L ZZZZ:localhost:YYYY [<username>@]<hostname>

`WWWW` and `ZZZZ` are any 4 digit ports on your local machine(s).

.. _faq-do-we-track:

Does FiftyOne track me?
-----------------------

Yes, FiftyOne tracks anonymous UUID-based usage of the Python library and the
App by default. We are a small team building an open source project, and basic
knowledge of how users are engaging with the project is critical to informing
the roadmap of the project.

.. note::

    You can disable tracking by setting the ``do_not_track`` flag of your
    :ref:`FiftyOne config <configuring-fiftyone>`.
