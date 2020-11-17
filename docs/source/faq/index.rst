Frequently Asked Questions
==========================

.. default-role:: code

Can I run this in a browser?
----------------------------

Browsers are not yet supported; you must
:ref:`install FiftyOne <installing-fiftyone>` on each machine from which you
want to use the library or the App.

However, check out the :doc:`environments guide </environments/index>` for
best practices on using FiftyOne in common local, remote, and cloud
environments.

Can I access data stored on a remote server?
--------------------------------------------

Yes! If you install FiftyOne on both your remote server and local machine, then
you can :ref:`load a dataset remotely <remote-data>` and then explore it via an
:ref:`App session on your local machine <creating-an-app-session>`.

Can I access data stored in the cloud?
--------------------------------------

Yes! The recommended best practice is to mount the cloud bucket to a cloud
compute instance in your cloud environment and then use the
:ref:`remote server workflow <remote-data>` to work with the data.

Check out the :doc:`environments guide </environments/index>` for instructions
for working in AWS, GCP, and Azure.

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

What image file types are supported?
------------------------------------

In general, FiftyOne supports `all image types supported by Chromium
<https://en.wikipedia.org/wiki/Comparison_of_browser_engines_(graphics_support)>`_,
which includes standard image types like JPEG, PNG, TIFF, and BMP.

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

What operating systems does FiftyOne support?
---------------------------------------------

FiftyOne is guaranteed to support the latest versions of MacOS, Windows, and
popular Linux distributions. FiftyOne will generally also support any version
of these popular operating systems from the past few years.

We also provide :ref:`custom install instructions <alternative-builds>` to use
FiftyOne on old-but-popular setups like Ubuntu 16.04 and Debian 9.

Can you share a dataset with someone else?
------------------------------------------

You can easily :doc:`export a dataset </user_guide/export_datasets>` in one
ine of code, zip it, and send it to someone else who can then
:doc:`load it in a few lines of code. </user_guide/dataset_creation/datasets>`.

Alternatively, you could launch a :ref:`remote session <remote-data>` of the
FiftyOne App on your machine that another user can connect to from their local
machine. This workflow does require that both users have the

Are the Brain methods open source?
----------------------------------

No. Although the `core library <https://github.com/voxel51/fiftyone>`_ is
open source and the :doc:`Brain methods </user_guide/brain>` are freely
available for use for any commerical or non-commerical purposes, the Brain
methods are closed source.

Check out the :doc:`Brain documentation </user_guide/brain>` for detailed
instructions on using the various Brain methods.

Can you connect multiple App instances to the same dataset?
-----------------------------------------------------------

Yes, multiple users can remotely access the same
|Dataset|. You just need to create a remote session on the system that has the
|Dataset|. This can be done either through the CLI or Python:

.. tabs::

  .. group-tab:: CLI

    Load a |Dataset| and launch a remote |Session| through the CLI

    .. code-block:: bash

        fiftyone app launch <dataset> --remote --port XXXX 


  .. group-tab:: Python

    Load a |Dataset| and launch a remote |Session| through Python

    .. code-block:: python
        :linenos:

        import fiftyone as fo

        dataset = fo.load_dataset(...)
        session = fo.launch_app(dataset, remote=True, port=XXXX)


:ref:`Each user can then use the CLI to launch the App and connect to the remote
session: <remote-app-local-machine>`

.. code-block:: bash

    fiftyone app connect --destination username@remote_system_ip --port XXXX


If the remote session was launched from your local system, you don't need to
specify the destination:

.. code-block:: bash

    fiftyone app connect --port XXXX



Can you use the App to connect to multiple remote sessions?
-----------------------------------------------------------

Yes, you can launch multiple instances of the App locally, each connected to a different
remote session. 

**Requirements**

You need:

* `ssh` access to the remote systems hosting the sessions you want to connect
  to

* To know the port that the |Session| is being hosted on

* The ports of all of the local instances of the App you currently have open.
  Every instance of the App needs to be opened on a unique `local-port`.


Suppose there are multiple remote systems, one a server that you own and one an
EC2 instance on AWS. On each system, someone has run code similar to the following to load a
FiftyOne |Dataset| and start a remote |Session|:

