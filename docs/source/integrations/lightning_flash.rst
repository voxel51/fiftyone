.. _lightning-flash:

Lightning Flash Integration
===========================

.. default-role:: code

We've collaborated with the
`PyTorch Lightning <https://github.com/PyTorchLightning/pytorch-lightning>`_
team to make it easy to train
`Lightning Flash <https://github.com/PyTorchLightning/lightning-flash>`_ tasks
on your :ref:`FiftyOne datasets <using-datasets>` and add predictions from your
Flash models to your FiftyOne datasets for visualization and analysis, all in
just a few lines of code!

The following Flash tasks are supported natively by FiftyOne:

- :ref:`Image classification <flash:image_classification>`
- :ref:`Object detection <flash:object_detection>`
- :ref:`Semantic segmentation <flash:semantic_segmentation>`
- :ref:`Video classification <flash:video_classification>`
- :ref:`Image embeddings <flash:image_embedder>`

.. note::

    As Lightning Flash adds support for additional computer vision tasks, we'll
    roll out native support for them in FiftyOne via this integration!

.. _flash-install:

Setup
_____

In order to use the Lightning Flash integration, you'll need to
`install Flash <https://lightning-flash.readthedocs.io/en/latest/installation.html>`_:

.. code-block:: shell

    # This integration currently requires these versions explicitly
    pip install lightning-flash>=0.7.0dev
    pip install pytorch-lightning

Depending on the type of Flash tasks that you intend to use, you will also need
to install some package extras:

.. code-block:: shell

    # Required to use image tasks
    pip install 'lightning-flash[image]'

    # Required to use video tasks
    pip install 'lightning-flash[video]'

You can always proceed without these initially, as you'll be prompted to
install the appropriate extras when you use a feature that requires them.

.. _flash-model-training:

Model training
______________

You can easily train or finetune a Flash
:class:`Task<flash:flash.core.model.Task>` on your
:ref:`FiftyOne datasets <using-datasets>` with just a few lines of code using
Flash's builtin
:meth:`DataModule.from_fiftyone() <flash:flash.core.data.data_module.DataModule.from_fiftyone>`
method, which is implemented for each of the Flash tasks shown below.

