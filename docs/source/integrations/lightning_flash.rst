.. _flash:

PyTorch Lightning Flash Integration
===================================

.. default-role:: code

We have collaborated with the team behind 
`PyTorch Lightning Flash <https://github.com/PyTorchLightning/lightning-flash>`_ to make it
as easy as possible to train Flash :class:`models <flash:flash.core.model.Task>`
on your FiftyOne datasets and to add
the predictions of Flash models to a FiftyOne |Dataset| for visualiziation and
analysis.

The following Flash tasks are supported by FiftyOne:

- :ref:`Image Classification <flash:image_classification>`
- :ref:`Image Object Detection <flash:object_detection>`
- :ref:`Image Semantic Segmentation <flash:semantic_segmentation>`
- :ref:`Video Classification <flash:video_classification>`

Support for future Flash tasks is on the horizon.

.. _flash-model-training:

Model training
______________

One of the primary uses of Flash is to load an existing model and finetune it
on your |Dataset| with minimal code required. 

.. tabs::

    .. tab:: Image classification

        This example trains a Flash classification model on a FiftyOne dataset
        with |Classifications| ground truth labels.
        
        .. code-block:: python
            :linenos:

            import itertools
            
            import fiftyone as fo
            import fiftyone.zoo as foz
        
            from flash import Trainer
            from flash.core.classification import FiftyOneLabels
            from flash.core.finetuning import FreezeUnfreeze
            from flash.image import ImageClassificationData, ImageClassifier
        
            # 1. Load your FiftyOne dataset
            dataset = foz.load_zoo_dataset("cifar10", split="test", max_samples=40)
            train_dataset = dataset.shuffle(seed=51)[:20]
            test_dataset = dataset.shuffle(seed=51)[20:25]
            val_dataset = dataset.shuffle(seed=51)[25:30]
            predict_dataset = dataset.shuffle(seed=51)[30:40]
        
            # 2. Load the Datamodule
            datamodule = ImageClassificationData.from_fiftyone_datasets(
                train_dataset = train_dataset,
                test_dataset = test_dataset,
                val_dataset = val_dataset,
                predict_dataset = predict_dataset,
                label_field = "ground_truth",
                batch_size=4,
                num_workers=4,
            )
        
            # 3. Build the model
            model = ImageClassifier(
                backbone="resnet18", 
                num_classes=datamodule.num_classes, 
                serializer=FiftyOneLabels(),
            )
        
            # 4. Create the trainer
            trainer = Trainer(
                max_epochs=1, 
                limit_train_batches=1, 
                limit_val_batches=1,
            )
            
            # 5. Finetune the model
            trainer.finetune(
                model, 
                datamodule=datamodule,
                strategy=FreezeUnfreeze(unfreeze_epoch=1),
            )
            
            # 6. Save it!
            trainer.save_checkpoint("image_classification_model.pt")
        
            # 7. Generate predictions
            model = ImageClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/image_classification_model.pt"
            )
            model.serializer = FiftyOneLabels()

            predictions = trainer.predict(model, datamodule=datamodule)
            
            # 7b. Flatten batched predictions
            predictions = list(itertools.chain.from_iterable(predictions))
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(view=predict_dataset)
        

    .. tab:: Image object detection 

        This example trains a Flash object detection model on a FiftyOne dataset
        with |Detections| ground truth labels.
        
        .. code-block:: python
            :linenos:

            import itertools
            
            import fiftyone as fo
            import fiftyone.zoo as foz
        
            from flash import Trainer
            from flash.image import ObjectDetectionData, ObjectDetector
            from flash.image.detection.serialization import FiftyOneDetectionLabels
        
            # 1. Load your FiftyOne dataset
            dataset = foz.load_zoo_dataset("quickstart", max_samples=40)
            train_dataset = dataset.shuffle(seed=51)[:20]
            test_dataset = dataset.shuffle(seed=51)[20:25]
            val_dataset = dataset.shuffle(seed=51)[25:30]
            predict_dataset = dataset.shuffle(seed=51)[30:40]
        
            # 2. Load the Datamodule
            datamodule = ObjectDetectionData.from_fiftyone_datasets(
                train_dataset = train_dataset,
                test_dataset = test_dataset,
                val_dataset = val_dataset,
                predict_dataset = predict_dataset,
                label_field = "ground_truth",
                batch_size=4,
                num_workers=4,
            )
        
            # 3. Build the model
            model = ObjectDetector(
                model="retinanet", 
                num_classes=datamodule.num_classes,
                serializer=FiftyOneDetectionLabels(),
            )
        
            # 4. Create the trainer
            trainer = Trainer(
                max_epochs=1, 
                limit_train_batches=1, 
                limit_val_batches=1,
            )
            
            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule)
            
            # 6. Save it!
            trainer.save_checkpoint("object_detection_model.pt")
        
            # 7. Generate predictions
            model = ObjectDetector.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
            )
            model.serializer = FiftyOneDetectionLabels()

            predictions = trainer.predict(model, datamodule=datamodule)

            # 7b. Flatten batched predictions
            predictions = list(itertools.chain.from_iterable(predictions))
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(view=predict_dataset)


    .. tab:: Image semantic segmentation

        This example trains a Flash semantic segmentation model on a FiftyOne dataset
        with |Segmentation| ground truth labels.
        
        .. code-block:: python
            :linenos:
            
            import itertools

            import fiftyone as fo
            import fiftyone.zoo as foz
        
            from flash import Trainer
            from flash.core.data.utils import download_data
            from flash.image import SemanticSegmentation, SemanticSegmentationData
            from flash.image.segmentation.serialization import FiftyOneSegmentationLabels 

            # 1. Load your FiftyOne dataset
            # This is a Dataset with Semantic Segmentation Labels generated via CARLA
            self-driving simulator.
            # The data was generated as part of the Lyft Udacity Challenge.
            # More info here:
            https://www.kaggle.com/kumaresanmanickavelu/lyft-udacity-challenge
            download_data(
                "https://github.com/ongchinkiat/LyftPerceptionChallenge/releases/download/v0.1/carla-capture-20180513A.zip",
                "data/"
                )

            dataset = fo.Dataset.from_dir(
                dataset_dir = "data",
                data_path = "CameraRGB",
                labels_path = "CameraSeg",
                max_samples = 40,
                force_grayscale = True,
                dataset_type=fo.types.ImageSegmentationDirectory,
            )
            train_dataset = dataset.shuffle(seed=51)[:20]
            test_dataset = dataset.shuffle(seed=51)[20:25]
            val_dataset = dataset.shuffle(seed=51)[25:30]
            predict_dataset = dataset.shuffle(seed=51)[30:40]
        
            # 2. Load the Datamodule
            datamodule = SemanticSegmentationData.from_fiftyone_datasets(
                train_dataset = train_dataset,
                test_dataset = test_dataset,
                val_dataset = val_dataset,
                predict_dataset = predict_dataset,
                label_field = "ground_truth",
                batch_size=4,
                num_workers=4,
            )
        
            # 3. Build the model
            model = SemanticSegmentation(
                backbone="fcn_resnet50", 
                num_classes=datamodule.num_classes,
                serializer=FiftyOneSegmentationLabels(),
            )
        
            # 4. Create the trainer
            trainer = Trainer(
                max_epochs=1,
                fast_dev_run=1,
            )
            
            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")
            
            # 6. Save it!
            trainer.save_checkpoint("semantic_segmentation_model.pt")
        
            # 7. Generate predictions
            model = ObjectDetector.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/semantic_segmentation_model.pt"
            )
            model.serializer = FiftyOneSegmentationLabels()

            predictions = trainer.predict(model, datamodule=datamodule)

            # 7b. Flatten batched predictions
            predictions = list(itertools.chain.from_iterable(predictions))
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(view=predict_dataset)


    .. tab:: Video classification

        This example trains a Flash video classification model on a FiftyOne dataset
        with |Classifications| ground truth labels.
        
        .. code-block:: python
            :linenos:

            from torch.utils.data.sampler import RandomSampler
            
            import flash
            from flash.core.classification import FiftyOneLabels
            from flash.core.data.utils import download_data
            from flash.video import VideoClassificationData, VideoClassifier
            
            import fiftyone as fo
            
            # 1. Download data
            download_data("https://pl-flash-data.s3.amazonaws.com/kinetics.zip")
            
            # 2. Load data into FiftyOne
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
            
            # 3. Finetune a model
            classifier = VideoClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/video_classification.pt",
                pretrained=False,
            )
            
            datamodule = VideoClassificationData.from_fiftyone_datasets(
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
            
            # 4. Predict from checkpoint
            classifier = VideoClassifier.load_from_checkpoint(
                "https://flash-weights.s3.amazonaws.com/video_classification.pt",
                pretrained=False,
            )
            
            classifier.serializer = FiftyOneLabels()
            
            filepaths = predict_dataset.values("filepath")
            predictions = classifier.predict(filepaths)
            
            predict_dataset.set_values("predictions", predictions)
            
            # 5. Visualize in FiftyOne App
            session = fo.launch_app(predict_dataset)


.. _adding-model-predictions:

Adding model predictions
________________________

Once you have a trained Flash model, there are a couple of ways that 
you can use the FiftyOne integrations to
add generate and add model predictions to your |Dataset| or |DatasetView|.


Apply model
-----------

The easiest way to generate predictions on an existing |Dataset| or |DatasetView| is
to use the :meth:`apply_model() <fiftyone.core.collections.SampleCollection.apply_model>`
function, passing in your Flash model.

.. code-block:: python
    :linenos:

    import fiftyone.zoo as foz

    from flash.image import ObjectDetector

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Load the finetuned model
    model = ObjectDetector.load_from_checkpoint(
        "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
    )

    # Predict
    dataset.apply_model(model, label_field="flash_predictions")

    # Visualize
    session = fo.launch_app(dataset)


Manually adding predictions
---------------------------

In some cases, you may have loaded your data into Flash datamodules already and
want to generate predictions with those. 

Flash models support different serializers, objects that reformat the output of
models. Using FiftyOne serializers, you can return predictions as FiftyOne
|Label| directly. All you need to do is set the model serializer to the
corresponding FiftyOne serializer for your task and generate predictions.
FiftyOne serializers also support a :class:`return_filepath <flash:flash.core.classification.FiftyOneLabels>`
flag that will return the coresponding filepath of every sample along
with the FiftyOne labels. 

There are a few different ways that this workflow may come about. 

.. code-block:: python
    :linenos:

    import fiftyone as fo
    import fiftyone.zoo as foz

    from flash import Trainer
    from flash.image import ObjectDetector
    from flash.image.detection.serialization import FiftyOneDetectionLabels

    # Load your dataset
    dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

    # Load the finetuned model
    model = ObjectDetector.load_from_checkpoint(
        "https://flash-weights.s3.amazonaws.com/object_detection_model.pt"
    )
    model.serializer = FiftyOneDetectionLabels() 

    # Option 1: Predict with trainer (Supports distributed inference)
    datamodule = ObjectDetectionData.from_fiftyone_datasets(
        predict_dataset=dataset,
    )
    trainer = Trainer() 
    predictions = trainer.predict(model, datamodule=datamodule)

    # Option 2: Predict with model
    filepaths = dataset.values("filepath")
    predictions = model.predict(filepaths)

    # Add predictions to dataset
    dataset.set_values("flash_predictions", predictions)

    # Visualize
    session = fo.launch_app(dataset)

