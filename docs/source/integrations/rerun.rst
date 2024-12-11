.. _rerun-integration:

Rerun Integration
=================

.. default-role:: code

`Rerun <https://www.rerun.io>`_ is an open-source visualization and 
logging tool for robotics, spatial AI, and related domains.

This integration allows you to easily associate and visualize `.rrd` files with
the samples in your FiftyOne datasets, allowing you to explore and analyze
complex sensor streams from robotic or autonomous systems.

.. _rerun_setup

Setup
_____

This integration is made possible by a Javascript plugin for the FiftyOne App.

To get started, make sure you have FiftyOne and Rerun SDK installed:

.. code-block:: bash

    $ pip install fiftyone rerun-sdk

Next, install the `Rerun plugin <https://github.com/voxel51/fiftyone-rerun-plugin>`_:

.. code-block:: bash
    
    $ fiftyone plugins download https://github.com/voxel51/fiftyone-rerun-plugin

.. note::
    The Rerun plugin for FiftyOne is a sample scoped plugin, which means it is
    only available in the modal view of the FiftyOne App and not the grid view.


.. _rerun_workflow

Workflow
________

Use the following workflow to integrate RRD files with your FiftyOne dataset:

1. Log relevant data to the `.rrd` files using the Rerun SDK.
   The Rerun SDK provides an API in Python, Rust, and C++ for logging data to
   `.rrd` files. The following example demonstrates how to log data to an
   `.rrd` file using the Python SDK:

   .. code-block:: python
  
       import rerun as rr

       # create a new recording
       recording = rr.new_recording(application_id="my_dataset", recording_id="my_scene.rrd")

       # log example data
       recording.log("my_points", rr.Points3D(positions, colors=colors, radii=0.5))

       recording.save("/path/to/my_scene.rrd")

2. Iterate through the samples in your dataset, associating the `.rrd` files
   with each sample. Use the `fiftyone.utils.rerun::RrdFile` to create a field
   that references the `.rrd` file. The following example demonstrates how to
   associate an `.rrd` file with a sample in a FiftyOne dataset:

   .. code-block:: python

        import fiftyone as fo
        from fiftyone.utils.rerun import RrdFile

        dataset = fo.Dataset(...)

        for sample in dataset:
            rrd_path = "/path/to/my_scene.rrd"
            sample["rerun"] = RrdFile(rrd_path)

        dataset.save()

3. Before you launch the FiftyOne App, start the Rerun server:

   .. code-block:: bash

        $ rerun --serve

   The Rerun server will start on `http://localhost:9090` by default.

   .. warning::
        The Rerun server must be running before you launch the FiftyOne App
        to visualize the `.rrd` files. Ensure your Rerun server and FiftyOne
        App are on the same machine or accessible network.

4. Launch the FiftyOne App.

   .. code-block:: bash

        $ fiftyone app launch

5. Open a sample. In the modal title bar, click on the "+" icon and select the
Rerun plugin.

.. tip::
    If you have a grouped dataset and have an RRD file that spans multiple
    samples or slices in the group, add the same `.rrd` file reference to each
    sample in a group. The Rerun panel will not reload when you navigate
    between samples so long as they refer to the same `.rrd` file.

The example below demonstrates this workflow using the NuScenes dataset.


.. _rerun_example

Example Usage with NuScenes Dataset
___________________________________

The
`FiftyOne Rerun plugin repo <https://github.com/voxel51/fiftyone-rerun-plugin>`_
has an example script that demonstrates how to combine FiftyOne with Rerun for
the `NuScenes dataset <https://www.nuscenes.org/>`_.

Follow the directions in the README to download the example data and launch the
script.