.. tabs::

    .. tab:: Image classification

        The example below finetunes a Flash
        :ref:`image classification task <flash:image_classification>` on a
        FiftyOne dataset with |Classification| ground truth labels:

        .. code-block:: python
            :linenos:

            from itertools import chain

            from flash.core.classification import FiftyOneLabelsOutput
            from flash.image import ImageClassificationData, ImageClassifier
            from flash import Trainer

            import fiftyone as fo
            import fiftyone.utils.random as four
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset
            dataset = foz.load_zoo_dataset(
                "cifar10", split="test", max_samples=300
            )
            dataset.untag_samples("test")

            # Create splits from the dataset
            splits = {"train": 0.7, "test": 0.1, "val": 0.1, "pred": 0.1}
            four.random_split(dataset, splits)

            # Here we use views into one dataset,
            # but you can also use a different dataset for each split
            train_dataset = dataset.match_tags("train")
            test_dataset = dataset.match_tags("test")
            val_dataset = dataset.match_tags("val")
            predict_dataset = dataset.match_tags("pred")

            # 2 Create the Datamodule
            datamodule = ImageClassificationData.from_fiftyone(
                train_dataset=train_dataset,
                test_dataset=test_dataset,
                val_dataset=val_dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                batch_size=4,
                num_workers=4,
            )

            # 3 Build the model
            model = ImageClassifier(
                backbone="resnet18",
                labels=datamodule.labels,
            )

            # 4 Create the trainer
            trainer = Trainer(
                max_epochs=1, limit_train_batches=10, limit_val_batches=10,
            )

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule)

            # 6 Save it!
            trainer.save_checkpoint("/tmp/image_classification_model.pt")

            # 7 Generate predictions
            predictions = trainer.predict(
                model,
                datamodule=datamodule,
                output=FiftyOneLabelsOutput(labels=datamodule.labels),
            )
            predictions = list(chain.from_iterable(predictions))  # flatten batches

            # Map filepaths to predictions
            predictions = {p["filepath"]: p["predictions"] for p in predictions}

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values(
                "flash_predictions", predictions, key_field="filepath",
            )

            # 8 Analyze predictions in the App
            session = fo.launch_app(predict_dataset)

    .. tab:: Object detection

        This example below finetunes a Flash
        :ref:`object detection task <flash:object_detection>` on a FiftyOne
        dataset with |Detections| ground truth labels:

        .. code-block:: python
            :linenos:

            from itertools import chain

            from flash import Trainer
            from flash.image import ObjectDetectionData, ObjectDetector
            from flash.image.detection.output import FiftyOneDetectionLabelsOutput

            import fiftyone as fo
            import fiftyone.utils.random as four
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset
            dataset = foz.load_zoo_dataset(
               "coco-2017",
               split="validation",
               max_samples=100,
               classes=["person"],
            )

            # Create splits from the dataset
            splits = {"train": 0.7, "test": 0.1, "val": 0.1}
            four.random_split(dataset, splits)

            # Here we use views into one dataset,
            # but you can also use a different dataset for each split
            train_dataset = dataset.match_tags("train")
            test_dataset = dataset.match_tags("test")
            val_dataset = dataset.match_tags("val")
            predict_dataset = train_dataset.take(5)

            # Remove background class, it gets added by datamodule
            dataset.default_classes.pop(0)

            # 2 Create the Datamodule
            datamodule = ObjectDetectionData.from_fiftyone(
                train_dataset=train_dataset,
                test_dataset=test_dataset,
                val_dataset=val_dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                transform_kwargs={"image_size": 512},
                batch_size=4,
            )

            # 3 Build the model
            model = ObjectDetector(
                head="efficientdet",
                backbone="d0",
                num_classes=datamodule.num_classes,
                image_size=512,
            )

            # 4 Create the trainer
            trainer = Trainer(max_epochs=1, limit_train_batches=10)

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")

            # 6 Save it!
            trainer.save_checkpoint("/tmp/object_detection_model.pt")

            # 7 Generate predictions
            predictions = trainer.predict(
                model,
                datamodule=datamodule,
                output=FiftyOneDetectionLabelsOutput(labels=datamodule.labels),
            )
            predictions = list(chain.from_iterable(predictions))  # flatten batches

            # Map filepaths to predictions
            predictions = {p["filepath"]: p["predictions"] for p in predictions}

            # Add predictions to FiftyOne dataset
            dataset.set_values(
                "flash_predictions", predictions, key_field="filepath",
            )

            # 8 Analyze predictions in the App
            session = fo.launch_app(predict_dataset)

    .. tab:: Semantic segmentation

        This example below finetunes a Flash
        :ref:`semantic segmentation task <flash:semantic_segmentation>` on a
        FiftyOne dataset with |Segmentation| ground truth labels:

        .. code-block:: python
            :linenos:

            from itertools import chain

            from flash import Trainer
            from flash.core.data.utils import download_data
            from flash.image import SemanticSegmentation, SemanticSegmentationData
            from flash.image.segmentation.output import FiftyOneSegmentationLabelsOutput

            import fiftyone as fo
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset

            # source: https://www.kaggle.com/kumaresanmanickavelu/lyft-udacity-challenge
            download_data(
                "https://github.com/ongchinkiat/LyftPerceptionChallenge/releases/download/v0.1/carla-capture-20180513A.zip",
                "/tmp/carla_data/",
            )

            dataset = fo.Dataset.from_dir(
                dataset_dir="/tmp/carla_data",
                dataset_type=fo.types.ImageSegmentationDirectory,
                data_path="CameraRGB",
                labels_path="CameraSeg",
                force_grayscale=True,
                shuffle=True,
            )

            # Just test and val on train dataset for this example
            predict_dataset = dataset.take(5)

            # 2 Create the Datamodule
            datamodule = SemanticSegmentationData.from_fiftyone(
                train_dataset=dataset,
                test_dataset=dataset,
                val_dataset=dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                transform_kwargs=dict(image_size=(256, 256)),
                num_classes=21,
                batch_size=4,
            )

            # 3 Build the model
            model = SemanticSegmentation(
                backbone="mobilenetv3_large_100",
                head="fpn",
                num_classes=datamodule.num_classes,
            )

            # 4 Create the trainer
            trainer = Trainer(
                max_epochs=1, limit_train_batches=10, limit_val_batches=5
            )

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")

            # 6 Save it!
            trainer.save_checkpoint("/tmp/semantic_segmentation_model.pt")

            # 7 Generate predictions
            predictions = trainer.predict(
                model,
                datamodule=datamodule,
                output=FiftyOneSegmentationLabelsOutput(),
            )
            predictions = list(chain.from_iterable(predictions))  # flatten batches

            # Map filepaths to predictions
            predictions = {p["filepath"]: p["predictions"] for p in predictions}

            # Add predictions to FiftyOne dataset
            dataset.set_values(
                "flash_predictions", predictions, key_field="filepath",
            )

            # 8 Analyze predictions in the App
            session = fo.launch_app(predict_dataset)

    .. tab:: Video classification

        The example below finetunes a Flash
        :ref:`video classification task <flash:video_classification>` on a
        FiftyOne dataset with |Classification| ground truth labels:

        .. code-block:: python
            :linenos:

            from itertools import chain

            from flash.core.classification import FiftyOneLabelsOutput
            from flash import Trainer
            from flash.video import VideoClassificationData, VideoClassifier

            import fiftyone as fo
            import fiftyone.utils.random as four
            import fiftyone.zoo as foz

            # 1 Load the data
            dataset = foz.load_zoo_dataset(
                "kinetics-700-2020",
                split="validation",
                max_samples=15,
                shuffle=True,
            )
            dataset.untag_samples("validation")

            # Replace spaces in class names with underscore
            labels = dataset.distinct("ground_truth.label")
            labels_map = {l: l.replace(" ", "_") for l in labels}
            dataset = dataset.map_labels("ground_truth", labels_map).clone()

            # Get list of labels in dataset
            labels = dataset.distinct("ground_truth.label")

            # Create splits from the dataset
            splits = {"train": 0.7, "pred": 0.3}
            four.random_split(dataset, splits)

            # Here we use views into one dataset,
            # but you can also use a different dataset for each split
            train_dataset = dataset.match_tags("train")
            predict_dataset = dataset.match_tags("pred")

            # 2 Create the Datamodule
            datamodule = VideoClassificationData.from_fiftyone(
                train_dataset=dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                batch_size=1,
                clip_sampler="uniform",
                clip_duration=1,
                decode_audio=False,
            )

            # 3 Build the model
            model = VideoClassifier(
                backbone="x3d_xs", labels=datamodule.labels, pretrained=False,
            )

            # 4 Create the trainer
            trainer = Trainer(max_epochs=1, limit_train_batches=5)

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")

            # 6 Save it!
            trainer.save_checkpoint("/tmp/video_classification.pt")

            # 7 Generate predictions
            predictions = trainer.predict(
                model,
                datamodule=datamodule,
                output=FiftyOneLabelsOutput(labels=datamodule.labels),
            )
            predictions = list(chain.from_iterable(predictions))  # flatten batches

            # Map filepaths to predictions
            predictions = {p["filepath"]: p["predictions"] for p in predictions}

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values(
                "flash_predictions", predictions, key_field="filepath",
            )

            # 8 Analyze predictions in the App
            session = fo.launch_app(predict_dataset)

