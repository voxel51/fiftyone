.. _ultralytics-integration:

Ultralytics Integration
=======================

.. default-role:: code

FiftyOne integrates natively with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_, so
you can load, fine-tune, and run inference with your favorite Ultralytics
models on your FiftyOne datasets with just a few lines of code!

.. _ultralytics-setup:

Setup
_____

To get started with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_, just install the
following packages:

.. code-block:: shell

    pip install ultralytics "torch>=1.8"

.. _ultralytics-inference:

Inference
_________

The examples below show how to run inference with various Ultralytics models on
the following sample dataset:

.. code-block:: python
    :linenos:

    # Suppress Ultralytics logging
    import os; os.environ["YOLO_VERBOSE"] = "False"

    import fiftyone as fo
    import fiftyone.zoo as foz
    import fiftyone.utils.ultralytics as fou

    from ultralytics import YOLO

    # Load an example dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=25)
    dataset.select_fields().keep_fields()

.. _ultralytics-object-detection:

Object detection
----------------

You can use the builtin
:func:`to_detections() <fiftyone.utils.ultralytics.to_detections>` utility to
convert Ultralytics bounding boxes to
:ref:`FiftyOne format <object-detection>`:

.. code-block:: python
    :linenos:

    # YOLOv8
    model = YOLO("yolov8s.pt")
    # model = YOLO("yolov8m.pt")
    # model = YOLO("yolov8l.pt")
    # model = YOLO("yolov8x.pt")

    # YOLOv5
    # model = YOLO("yolov5s.pt")
    # model = YOLO("yolov5m.pt")
    # model = YOLO("yolov5l.pt")
    # model = YOLO("yolov5x.pt")

    for sample in dataset.iter_samples(progress=True):
        result = model(sample.filepath)[0]
        sample["boxes"] = fou.to_detections(result)
        sample.save()

    session = fo.launch_app(dataset)

.. image:: /images/integrations/ultralytics_boxes.jpg
   :alt: ultralytics-boxes
   :align: center

.. _ultralytics-instance-segmentation:

Instance segmentation
---------------------

You can use the builtin
:func:`to_instances() <fiftyone.utils.ultralytics.to_instances>` and
:func:`to_polylines() <fiftyone.utils.ultralytics.to_polylines>` utilities to
convert Ultralytics instance segmentations to
:ref:`FiftyOne format <instance-segmentation>`:

You can use the builtin
:func:`to_detections() <fiftyone.utils.ultralytics.to_detections>` utility to
convert YOLO boxes to FiftyOne format:

.. code-block:: python
    :linenos:

    model = YOLO("yolov8s-seg.pt")
    # model = YOLO("yolov8m-seg.pt")
    # model = YOLO("yolov8l-seg.pt")
    # model = YOLO("yolov8x-seg.pt")

    for sample in dataset.iter_samples(progress=True):
        result = model(sample.filepath)[0]
        sample["detections"] = fou.to_detections(result)
        sample["instances"] = fou.to_instances(result)
        sample["polylines"] = fou.to_polylines(result)
        sample.save()

    session = fo.launch_app(dataset)

.. image:: /images/integrations/ultralytics_instances.jpg
   :alt: ultralytics-instances
   :align: center

.. _ultralytics-keypoints:

Keypoints
---------

You can use the builtin
:func:`to_keypoints() <fiftyone.utils.ultralytics.to_keypoints>` utility to
convert Ultralytics keypoints to :ref:`FiftyOne format <keypoints>`:

.. code-block:: python
    :linenos:

    model = YOLO("yolov8s-pose.pt")
    # model = YOLO("yolov8m-pose.pt")
    # model = YOLO("yolov8l-pose.pt")
    # model = YOLO("yolov8x-pose.pt")

    for sample in dataset.iter_samples(progress=True):
        result = model(sample.filepath)[0]
        sample["keypoints"] = fou.to_keypoints(result)
        sample.save()

    # Store the COCO-pose keypoint skeleton so the App can render it
    dataset.default_skeleton = fo.KeypointSkeleton(
        labels=[
            "nose", "left eye", "right eye", "left ear", "right ear",
            "left shoulder", "right shoulder", "left elbow", "right elbow",
            "left wrist", "right wrist", "left hip", "right hip",
            "left knee", "right knee", "left ankle", "right ankle",
        ],
        edges=[
            [11, 5, 3, 1, 0, 2, 4, 6, 12],
            [9, 7, 5, 6, 8, 10],
            [15, 13, 11, 12, 14, 16],
        ],
    )

    session = fo.launch_app(dataset)

.. image:: /images/integrations/ultralytics_keypoints.jpg
   :alt: ultralytics-keypoints
   :align: center

.. _ultralytics-batch-inference:

Batch inference
---------------

Any of the above loops can be executed using batch inference using the pattern
below:

.. code-block:: python
    :linenos:

    from fiftyone.core.utils import iter_batches

    # The inference batch size
    batch_size = 4

    predictions = []
    for filepaths in iter_batches(dataset.values("filepath"), batch_size):
        results = model(filepaths)
        predictions.extend(fou.to_detections(results))

    dataset.set_values("predictions", predictions)

.. note::

    See :ref:`this section <batch-updates>` for more information about
    performing batch updates to your FiftyOne dataset.

.. _ultralytics-training:

Training
________

You can use FiftyOne's builtin :ref:`YOLOv5 exporter <YOLOv5Dataset-export>` to
export your FiftyOne datasets for use with Ultralytics models.

For example, the code below prepares a random subset of the
:ref:`Open Images v7 dataset <dataset-zoo-open-images-v7>` for fine-tuning:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.utils.ultralytics as fou
    import fiftyone.zoo as foz

    # The path to export the dataset
    EXPORT_DIR = "/tmp/oiv7-yolo"

    # Prepare train split

    train = foz.load_zoo_dataset(
        "open-images-v7",
        split="train",
        label_types=["detections"],
        max_samples=100,
    )

    # YOLO format requires a common classes list
    classes = train.default_classes

    train.export(
        export_dir=EXPORT_DIR,
        dataset_type=fo.types.YOLOv5Dataset,
        label_field="ground_truth",
        split="train",
        classes=classes,
    )

    # Prepare validation split

    validation = foz.load_zoo_dataset(
        "open-images-v7",
        split="validation",
        label_types=["detections"],
        max_samples=10,
    )

    validation.export(
        export_dir=EXPORT_DIR,
        dataset_type=fo.types.YOLOv5Dataset,
        label_field="ground_truth",
        split="val",  # Ultralytics uses 'val'
        classes=classes,
    )

From here,
`training an Ultralytics model <https://docs.ultralytics.com/modes/train>`_ is
as simple as passing the path to the dataset YAML file:

.. code-block:: python
    :linenos:

    from ultralytics import YOLO

    # The path to the `dataset.yaml` file we created above
    YAML_FILE = "/tmp/oiv7-yolo/dataset.yaml"

    # Load a model
    model = YOLO("yolov8s.pt")  # load a pretrained model
    # model = YOLO("yolov8s.yaml")  # build a model from scratch

    # Train the model
    model.train(data=YAML_FILE, epochs=3)

    # Evaluate model on the validation set
    metrics = model.val()

    # Export the model
    path = model.export(format="onnx")
