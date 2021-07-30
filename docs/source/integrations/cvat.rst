.. _cvat:

CVAT Integration
================

.. default-role:: code

CVAT is one of the most popular open-source image and video annotation tools on
the market. We've made it easy to upload your data and labels directly from
FiftyOne to CVAT to create, delete, and modify annotations.

.. note::

    Check out :doc:`this tutorial </tutorials/fixing_annotations>` to see how
    you can use FiftyOne to upload your data to CVAT to create, delete, and fix
    annotations.

Workflow Overview
_________________

In the general workflow to use CVAT and FiftyOne follows these steps:

1) Load a :ref:`labeled or unlabeled dataset<loading-datasets>` into FiftyOne

2) Explore the |Dataset| and find samples in need to additional annotations or 
   containing annotation mistakes

3) Create a |DatasetView| containing the samples that need to be annotated

4) Call :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>` to automatically  


.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Step 1: Load your data into FiftyOne
    dataset = foz.load_zoo_dataset("quickstart")

    # Step 2: Find a subset of data requiring annotation
    from fiftyone import ViewField as F

    results = dataset.evaluate_detections(pred_field="predictions", eval_key="eval")
    high_conf_view = dataset.filter_labels(
        "predictions", 
        F("confidence") > 0.8 & F("eval") == "fp"),
    )

    # Visualize and select samples with ground truth errors
    session = fo.launch_app(view=high_conf_view)
    
    # Step 3: Create a view of samples to annotate
    annot_view = dataset.select(session.selected)

    # Step 4: Send samples to CVAT
    info = annot_view.annotate(label_field="ground_truth", launch_editor=True)

    # Step 5: In CVAT, annotate samples and save

    # Step 6: Load updated annotations back into FiftyOne
    annot_view.load_annotations(info)


Authentication
______________

In order to connect to a CVAT server, you will need to login with your username
and password. This can be done in three ways:

1) (Recommended) Storing login credentials as environment variables

2) Entering login credentials whenever :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`
   is called

3) Storing login credentials in the FiftyOne config


Environment variables
---------------------

The recommended way to provide access to your CVAT username and password is to
store them in the `FIFTYONE_CVAT_USERNAME` and `FIFTYONE_CVAT_PASSWORD`
environment variables. These are automatically accessed by FiftyOne when calling 
:meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`.

.. tabs::

    .. tab:: Linux 

        In the command line, enter the following.

        .. code-block:: shell

            export FIFTYONE_CVAT_USERNAME=<your-cvat-username>
            export FIFTYONE_CVAT_PASSWORD=<your-cvat-password>

    .. tab:: Windows

        TODO

    .. tab:: Mac OS

        TODO


Command line prompt
-------------------

If you have not stored your CVAT login credentials, then you will be prompted
to enter your username and password through a command line prompt with every
call to :meth:`annotate() <fiftyone.core.collections.SampleCollection.annotate>`.

.. code:: python
    :linenos:

    view.annotate(label_field="ground_truth")

    
.. code-block:: text

    No config or environment variables found for authentication. Please enter CVAT login information. Set the environment variables `FIFTYONE_CVAT_USERNAME` and `FIFTYONE_CVAT_PASSWORD` to avoid this in the future.
    CVAT Username: MY_USERNAME
    CVAT Password:


FiftyOne config
---------------

.. note::

    This method is generally not recommended as it stores login information on disk
    in plain text.
