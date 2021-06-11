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
            
            import fiftyone as fo
            import fiftyone.zoo as foz
        
            from flash import Trainer
            from flash.core.classification import FiftyOneLabels
            from flash.image import ImageClassificationData, ImageClassifier
        
            # 1. Load your FiftyOne dataset
            dataset = foz.load_zoo_dataset("cifar10", split="test", max_samples=40)
            train_dataset = dataset.shuffle(seed=51)[:20]
            test_dataset = dataset.shuffle(seed=51)[20:25]
            val_dataset = dataset.shuffle(seed=51)[25:30]
            predict_dataset = dataset.shuffle(seed=51)[30:40]
        
            # 2. Load the Datamodule
            datamodule = ImageClassificationData.from_fiftyone_dataset(
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
            trainer = flash.Trainer(max_epochs=1, limit_train_batches=1, limit_val_batches=1)
            
            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule)
            
            # 6. Save it!
            trainer.save_checkpoint("image_classification_model.pt")
        
            # 7. Generate predictions
            predictions = trainer.predict(model, datamodule=datamodule)
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(predict_dataset)
        

    .. tab:: Image object detection 

        This example trains a Flash object detection model on a FiftyOne dataset
        with |Detections| ground truth labels.
        
        .. code-block:: python
            :linenos:
            
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
            datamodule = ObjectDetectionData.from_fiftyone_dataset(
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
            trainer = flash.Trainer(max_epochs=1, limit_train_batches=1, limit_val_batches=1)
            
            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule)
            
            # 6. Save it!
            trainer.save_checkpoint("object_detection_model.pt")
        
            # 7. Generate predictions
            predictions = trainer.predict(model, datamodule=datamodule)
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(predict_dataset)


    .. tab:: Image semantic segmentation

        This example trains a Flash semantic segmentation model on a FiftyOne dataset
        with |Segmentation| ground truth labels.
        
        .. code-block:: python
            :linenos:
            
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
            datamodule = SemanticSegmentationData.from_fiftyone_dataset(
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
            trainer = flash.Trainer(
                max_epochs=1,
                fast_dev_run=1,
            )
            
            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule, strategy="freeze")
            
            # 6. Save it!
            trainer.save_checkpoint("semantic_segmentation_model.pt")
        
            # 7. Generate predictions
            predictions = trainer.predict(model, datamodule=datamodule)
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
            session = fo.launch_app(predict_dataset)


    .. tab:: Video classification

        This example trains a Flash video classification model on a FiftyOne dataset
        with |Classifications| ground truth labels.
        
        .. code-block:: python
            :linenos:
            
            import fiftyone as fo
            import fiftyone.zoo as foz
        
            from flash import Trainer
            from flash.core.classification import FiftyOneLabels
            from flash.core.data.utils import download_data
            from flash.video import VideoClassificationData, VideoClassifier
        
            # 1. Load your FiftyOne dataset
            # Find more dataset at https://pytorchvideo.readthedocs.io/en/latest/data.html
            download_data("https://pl-flash-data.s3.amazonaws.com/kinetics.zip", "data/")

            train_dataset = fo.Dataset.from_dir(
                dataset_dir="data/kinetics/train"),
                dataset_type=fo.types.VideoClassificationDirectoryTree,
            )

            val_dataset = fo.Dataset.from_dir(
                dataset_dir="data/kinetics/val"),
                dataset_type=fo.types.VideoClassificationDirectoryTree,
            )

            predict_dataset = fo.Dataset.from_dir(
                dataset_dir="data/kinetics/predict"),
                dataset_type=fo.types.VideoDirectory,
            )

            # 2. [Optional] Specify transforms to be used during training.
            # Flash helps you to place your transform exactly where you want.
            # Learn more at:
            # https://lightning-flash.readthedocs.io/en/latest/general/data.html#flash.core.data.process.Preprocess
            post_tensor_transform = [UniformTemporalSubsample(8), RandomShortSideScale(min_size=256, max_size=320)]
            per_batch_transform_on_device = [K.Normalize(torch.tensor([0.45, 0.45, 0.45]), torch.tensor([0.225, 0.225, 0.225]))]
        
            train_post_tensor_transform = post_tensor_transform + [RandomCrop(244), RandomHorizontalFlip(p=0.5)]
            val_post_tensor_transform = post_tensor_transform + [CenterCrop(244)]
            train_per_batch_transform_on_device = per_batch_transform_on_device
        
            def make_transform(
                post_tensor_transform: List[Callable] = post_tensor_transform,
                per_batch_transform_on_device: List[Callable] = per_batch_transform_on_device
            ):
                return {
                    "post_tensor_transform": Compose([
                        ApplyTransformToKey(
                            key="video",
                            transform=Compose(post_tensor_transform),
                        ),
                    ]),
                    "per_batch_transform_on_device": Compose([
                        ApplyTransformToKey(
                            key="video",
                            transform=K.VideoSequential(
                                per_batch_transform_on_device, data_format="BCTHW", same_on_frame=False
                            )
                        ),
                    ]),
                }

        
            # 2. Load the Datamodule
            datamodule = VideoClassificationData.from_fiftyone_dataset(
                train_dataset = train_dataset,
                val_dataset = val_dataset,
                predict_dataset = predict_dataset,
                label_field = "ground_truth",
                train_transform=make_transform(train_post_tensor_transform),
                val_transform=make_transform(val_post_tensor_transform),
                predict_transform=make_transform(val_post_tensor_transform),
                batch_size=8,
                clip_sampler="uniform",
                clip_duration=1,
                video_sampler=RandomSampler,
                decode_audio=False,
                num_workers=8
            )
        
            # 3. Build the model
            model = VideoClassifier(
                backbone="x3d_xs",
                num_classes=datamodule.num_classes,
                serializer=FiftyOneLabels(),
                pretrained=False,
            )
        
            # 4. Create the trainer
            trainer = flash.Trainer(fast_dev_run=True)
            trainer.finetune(model, datamodule=datamodule, strategy=NoFreeze())

            # 5. Finetune the model
            trainer.finetune(model, datamodule=datamodule)
            
            # 6. Save it!
            trainer.save_checkpoint("video_classification.pt")
        
            # 7. Generate predictions
            predictions = trainer.predict(model, datamodule=datamodule)
        
            # 8. Add predictions to dataset and analyze 
            predict_dataset.set_values("flash_predictions", predictions)
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

    import flash
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
    datamodule = ObjectDetectionData.from_fiftyone_dataset(
        predict_dataset=dataset,
    )
    trainer = flash.Trainer() 
    predictions = trainer.predict(model, datamodule=datamodule)

    # Option 2: Predict with model
    filepaths = dataset.values("filepath")
    predictions = model.predict(filepaths)

    # Add predictions to dataset
    dataset.set_values("flash_predictions", predictions)

    # Visualize
    session = fo.launch_app(dataset)

