.. _albumentations-integration:

Albumentations Integration
===========================

.. default-role:: code

The `Albumentations <https://albumentations.ai/docs/>`_ library is 
the leading open-source library for image augmentation in machine learning. 
It is widely used in the computer vision community and is known for its
extensive collection of augmentations and its high performance.

Now, we've integrated Albumentations transformation pipelines directly with 
FiftyOne datasets, enabling you to visualize Albumentations augmentations
and test their effects on your data directly within the FiftyOne App!

This integration takes the form of a :ref:`FiftyOne plugin <using-plugins>`, 
which is easy to install and can be used entirely via a convenient graphical
interface.

With the FiftyOne Albumentations plugin, you can transform any and all labels 
of type :class:`fiftyone.core.labels.Detections`,
:class:`fiftyone.core.labels.Keypoints`, 
:class:`fiftyone.core.labels.Segmentation`,
and :class:`fiftyone.core.labels.Heatmap`, or just the images themselves.

This integration guide will focus on the setup process and the functionality
of the plugin. For a tutorial on how to curate your augmentations, check out
the :doc:`Data Augmentation Tutorial </tutorials/data_augmentation>`.

.. _albumentations-installation:

Setup
______

To get started, first make sure you have FiftyOne and Albumentations installed:

.. code-block:: bash

    $ pip install -U fiftyone albumentations


Next, install the
`FiftyOne Albumentations plugin <https://github.com/jacobmarks/fiftyone-albumentations-plugin>`_:

.. code-block:: bash

    $ fiftyone plugins download https://github.com/jacobmarks/fiftyone-albumentations-plugin

.. note::

    If you have the 
    `FiftyOne Plugin Utils plugin <https://github.com/voxel51/fiftyone-plugins>`_ 
    installed, you can also install the Albumentations plugin via the `install_plugin`
    operator, selecting the Albumentations plugin from the community dropdown menu.


You will also need to load (and download if necessary) a dataset to apply the
augmentations to. For this guide, we'll use the the
`quickstart dataset <https://docs.voxel51.com/user_guide/dataset_zoo/datasets.html#quickstart>`_:

.. code-block:: python

    import fiftyone as fo
    import fiftyone.zoo as foz

    ## only take 10 samples for quick demonstration
    dataset = foz.load_zoo_dataset("quickstart", max_samples=10)

    # only keep the ground truth labels
    dataset.select_fields("ground_truth").keep_fields()

    session = fo.launch_app(dataset)


.. note::

    The quickstart dataset only contains 
    :class:`fiftyone.core.labels.Detections` labels. If you want to test 
    Albumentations transformations on other label types, here are some quick
    examples to get you started, using FiftyOne's
    :ref:`Hugging Face Transformers <huggingface-integration>` and
    :ref:`Ultralytics <ultralytics-integration>` integrations:

    .. code-block:: bash

        pip install -U transformers ultralytics

    .. code-block:: python

        import fiftyone as fo
        import fiftyone.zoo as foz

        from ultralytics import YOLO

        # Keypoints
        model = YOLO("yolov8l-pose.pt")
        dataset.apply_model(model, label_field="keypoints")

        # Instance Segmentation
        model = YOLO("yolov8l-seg.pt")
        dataset.apply_model(model, label_field="instances")

        # Semantic Segmentation
        model = foz.load_zoo_model(
            "segmentation-transformer-torch",
            name_or_path="Intel/dpt-large-ade",
        )
        dataset.apply_model(model, label_field="mask")

        # Heatmap
        model = foz.load_zoo_model(
            "depth-estimation-transformer-torch",
            name_or_path="LiheYoung/depth-anything-small-hf",
        )
        dataset.apply_model(model, label_field="depth_map")