.. _flash-model-predictions:

Model predictions
_________________

Once you have a trained Flash task, you can add model predictions to a FiftyOne
|Dataset| or |DatasetView| in just a few lines of code using either of the
patterns below.

Applying Flash models to FiftyOne datasets
------------------------------------------

The easiest way to generate predictions on a FiftyOne |Dataset| or
|DatasetView| with a Flash model is to use the
builtin :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
function, which natively accepts Flash models of any
:ref:`supported type <lightning-flash>`.

Behind the scenes, FiftyOne will construct the appropriate Flash
:mod:`Trainer <flash:flash.core.trainer>` and FiftyOne-style
:class:`Output <flash:flash.core.data.io.output.Output>` to perform the
inference and output the predictions as |Label| instances that are added to
your dataset.

.. code-block:: python
    :linenos:

    from flash.core.classification import FiftyOneLabelsOutput
    from flash.image import ImageClassifier, ObjectDetector

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
    num_classes = len(dataset.distinct("ground_truth.detections.label"))

    # Load your Flash model
    cls_model = ImageClassifier(
        backbone="resnet18", num_classes=num_classes
    )

    det_model = ObjectDetector(
        head="efficientdet",
        backbone="d0",
        num_classes=91,
        image_size=512,
    )

    # Predict!
    dataset.apply_model(
        cls_model, label_field="flash_classifications",
    )

    # Some models require transform kwargs that can be pass in
    transform_kwargs = {"image_size": 512}
    dataset.apply_model(
        det_model,
        label_field="flash_detections",
        transform_kwargs=transform_kwargs,
    )

