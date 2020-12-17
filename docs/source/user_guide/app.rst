
.. _fiftyone-app:

Using the FiftyOne App
======================

.. default-role:: code

The FiftyOne App is a powerful graphical user interface that enables you to
visualize, browse, and interact directly with your
:ref:`FiftyOne Datasets <what-is-a-fiftyone-dataset>`.

Sessions
________

The basic FiftyOne workflow is to open a Python shell and load a |Dataset|.
From there you can launch the FiftyOne App and interact with it
programmatically via a *session*.

.. _creating-an-app-session:

Creating a session
------------------

You can launch an instance of the App by calling
:func:`fo.launch_app() <fiftyone.core.session.launch_app>`. This method returns
a |Session| instance, which you can subsequently use to interact
programmatically with the App!

.. code-block:: python
    :linenos:

    import fiftyone as fo

    session = fo.launch_app()

.. note::

    :func:`fo.launch_app() <fiftyone.core.session.launch_app>` will launch the
    App asynchronously and return control to your Python process. The App will
    then remain open until you close it or the process exits.

    If you are using the App in a non-interactive script, you should use
    :meth:`session.wait() <fiftyone.core.session.Session.wait>` to block
    execution until you close it manually:

    .. code-block:: python

        # Launch the App
        session = fo.launch_app(...)
        # (Perform any additional operations here)

        # Blocks execution until the App is closed
        session.wait()

.. note::

    App sessions are highly flexible. For example, you can
    :ref:`launch multiple App instances on a machine <faq-multiple-apps>` and
    :ref:`connect multiple App instances to the same dataset <faq-multiple-sessions-same-dataset>`.

.. image:: ../images/empty_app.png
   :alt: App Startup
   :align: center

Updating a session's dataset
----------------------------

Sessions can be updated to show a new |Dataset| by updating the
:meth:`Session.dataset <fiftyone.core.session.Session.dataset>` property of the
session object:

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    dataset = foz.load_zoo_dataset("cifar10")
    session.dataset = dataset

.. image:: ../images/cifar10.gif
   :alt: CIFAR-10
   :align: center

Updating a session's view
-------------------------

You can also show a specific |DatasetView| into the current dataset in the App
by updating the :meth:`Session.view <fiftyone.core.session.Session.view>`
property of the session.

For example, the command below loads a |DatasetView| in the App that shows the
first 10 samples in the dataset sorted alphabetically by ground truth label:

.. code-block:: python
    :linenos:

    session.view = dataset.sort_by("ground_truth.label")[:10]

.. image:: ../images/cifar10_sorted.gif
   :alt: CIFAR-10 Sorted
   :align: center

.. _remote-session:

Remote sessions
_______________

If your data is stored on a remote machine, you can forward a session from
the remote machine to the FiftyOne App on your local machine and seemlessly
browse your remote dataset.

See the :ref:`Environments page <environments>` for more information on
possible configurations of local/remote/cloud data and App access.

Remote machine
--------------

On the remote machine, you can load a |Dataset| and launch a remote session
using either the Python library or the CLI:

.. tabs::

  .. group-tab:: Python

    Load a |Dataset| and call
    :meth:`launch_app() <fiftyone.core.session.launch_app>` with the
    ``remote=True`` argument.

    .. code-block:: python
        :linenos:

        # On remote machine

        import fiftyone as fo

        dataset = fo.load_dataset("<dataset-name>")

        session = fo.launch_app(dataset, remote=True)  # optional: port=XXXX

    You can use the optional ``port`` parameter to choose the port of your
    remote machine on which to serve the App. The default is ``5151``.

    Note that you can manipulate the `session` object on the remote machine as
    usual to programmatically interact with the App instance that you'll
    connect to next.

  .. group-tab:: CLI

    Run the :ref:`fiftyone app launch <cli-fiftyone-app-launch>` command in a
    terminal:

    .. code-block:: shell

        # On remote machine

        fiftyone app launch <dataset-name> --remote  # optional --port XXXX

    You can use the optional ``--port`` flag to choose the port of your
    remote machine on which to serve the App. The default is ``5151``.

.. _remote-app-local-machine:

Local machine
-------------

On the local machine, you can launch an App instance connected to a remote
session using either the Python library or the CLI (recommended).

.. tabs::

  .. group-tab:: Python

    Open two terminal windows on the local machine.

    The first step is to configure port forwarding of the remote machine's port
    to your local machine. Do this by running the following command in one
    terminal and leave the process running:

    .. code-block:: shell

        # On local machine

        ssh -N -L 5151:127.0.0.1:5151 username@remote_machine_ip

    If you chose a custom port `XXXX` on the remote machine, substitute it
    for the second `5151` in the above command.

    If you would like to use a custom local port to serve the App, substitute
    it for the first `5151` in the above command.

    In the other terminal, launch the FiftyOne App locally by starting Python
    and running the following commands:

    .. code-block:: python
        :linenos:

        # On local machine

        import fiftyone as fo

        fo.launch_app()  # optional port=YYYY

    If you chose a custom local port when configuring port forwarding, specify
    it via the ``port`` parameter of
    :meth:`launch_app() <fiftyone.core.session.launch_app>`.

  .. group-tab:: CLI

    On the local machine, use the
    :ref:`fiftyone app connect <cli-fiftyone-app-connect>` command to connect
    to a remote session:

    .. code-block:: shell

        # On local machine

        fiftyone app connect --destination username@remote_machine_ip

    If you choose a custom port `XXXX` on the remote machine, add a
    ``--port XXXX`` flag to the above command.

    If you would like to use a custom local port to serve the App, add a
    ``--local-port YYYY`` flag to the above command.