.. tabs::

  .. group-tab:: CLI

    Loaded a |Dataset| and launched a |Session| through the CLI

    .. code-block:: bash

        # Remote systems
        fiftyone app launch <dataset> --remote --port XXXX  # port=YYYY on the other system


  .. group-tab:: Python

    Loaded a |Dataset| and launched a |Session| through Python

    .. code-block:: python
        :linenos:

        # Remote systems
        import fiftyone as fo

        dataset = fo.load_dataset(...)
        session = fo.launch_app(dataset, remote=True, port=XXXX) # port=YYYY on the other system


**Connecting to remote sessions**

On your local system, you can now launch two instances of the App and :ref:`connect
to the session hosted on the two systems <remote-app-local-machine>` 
on ports `XXXX` and `YYYY` respectively (`XXXX` and
`YYYY` can be any 4 integer port you want):

.. code-block:: bash

    # Local system
    fiftyone app connect --destination username@remote_system1_ip --port XXXX --local-port XXXX
    fiftyone app connect --destination username@remote_system2_ip --port YYYY --local-port YYYY

    # The local ports can be anything as long as they are unique from one another


.. _collaborate-nonprogrammatically:

Can I share my dataset with other users who want to visualize it?
-----------------------------------------------------------------

Yes! This workflow is common if multiple people want to collaborate and visualize the same
remote FiftyOne |Dataset|. Though they will not be able to programmatically
interact with the |Dataset|, only through the App. 

If you want to let everyone programmatically interact with the |Dataset|,
:ref:`the process is a bit more complicated <collaborate-programmatically>`.

This assumes that there is a |Dataset| loaded on a machine or cloud instance
and other users want to launch the App on their local systems to
connect to this |Dataset|. 

**Note: All users must have ssh
access to the system containing the Dataset.**

On the system that has the
|Dataset|, start a remote |Session| either through the CLI or Python.

.. tabs::

  .. group-tab:: CLI

    .. code-block:: bash

        # Remote machine
        fiftyone app launch <dataset> --remote --port XXXX 

  .. group-tab:: Python

    .. code-block:: python
        :linenos:

        # Remote machine
        import fiftyone as fo

        dataset = fo.load_dataset(....)

        session = fo.launch_app(dataset, remote=True, port=XXXX)



After :ref:`installing FiftyOne <installing-fiftyone>` on
their local machines, other users can then :ref:`run the following command to connect <remote-app-local-machine>`
to the remote |Session| and launch the App.

.. code-block:: bash

    # Local machines
    fiftyone app connect --destination username@remote_system_ip --port XXXX



This workflow is common if you have data stored in a common place (like in the
cloud on AWS or on a remote server) and have a team of people trying to access
the same data. Anyone with `ssh` access to the machine or instance containing
the data will be able to view the it in FiftyOne.


.. _collaborate-programmatically: 

Can I collaborate with others to programmatically work on the same remote data?
-------------------------------------------------------------------------------

Yes, the main idea here is that every user will need to `ssh` into the remote
system and load their own |Dataset| object in an `ipython` shell. They will
not be able to modify the same FiftyOne |Dataset|, but they can work with the
same data stored on disk.

If you do not want to programmatically interact with the data using `ipython`
and instead just want to visualize the data in the App,
:ref:`then the setup is slightly less complicated.
<collaborate-nonprogrammatically>`

Every user should follow the steps below:

**Step 1**

`ssh` into the remote system through a terminal.

**Step 2**

Open an `ipython` shell, import FiftyOne, load their dataset, and launch a
remote session

.. code-block:: python
    :linenos:
    
    # Remote System
    import fiftyone as fo

    dataset = fo.load_dataset(...)

    session = fo.launch_app(dataset, remote=True, port=XXXX)


**Step 3**

:ref:`On the user's local machine, connect to the remote session using the CLI <remote-app-local-machine>`

.. code-block:: bash

    # Local System
    fiftyone app connect --destination username@remote_system_ip --port XXXX

**Step 4**

Back in the remote `ipython` shell, programmatically work with the |Dataset|
and see all changes in the App launched on your local system.

.. code-block:: python
    :linenos:

    # Remote System (Continued from step 2)

    view = dataset.take(10)
    session.view = view
    
    # See the App automatically update

**(Optional) Step 5**

Connect to another user's remote |Session| to see their |Dataset| assuming they 
are using the same system. The only difference here is that you need to connect
to their unique remote |Session| port (`YYYY`) and you need to specify a new
`local-port` so that it does not interfere with the App you already have open
connected to your |Session| on port `XXXX` 

.. code-block:: bash
    
    # Local System
    fiftyone app connect --destination username@remote_system_ip --port YYYY --local-port ZZZZ

