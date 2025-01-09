"""
Tests for the :mod:`fiftyone.utils.flash` module.

You must run these tests interactively as follows::

    python tests/intensive/lightning_flash_tests.py

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np
import unittest
from itertools import chain

from flash.core.data.utils import download_data
from flash.image.detection.output import FiftyOneDetectionLabelsOutput
from flash.core.classification import FiftyOneLabelsOutput
from flash.image.segmentation.output import FiftyOneSegmentationLabelsOutput
from flash.image import ImageClassificationData, ImageClassifier, ImageEmbedder
from flash.image import ObjectDetectionData, ObjectDetector
from flash.image import SemanticSegmentation, SemanticSegmentationData
from flash import Trainer
from flash.video import VideoClassificationData, VideoClassifier

import fiftyone as fo
import fiftyone.brain as fob  # pylint: disable=import-error,no-name-in-module
import fiftyone.utils.random as four
import fiftyone.zoo as foz


class LightningFlashTests(unittest.TestCase):
    def test_apply_model(self):
        # Load your dataset
        dataset = foz.load_zoo_dataset("quickstart", max_samples=5).clone()

        num_classes = len(dataset.distinct("ground_truth.detections.label"))
        # Load your Flash model
        cls_model = ImageClassifier(
            backbone="resnet18", num_classes=num_classes
        )

        det_model = ObjectDetector(
            head="efficientdet",
            backbone="d0",
            num_classes=num_classes,
            image_size=512,
        )

        # Predict!
        dataset.apply_model(
            cls_model,
            label_field="flash_classifications",
        )

        transform_kwargs = {"image_size": 512}
        dataset.apply_model(
            det_model,
            label_field="flash_detections",
            transform_kwargs=transform_kwargs,
        )

    def test_image_classifier(self):
        # 1 Load your FiftyOne dataset
        dataset = foz.load_zoo_dataset(
            "cifar10", split="test", max_samples=300
        ).clone()
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
        model = ImageClassifier(backbone="resnet18", labels=datamodule.labels)

        # 4 Create the trainer
        trainer = Trainer(
            max_epochs=1,
            limit_train_batches=10,
            limit_val_batches=10,
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
            "flash_predictions",
            predictions,
            key_field="filepath",
        )

    def test_object_detector(self):
        # 1 Load your FiftyOne dataset
        dataset = foz.load_zoo_dataset(
            "coco-2017",
            split="validation",
            max_samples=100,
            classes=["person"],
        ).clone()

        # Create splits from the dataset
        splits = {"train": 0.7, "test": 0.1, "val": 0.1}
        four.random_split(dataset, splits)

        # Here we use views into one dataset,
        # but you can also use a different dataset for each split
        train_dataset = dataset.match_tags("train")
        test_dataset = dataset.match_tags("test")
        val_dataset = dataset.match_tags("val")
        predict_dataset = train_dataset.take(5)

        # Remove background label, gets added by datamodule
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
            "flash_predictions",
            predictions,
            key_field="filepath",
        )

    def test_semantic_segmentation(self):
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
            "flash_predictions",
            predictions,
            key_field="filepath",
        )

        # Test segmentation apply_model
        predict_dataset.apply_model(model, "seg_apply_model")

    def test_video_classification(self):
        # 1 Load the data
        dataset = foz.load_zoo_dataset(
            "kinetics-700-2020",
            split="validation",
            max_samples=15,
            shuffle=True,
        ).clone()
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
            backbone="x3d_xs",
            labels=datamodule.labels,
            pretrained=False,
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
            "flash_predictions",
            predictions,
            key_field="filepath",
        )

    def test_manually_adding_predictions(self):
        # Load your dataset
        dataset = (
            foz.load_zoo_dataset("quickstart", max_samples=5)
            .select_fields("ground_truth")
            .clone()
        )
        labels = dataset.distinct("ground_truth.detections.label")

        # Load your Flash model
        model = ImageClassifier(labels=labels)

        # Create prediction datamodule
        datamodule = ImageClassificationData.from_fiftyone(
            predict_dataset=dataset,
            batch_size=1,
        )

        # Output FiftyOne format
        output = FiftyOneLabelsOutput(return_filepath=False, labels=labels)
        # Predict with trainer
        predictions = Trainer().predict(
            model, datamodule=datamodule, output=output
        )

        predictions = list(chain.from_iterable(predictions))  # flatten batches

        # Predictions is a list of Label objects since ``return_filepath=False``
        # Order corresponds to order of the ``predict_dataset``

        # Add predictions to dataset
        dataset.set_values("flash_predictions", predictions)

    def test_specifying_class_names(self):
        # Load your dataset
        dataset = foz.load_zoo_dataset("quickstart", max_samples=5).clone()

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
        output = FiftyOneLabelsOutput(labels=labels)  # output FiftyOne format

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

    def test_image_embedder(self):
        ## 1 Download data
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
        # embedder = ImageEmbedder(backbone="resnet", head=None,
        #        pretraining_transform=None, training_strategy="default")
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
        embedding_batches = trainer.predict(embedder, datamodule=datamodule)
        embeddings = np.stack(sum(embedding_batches, []))

        # 5 Visualize in FiftyOne App
        results = fob.compute_visualization(dataset, embeddings=embeddings)
        plot = results.visualize(labels="ground_truth.label")
        plot.show()

        embeddings = dataset.compute_embeddings(embedder)
        dataset.compute_embeddings(embedder, embeddings_field="embeddings")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