.. note::

    When performing inference with Flash models, you can pass additional
    ``trainer_kwargs`` in a dictionary like ``trainer_kwargs={"gpus": 8}`` to
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
    which are used to initialize the Flash
    :mod:`Trainer <flash:flash.core.trainer>` to configure distributed and/or
    parallelized inference! See
    :meth:`apply_flash_model() <fiftyone.utils.flash.apply_flash_model>`
    for more details about supported keyword arguments.

Manually adding predictions
---------------------------

If you've already loaded your datasets into Flash
:class:`DataModules <flash:flash.core.data.data_module.DataModule>` without
using FiftyOne, you can still easily use FiftyOne to analyze your model's
predictions by providing the
:class:`Output <flash:flash.core.data.io.output.Output>` for the
:ref:`FiftyOne-style output <flash:fiftyone_labels>` of the appropriate
type when generating predictions.

Specifying FiftyOne outputs will result in predictions returned as
|Label| objects that you can easily add to your FiftyOne datasets via
:meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`.

.. code-block:: python
    :linenos:

    from itertools import chain

    from flash import Trainer
    from flash.core.classification import FiftyOneLabelsOutput
    from flash.image import ImageClassificationData, ImageClassifier

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
    labels = dataset.distinct("ground_truth.detections.label")

    # Load your Flash model
    model = ImageClassifier(labels=labels)

    # Create prediction datamodule
    datamodule = ImageClassificationData.from_fiftyone(
        predict_dataset=dataset,
        batch_size=1,
    )

    # Output FiftyOne format
    output = FiftyOneLabelsOutput(
        return_filepath=False, labels=labels
    )
    # Predict with trainer
    predictions = Trainer().predict(model, datamodule=datamodule, output=output)

    predictions = list(chain.from_iterable(predictions))  # flatten batches

    # Predictions is a list of Label objects since ``return_filepath=False``
    # Order corresponds to order of the ``predict_dataset``

    # Add predictions to dataset
    dataset.set_values("flash_predictions", predictions)

    # Visualize in the App
    session = fo.launch_app(dataset)

.. note::

    FiftyOne outputs have an optional
    :class:`return_filepath=False <flash:flash.core.classification.FiftyOneLabelsOutput>`
    flag that supports returning a list of |Label| objects corresponding to the
    sample ordering of the ``predict_dataset`` rather than the default dicts
    that contain both the |Label| objects and the ``filepath`` of the
    associated media.

Specifying class names
----------------------

Generally, Flash model checkpoints will contain the class label strings for the
model. However, if necessary, you can also explicitly pass the labels to most
:class:`Output <flash:flash.core.data.io.output.Output>` instances,
FiftyOne-style outputs included:

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    from flash import Trainer
    from flash.image import ImageClassificationData, ImageClassifier
    from flash.core.classification import FiftyOneLabelsOutput

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    datamodule = ImageClassificationData.from_fiftyone(
        predict_dataset=dataset, batch_size=1
    )

    # Load your Flash model
    num_classes = 100
    model = ImageClassifier(backbone="resnet18", num_classes=num_classes)

    # Configure output with class labels
    labels = [
        "label_" + str(i) for i in range(num_classes)
    ]  # example class labels
    output = FiftyOneLabelsOutput(
        labels=labels
    )  # output FiftyOne format

    # Predict with model
    trainer = Trainer()
    predictions = trainer.predict(
        model, datamodule=datamodule, output=output
    )

    predictions = list(chain.from_iterable(predictions))  # flatten batches

    # Map filepaths to predictions
    predictions = {p["filepath"]: p["predictions"] for p in predictions}

    # Add predictions to dataset
    dataset.set_values(
        "flash_predictions", predictions, key_field="filepath"
    )

    print(dataset.distinct("flash_predictions.label"))
    # ['label_57', 'label_60']

    # Visualize in the App
    session = fo.launch_app(dataset)

.. _flash-image-embeddings:

Image embeddings
________________

If you use Lightning Flash's
:ref:`image embeddings tasks <flash:image_embedder>` to generate feature
vectors for your image datasets, then use can easily leverage FiftyOne's
:ref:`dimensionality reduction <brain-embeddings-visualization>` and
:ref:`interactive plotting <embeddings-plots>` capabilities to visualize your
Flash model's embeddings and execute powerful workflows like
:doc:`cluster analysis </tutorials/image_embeddings>` and
:ref:`similarity search <app-similarity>`, all in only a few lines of code!

.. code-block:: python
    :linenos:

    import numpy as np

    from flash.core.data.utils import download_data
    from flash.image import ImageClassificationData, ImageEmbedder
    from flash import Trainer

    import fiftyone as fo
    import fiftyone.brain as fob

    # 1 Download data
    download_data(
        "https://pl-flash-data.s3.amazonaws.com/hymenoptera_data.zip",
        "/tmp",
    )

    # 2 Load data into FiftyOne
    dataset = fo.Dataset.from_dir(
        "/tmp/hymenoptera_data/test/",
        fo.types.ImageClassificationDirectoryTree,
    )
    datamodule = ImageClassificationData.from_fiftyone(
        predict_dataset=dataset,
        batch_size=1,
    )

    # 3 Load model
    embedder = ImageEmbedder(
        backbone="vision_transformer",
        training_strategy="barlow_twins",
        head="barlow_twins_head",
        pretraining_transform="barlow_twins_transform",
        training_strategy_kwargs={"latent_embedding_dim": 128},
        pretraining_transform_kwargs={"size_crops": [32]},
    )

    # 4 Generate embeddings
    trainer = Trainer()
    embeddings = trainer.predict(embedder, datamodule=datamodule)
    embeddings = np.stack(sum(embedding_batches, []))

    # 5 Visualize images
    session = fo.launch_app(dataset)

    # 6 Visualize image embeddings
    results = fob.compute_visualization(dataset, embeddings=embeddings)
    plot = results.visualize(labels="ground_truth.label")
    plot.show()

.. note::

    You can also directly pass your Flash embedding model to
    :meth:`compute_embeddings() <fiftyone.core.collections.SampleCollection.compute_embeddings>`
    and let FiftyOne handle performing the inference!

.. image:: /images/integrations/flash_embeddings.png
   :alt: embeddings_example
   :align: center
