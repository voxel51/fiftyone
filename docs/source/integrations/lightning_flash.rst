.. _lightning-flash:

Lightning Flash Integration
===========================

.. default-role:: code

We've collaborated with `Grid AI <https://www.grid.ai>`_, the team behind the
amazing `PyTorch Lightning <https://github.com/PyTorchLightning/pytorch-lightning>`_
and `Lightning Flash <https://github.com/PyTorchLightning/lightning-flash>`_
projects, to make it easy to train
:class:`Flash tasks <flash:flash.core.model.Task>` on your
:ref:`FiftyOne datasets <using-datasets>` and add predictions from your Flash
models to your FiftyOne datasets for visualization and analysis, all in just a
few lines of code!

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

    pip install lightning-flash

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

            from flash import Trainer
            from flash.core.classification import FiftyOneLabels
            from flash.core.finetuning import FreezeUnfreeze
            from flash.image import ImageClassificationData, ImageClassifier

            import fiftyone as fo
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset

            dataset = foz.load_zoo_dataset(
                "cifar10", split="test", max_samples=40, shuffle=True
            )

            # Here we use views into one dataset, but you can also use a different dataset
            # for each split
            train_dataset = dataset[:20]
            test_dataset = dataset[20:25]
            val_dataset = dataset[25:30]
            predict_dataset = dataset[30:40]

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
                num_classes=datamodule.num_classes,
                serializer=FiftyOneLabels(),
            )

            # 4 Create the trainer
            trainer = Trainer(max_epochs=1, limit_train_batches=1, limit_val_batches=1)

            # 5 Finetune the model
            trainer.finetune(
                model,
                datamodule=datamodule,
                strategy=FreezeUnfreeze(unfreeze_epoch=1),
            )

            # 6 Save it!
            trainer.save_checkpoint("image_classification_model.pt")

            # 7 Generate predictions

            # For example purposes, we'll load a pretrained checkpoint
            model = ImageClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/image_classification_model.pt"
            )
            model.serializer = FiftyOneLabels()  # output FiftyOne format

            predictions = trainer.predict(model, datamodule=datamodule)
            predictions = list(chain.from_iterable(predictions)) # flatten batches

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values("flash_predictions", predictions)

            # 8 Analyze predictions in the App
            session = fo.launch_app(view=predict_dataset)

    .. tab:: Object detection

        This example below finetunes a Flash
        :ref:`object detection task <flash:object_detection>` on a FiftyOne
        dataset with |Detections| ground truth labels:

        .. code-block:: python
            :linenos:

            from itertools import chain

            from flash import Trainer
            from flash.image import ObjectDetectionData, ObjectDetector
            from flash.image.detection.serialization import FiftyOneDetectionLabels

            import fiftyone as fo
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset

            dataset = foz.load_zoo_dataset("quickstart", max_samples=40, shuffle=True)

            # Here we use views into one dataset, but you can also use a different dataset
            # for each split
            train_dataset = dataset[:20]
            test_dataset = dataset[20:25]
            val_dataset = dataset[25:30]
            predict_dataset = dataset[30:40]

            # 2 Create the Datamodule
            datamodule = ObjectDetectionData.from_fiftyone(
                train_dataset=train_dataset,
                test_dataset=test_dataset,
                val_dataset=val_dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                batch_size=4,
                num_workers=4,
            )

            # 3 Build the model
            model = ObjectDetector(
                model="retinanet",
                num_classes=datamodule.num_classes,
                serializer=FiftyOneDetectionLabels(),
            )

            # 4 Create the trainer
            trainer = Trainer(max_epochs=1, limit_train_batches=1, limit_val_batches=1)

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule)

            # 6 Save it!
            trainer.save_checkpoint("object_detection_model.pt")

            # 7 Generate predictions

            # For example purposes, we'll load a pretrained checkpoint
            model = ObjectDetector.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
            )
            model.serializer = FiftyOneDetectionLabels()  # output FiftyOne format

            predictions = trainer.predict(model, datamodule=datamodule)
            predictions = list(chain.from_iterable(predictions)) # flatten batches

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values("flash_predictions", predictions)

            # 8 Analyze predictions in the App
            session = fo.launch_app(view=predict_dataset)

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
            from flash.image.segmentation.serialization import FiftyOneSegmentationLabels

            import fiftyone as fo
            import fiftyone.zoo as foz

            # 1 Load your FiftyOne dataset

            # source: https://www.kaggle.com/kumaresanmanickavelu/lyft-udacity-challenge
            download_data(
                "https://github.com/ongchinkiat/LyftPerceptionChallenge/releases/download/v0.1/carla-capture-20180513A.zip",
                "data/"
            )

            dataset = fo.Dataset.from_dir(
                dataset_dir="data",
                dataset_type=fo.types.ImageSegmentationDirectory,
                data_path="CameraRGB",
                labels_path="CameraSeg",
                force_grayscale=True,
                max_samples=40,
                shuffle=True,
            )

            # Here we use views into one dataset, but you can also create a
            # different dataset for each split
            train_dataset = dataset[:20]
            test_dataset = dataset[20:25]
            val_dataset = dataset[25:30]
            predict_dataset = dataset[30:40]

            # 2 Create the Datamodule
            datamodule = SemanticSegmentationData.from_fiftyone(
                train_dataset=train_dataset,
                test_dataset=test_dataset,
                val_dataset=val_dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                batch_size=4,
                num_workers=4,
            )

            # 3 Build the model
            model = SemanticSegmentation(
                backbone="fcn_resnet50",
                num_classes=datamodule.num_classes,
                serializer=FiftyOneSegmentationLabels(),
            )

            # 4 Create the trainer
            trainer = Trainer(max_epochs=1, fast_dev_run=1)

            # 5 Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")

            # 6 Save it!
            trainer.save_checkpoint("semantic_segmentation_model.pt")

            # 7 Generate predictions

            # For example purposes, we'll load a pretrained checkpoint
            model = ObjectDetector.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/semantic_segmentation_model.pt"
            )
            model.serializer = FiftyOneSegmentationLabels()  # output FiftyOne format

            predictions = trainer.predict(model, datamodule=datamodule)
            predictions = list(chain.from_iterable(predictions)) # flatten batches

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values("flash_predictions", predictions)

            # 8 Analyze predictions in the App
            session = fo.launch_app(view=predict_dataset)

    .. tab:: Video classification

        The example below finetunes a Flash
        :ref:`video classification task <flash:video_classification>` on a
        FiftyOne dataset with |Classification| ground truth labels:

        .. code-block:: python
            :linenos:

            from torch.utils.data.sampler import RandomSampler

            import flash
            from flash.core.classification import FiftyOneLabels
            from flash.core.data.utils import download_data
            from flash.video import VideoClassificationData, VideoClassifier

            import fiftyone as fo

            # 1 Download data
            download_data("https://pl-flash-data.s3.amazonaws.com/kinetics.zip")

            # 2 Load data into FiftyOne
            # Here we use different datasets for each split, but you can also use views
            # into the same dataset

            train_dataset = fo.Dataset.from_dir(
                "data/kinetics/train",
                fo.types.VideoClassificationDirectoryTree,
                label_field="ground_truth",
                max_samples=5,
            )

            val_dataset = fo.Dataset.from_dir(
                "data/kinetics/val",
                fo.types.VideoClassificationDirectoryTree,
                label_field="ground_truth",
                max_samples=5,
            )

            predict_dataset = fo.Dataset.from_dir(
                "data/kinetics/predict",
                fo.types.VideoDirectory,
                max_samples=5,
            )

            # 3 Finetune a model

            classifier = VideoClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/video_classification.pt",
                pretrained=False,
            )

            datamodule = VideoClassificationData.from_fiftyone(
                train_dataset=train_dataset,
                val_dataset=val_dataset,
                predict_dataset=predict_dataset,
                label_field="ground_truth",
                batch_size=8,
                clip_sampler="uniform",
                clip_duration=1,
                video_sampler=RandomSampler,
                decode_audio=False,
                num_workers=8,
            )

            trainer = flash.Trainer(max_epochs=1, fast_dev_run=1)
            trainer.finetune(classifier, datamodule=datamodule)
            trainer.save_checkpoint("video_classification.pt")

            # 4 Predict from checkpoint

            # For example purposes, we'll load a pretrained checkpoint
            classifier = VideoClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/video_classification.pt",
                pretrained=False,
            )
            classifier.serializer = FiftyOneLabels()

            filepaths = predict_dataset.values("filepath")
            predictions = classifier.predict(filepaths)

            # Add predictions to FiftyOne dataset
            predict_dataset.set_values("predictions", predictions)

            # 5 Visualize in FiftyOne App
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
:class:`Serializer <flash:flash.core.data.process.Serializer>` to perform the
inference and output the predictions as |Label| instances that are added to
your dataset.

