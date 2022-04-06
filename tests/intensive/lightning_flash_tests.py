"""
Tests for the :mod:`fiftyone.utils.flash` module.

You must run these tests interactively as follows::

    python tests/intensive/lightning_flash_tests.py

| Copyright 2017-2022, Voxel51, Inc.
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
import fiftyone.brain as fob
import fiftyone.utils.splits as fous
import fiftyone.zoo as foz


class LightningFlashTests(unittest.TestCase):
    def test_apply_model(self):
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
            num_classes=num_classes,
            image_size=512,
        )

        # Predict!
        dataset.apply_model(
            cls_model, label_field="flash_classifications",
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
        )
        dataset.untag_samples("test")

        # Get list of labels in dataset
        labels = dataset.distinct("ground_truth.label")

        # Create splits from the dataset
        splits = {"train": 0.7, "test": 0.1, "val": 0.1, "pred": 0.1}
        fous.random_split(dataset, splits)

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
        model = ImageClassifier(backbone="resnet18", labels=labels,)

        # 4 Create the trainer
        trainer = Trainer(max_epochs=1, limit_val_batches=100)

        # 5 Finetune the model
        trainer.finetune(model, datamodule=datamodule)

        # 6 Save it!
        trainer.save_checkpoint("/tmp/image_classification_model.pt")

        # 7 Generate predictions
        predictions = trainer.predict(
            model,
            datamodule=datamodule,
            output=FiftyOneLabelsOutput(labels=labels),
        )
        predictions = list(chain.from_iterable(predictions))  # flatten batches

        # Map filepaths to predictions
        predictions = {p["filepath"]: p["predictions"] for p in predictions}

        # Add predictions to FiftyOne dataset
        predict_dataset.set_values(
            "flash_predictions", predictions, key_field="filepath",
        )

    def test_object_detector(self):
        # 1 Load your FiftyOne dataset
        download_data(
            "https://github.com/zhiqwang/yolov5-rt-stack/releases/download/v0.3.0/coco128.zip",
            "/tmp/coco128/",
        )
        dataset = fo.Dataset.from_dir(
            data_path="/tmp/data/coco128/images/train2017",
            labels_path="/tmp/data/coco128/annotations/instances_train2017.json",
            dataset_type=fo.types.COCODetectionDataset,
        )
        # dataset = foz.load_zoo_dataset(
        #    "coco-2017",
        #    split="validation",
        #    max_samples=100,
        #    classes=["person"],
        # ).clone()
        # dataset.untag_samples("validation")

        # Get list of labels in dataset
        labels = dataset.distinct("ground_truth.detections.label")

        # Create splits from the dataset
        splits = {"train": 0.7, "test": 0.1, "val": 0.1}
        fous.random_split(dataset, splits)

        # Here we use views into one dataset,
        # but you can also use a different dataset for each split
        train_dataset = dataset.match_tags("train")
        test_dataset = dataset.match_tags("test")
        val_dataset = dataset.match_tags("val")

        # 2 Create the Datamodule
        datamodule = ObjectDetectionData.from_fiftyone(
            train_dataset=dataset,
            predict_dataset=dataset.take(5),
            val_split=0.1,
            label_field="ground_truth",
            transform_kwargs={"image_size": 512},
            batch_size=4,
        )
        # datamodule = ObjectDetectionData.from_coco(
        #    train_folder="/tmp/data/coco128/images/train2017/",
        #    train_ann_file="/tmp/data/coco128/annotations/instances_train2017.json",
        #    val_split=0.1,
        #    transform_kwargs={"image_size": 512},
        #    batch_size=4,
        # )

        # 3 Build the model
        model = ObjectDetector(
            head="efficientdet",
            backbone="d0",
            num_classes=datamodule.num_classes,
            image_size=512,
        )

        # 4 Create the trainer
        trainer = Trainer(max_epochs=1, limit_val_batches=1)

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

        # 2 Create the Datamodule
        datamodule = SemanticSegmentationData.from_fiftyone(
            train_dataset=dataset,
            test_dataset=dataset,
            val_dataset=dataset,
            predict_dataset=dataset.take(5),
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
        datamodule = SemanticSegmentationData.from_fiftyone(
            predict_dataset=dataset.take(5), batch_size=1,
        )
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

    def test_video_classification(self):
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
        fous.random_split(dataset, splits)

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
        # trainer.fit(model, datamodule=datamodule)
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

    def test_manually_adding_predictions(self):
        # Load your dataset
        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)
        labels = dataset.distinct("ground_truth.detections.label")

        # Load your Flash model
        model = ObjectDetector(labels=labels)
        model.output = FiftyOneDetectionLabelsOutput(
            return_filepath=False, labels=labels
        )  # output FiftyOne format

        # Predict with trainer (supports distributed inference)
        datamodule = ObjectDetectionData.from_fiftyone(predict_dataset=dataset)
        predictions = Trainer().predict(model, datamodule=datamodule)
        predictions = list(chain.from_iterable(predictions))  # flatten batches

        # Predictions is a list of Label objects since ``return_filepath=False``
        # Order corresponds to order of the ``predict_dataset``

        # Add predictions to dataset
        dataset.set_values("flash_predictions", predictions)

    def test_specifying_class_names(self):
        # Load your dataset
        dataset = foz.load_zoo_dataset("quickstart", max_samples=5)

        datamodule = ObjectDetectionData.from_fiftyone(predict_dataset=dataset)

        # Load your Flash model
        num_classes = 100
        model = ObjectDetector(head="retinanet", num_classes=num_classes,)

        # Configure output with class labels
        labels = [
            "label_" + str(i) for i in range(num_classes)
        ]  # example class labels
        output = FiftyOneDetectionLabelsOutput(
            labels=labels, return_filepath=False
        )  # output FiftyOne format

        # Predict with model
        trainer = Trainer()
        predictions = trainer.predict(
            model, datamodule=datamodule, output=output
        )

        # Add predictions to dataset
        dataset.set_values("flash_predictions", predictions)

        print(dataset.distinct("flash_predictions.detections.label"))
        # ['label_57', 'label_60']

        # Visualize in the App
        session = fo.launch_app(dataset)

    def test_image_embedder(self):
        # 1 Download data
        download_data(
            "https://pl-flash-data.s3.amazonaws.com/hymenoptera_data.zip",
            "/tmp/flash_tests/hymenoptera",
        )

        # 2 Load data into FiftyOne
        dataset = fo.Dataset.from_dir(
            "/tmp/flash_tests/data/hymenoptera_data/test/",
            fo.types.ImageClassificationDirectoryTree,
        )
        datamodule = ImageClassificationData.from_fiftyone(
            predict_dataset=dataset,
            label_field="ground_truth",
            batch_size=4,
            num_workers=4,
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
        # filepaths = dataset.values("filepath")
        trainer = Trainer(max_epochs=1)
        embeddings = trainer.predict(embedder, datamodule=datamodule)
        # embeddings = np.stack(embedder.predict(filepaths))

        # 5 Visualize images
        session = fo.launch_app(dataset)

        # 6 Visualize image embeddings
        results = fob.compute_visualization(dataset, embeddings=embeddings)
        plot = results.visualize(labels="ground_truth.label")
        plot.show()


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