.. note::

    Remote sessions are highly flexible. For example, you can
    :ref:`connect to multiple remote sessions <faq-connect-to-multiple-remote-sessions>`
    and
    :ref:`run multiple remote sessions from a machine <faq-serve-multiple-remote-sessions>`.

Fields
______

Any labels, tags, and scalar fields can be overlaid on the samples in the App
by toggling the corresponding display options on the lefthand side of the App.

.. image:: ../images/cifar10_button_toggle.gif
    :alt: CIFAR-10 Toggle
    :align: center

Viewing a sample
________________

Double-click a sample to open an expanded view of the sample. This modal also
contains information about the fields of the |Sample| and allows you to access
the raw JSON description of the sample.

.. image:: ../images/cifar10_sidebar.gif
    :alt: CIFAR-10 Sidebar
    :align: center

.. _app-create-view:

Using the view bar
__________________

The view bar makes all of the powerful searching, sorting, and filtering
operations :ref:`provided by DatasetViews <using-views>` available directly in
the App. Any changes to the current view that you make in the view bar are
reflected in the |DatasetView| exposed by the
:meth:`Session.view <fiftyone.core.session.Session.view>` property of the
|Session| object associated with the App.

.. image:: ../images/cifar10_view_bar.gif
    :alt: CIFAR-10 View Bar
    :align: center

Tabs
____

The `Samples`, `Labels`, `Tags`, and `Scalars` tabs in the App let you
visualize different aspects and statistics about your dataset. `Samples` is the
default tab, which lets you visualize and select your image samples. The
`Labels` tab shows a distribution of labels of the currently loaded |Dataset|
or |DatasetView|. Any tags that were added and their corresponding counts will
show up under the `Tags` tab. Scalar fields, for example if you computed
`uniqueness` on your dataset, will be displayed under the `Scalars` tab.

.. image:: ../images/cifar10_tabs.gif
   :alt: CIFAR-10 Scalars
   :align: center

.. _app-select-samples:

Selecting samples
_________________

As previously explained, the |Session| object created when you launch the App
lets you interact with the App from your Python process.

One common workflow is to select samples visually in the App and then access
the data for the selected samples in Python. To perform this workflow, first
select some samples in the App:

.. image:: ../images/cifar10_selected.gif
   :alt: CIFAR-10 Selected
   :align: center

The selected samples dropdown on the upper-left of the sample grid records the
number of samples that you have currently selected. You can also take actions
such as updating the view to only show (or exclude) the currently selected
samples.

You can also access the
:meth:`Session.selected <fiftyone.core.session.Session.selected>` property of
your session to retrieve the IDs of the currently selected samples in the App:

.. code-block:: python

    # Print the IDs of the currently selected samples
    print(session.selected)

    # Create a view containing only the selected samples
    selected_view = dataset.select(session.selected)

.. code-block:: text

    ['5ef0eef405059ebb0ddfa6cc',
     '5ef0eef405059ebb0ddfa7c4',
     '5ef0eef405059ebb0ddfa86e',
     '5ef0eef405059ebb0ddfa93c']

.. _app-select-objects:

Selecting objects
_________________

You can also use the App to select individual objects within samples. You can
use this functionality to visually show/hide objects of interest in the App; or
you can access the data for the selected objects from Python, for example by
creating a |DatasetView| that includes/excludes the selected objects.

To perform this workflow, open the expanded sample modal by double-clicking on
a sample in the App. Then click on individual objects to select them:

.. image:: ../images/coco2017_selected.png
   :alt: COCO-2017 Selected
   :align: center

Selected objects will appear with dotted lines around them. The example above
shows selecting an object detection, but polygons, polylines, segmentations,
and keypoints can be selected as well.

When you have selected objects in the App, you can use the selected objects
dropdown menu under ``Fields`` to take actions such as hiding the selected
samples from view.

You can also access the
:meth:`Session.selected_objects <fiftyone.core.session.Session.selected_objects>`
property of your session to retrieve information about the currently selected
objects in the App:

.. code-block:: python

    # Print information about the currently selected samples in the App
    fo.pprint(session.selected_objects)

    # Create a view containing only the selected objects
    selected_view = dataset.select_objects(session.selected_objects)

    # Create a view containing everything except the selected objects
    excluded_view = dataset.exclude_objects(session.selected_objects)

.. code-block:: text

    [
        {
            'object_id': '5f99d2eb36208058abbfc02a',
            'sample_id': '5f99d2eb36208058abbfc030',
            'field': 'ground_truth',
        },
        {
            'object_id': '5f99d2eb36208058abbfc02b',
            'sample_id': '5f99d2eb36208058abbfc030',
            'field': 'ground_truth',
        },
        ...
    ]