.. code-block:: python
    :linenos:

    from flash.image import ObjectDetector

    import fiftyone as fo
    import fiftyone.zoo as foz

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Load your Flash model
    model = ObjectDetector.load_from_checkpoint(
        "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
    )

    # Predict!
    dataset.apply_model(model, label_field="flash_predictions")

    # Visualize
    session = fo.launch_app(dataset)

.. note::

    When performing inference with Flash models, you can pass additional
    arguments like ``gpus=8`` to
    :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`,
    which are used to initialize the Flash
    :mod:`Trainer <flash:flash.core.trainer>` to configure distributed and/or
    parallelized inference!

Manually adding predictions
---------------------------

If you've already loaded your datasets into Flash
:class:`DataModules <flash:flash.core.data.data_module.DataModule>` without
using FiftyOne, you can still easily use FiftyOne to analyze your model's
predictions by swapping out your model's default
:class:`Serializer <flash:flash.core.data.process.Serializer>` for the
:ref:`FiftyOne-style serializer <flash:fiftyone_labels>` of the appropriate
type.

Flash models with FiftyOne serializers will directly return predictions as
|Label| objects that you can easily add to your FiftyOne datasets via
:meth:`set_values() <fiftyone.core.collections.SampleCollection.set_values>`.

.. code-block:: python
    :linenos:

    from itertools import chain

    import fiftyone as fo
    import fiftyone.zoo as foz

    from flash import Trainer
    from flash.image import ObjectDetectionData, ObjectDetector
    from flash.image.detection.serialization import FiftyOneDetectionLabels

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Load your Flash model
    model = ObjectDetector.load_from_checkpoint(
        "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
    )
    model.serializer = FiftyOneDetectionLabels()  # output FiftyOne format

    # Option 1: predict with trainer (supports distributed inference)
    datamodule = ObjectDetectionData.from_fiftyone(predict_dataset=dataset)
    predictions = Trainer().predict(model, datamodule=datamodule)
    predictions = list(chain.from_iterable(predictions)) # flatten batches

    # Option 2: predict with model
    filepaths = dataset.values("filepath")
    predictions = model.predict(filepaths)

    # Add predictions to dataset
    dataset.set_values("flash_predictions", predictions)

    # Visualize in the App
    session = fo.launch_app(dataset)

.. note::

    FiftyOne serializers have an optional
    :class:`return_filepath <flash:flash.core.classification.FiftyOneLabels>`
    flag that supports returning dicts that contain both the |Label| objects
    and the ``filepath`` of the associated media.

.. _flash-image-embeddings:

Image embeddings
________________

If you use Lightning Flash's
:ref:`image embeddings tasks <flash:image_embedder>` to generate feature
vectors for your image datasets, then use can easily leverage FiftyOne's
:ref:`dimensionality reduction <brain-embeddings-visualization>` and
:ref:`interactive plotting <embeddings-plots>` capabilities to visualize your
Flash model's embeddings and execute powerful workflows like
:doc:`cluster analysis <../tutorials/image_embeddings>` and
:ref:`similarity search <app-similarity>`, all in only a few lines of code!

.. code-block:: python
    :linenos:

    import numpy as np
    import torch

    from flash.core.data.utils import download_data
    from flash.image import ImageEmbedder

    import fiftyone as fo
    import fiftyone.brain as fob

    # 1 Download data
    download_data(
        "https://pl-flash-data.s3.amazonaws.com/hymenoptera_data.zip"
    )

    # 2 Load data into FiftyOne
    dataset = fo.Dataset.from_dir(
        "data/hymenoptera_data/test/",
        fo.types.ImageClassificationDirectoryTree,
    )

    # 3 Load model
    embedder = ImageEmbedder(backbone="swav-imagenet", embedding_dim=128)

    # 4 Generate embeddings
    filepaths = dataset.values("filepath")
    embeddings = np.stack(embedder.predict(filepaths))

    # 5 Visualize images
    session = fo.launch_app(dataset)

    # 6 Visualize image embeddings
    results = fob.compute_visualization(dataset, embeddings=embeddings)
    plot = results.visualize(labels="ground_truth.label")
    plot.show()

.. image:: ../images/integrations/flash_embeddings.png
   :alt: embeddings_example
   :align: center
