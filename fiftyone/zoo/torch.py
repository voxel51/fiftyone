"""
FiftyOne Zoo Datasets provided by ``torchvision.datasets``.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
# pragma pylint: disable=redefined-builtin
# pragma pylint: disable=unused-wildcard-import
# pragma pylint: disable=wildcard-import
from __future__ import absolute_import
from __future__ import division
from __future__ import print_function
from __future__ import unicode_literals
from builtins import *

# pragma pylint: enable=redefined-builtin
# pragma pylint: enable=unused-wildcard-import
# pragma pylint: enable=wildcard-import

import logging
import os

import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.types as fot
import fiftyone.zoo as foz

fou.ensure_torch()
import torchvision  # pylint: disable=wrong-import-order


logger = logging.getLogger(__name__)


class MNISTDataset(foz.ZooDataset):
    """The MNIST database of handwritten digits.

    The dataset consists of 70000 28 x 28 grayscale images in 10 classes.
    There are 60000 training images and 10000 test images.

    Dataset size:
        21.00 MiB

    Source:
        http://yann.lecun.com/exdb/mnist
    """

    @property
    def name(self):
        return "mnist"

    @property
    def supported_splits(self):
        return ("test", "train")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, split):
        train = split == "train"

        def download_fcn(dataset_dir):
            return torchvision.datasets.MNIST(
                dataset_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels_map
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            self,
            split,
            download_fcn,
            dataset_dir,
            get_class_labels_fcn,
            sample_parser,
        )


class CIFAR10Dataset(foz.ZooDataset):
    """The CIFAR-10 dataset consists of 60000 32 x 32 color images in 10
    classes, with 6000 images per class. There are 50000 training images and
    10000 test images.

    Dataset size:
        132.40 MiB

    Source:
        https://www.cs.toronto.edu/~kriz/cifar.html
    """

    @property
    def name(self):
        return "cifar10"

    @property
    def supported_splits(self):
        return ("test", "train")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, split):
        train = split == "train"

        def download_fcn(dataset_dir):
            return torchvision.datasets.CIFAR10(
                dataset_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels_map
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            self,
            split,
            download_fcn,
            dataset_dir,
            get_class_labels_fcn,
            sample_parser,
        )


class ImageNet2012Dataset(foz.ZooDataset):
    """The ImageNet 2012 dataset.

    ImageNet, as known as ILSVRC 2012, is an image dataset organized according
    to the WordNet hierarchy. Each meaningful concept in WordNet, possibly
    described by multiple words or word phrases, is called a "synonym set" or
    "synset". There are more than 100,000 synsets in WordNet, majority of them
    are nouns (80,000+). ImageNet provides on average 1000 images to illustrate
    each synset. Images of each concept are quality-controlled and
    human-annotated. In its completion, we hope ImageNet will offer tens of
    millions of cleanly sorted images for most of the concepts in the WordNet
    hierarchy.

    Note that labels were never publicly released for the test set, so only the
    training and validation sets are provided here.

    **Manual download instructions**

    This dataset requires you to download the source data manually into
    the requested backing directory. In particular, you must provide the
    following files::

            both splits: ILSVRC2012_devkit_t12.tar.gz
            train split: ILSVRC2012_img_train.tar
             test split: ILSVRC2012_img_val.tar

    You need to register on http://www.image-net.org/download-images in
    order to get the link to download the dataset.

    Dataset size:
        144.02 GiB

    Source:
        http://image-net.org
    """

    @property
    def name(self):
        return "imagenet-2012"

    @property
    def supported_splits(self):
        return ("train", "val")

    @property
    def default_split(self):
        return "val"

    def _download_and_prepare(self, dataset_dir, split):
        def download_fcn(_):
            return torchvision.datasets.ImageNet(dataset_dir, split=split)

        get_class_labels_fcn = _parse_classification_labels_map
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            self,
            split,
            download_fcn,
            dataset_dir,
            get_class_labels_fcn,
            sample_parser,
        )


class COCO2017Dataset(foz.ZooDataset):
    """COCO is a large-scale object detection, segmentation, and captioning
    dataset.

    This version contains images, bounding boxes and labels for the 2017
    version of the dataset.

    Notes:
        - COCO defines 91 classes but the data only uses 80 classes
        - some images from the train and validation sets don't have annotations
        - the test set does not have annotations
        - COCO 2014 and 2017 uses the same images, but different train/val/test
            splits

    Dataset size:
        25.20 GiB

    Source:
        http://cocodataset.org/#home
    """

    @property
    def name(self):
        return "coco-2017"

    @property
    def supported_splits(self):
        return ("test", "train", "val")

    @property
    def default_split(self):
        return "train"

    def _download_and_prepare(self, dataset_dir, split):
        if split != "train":
            raise ValueError("Currently only the 'train' split is supported")

        download_fcn = _download_coco_train_dataset
        get_class_labels_fcn = _parse_coco_detection_labels_map
        sample_parser = foud.ImageDetectionSampleParser(
            label_field="category_id", normalized=False
        )

        return _download_and_prepare(
            self,
            split,
            download_fcn,
            dataset_dir,
            get_class_labels_fcn,
            sample_parser,
        )


# Register datasets in the zoo
foz.AVAILABLE_DATASETS.update(
    {
        "mnist": MNISTDataset,
        "cifar10": CIFAR10Dataset,
        "imagenet": ImageNet2012Dataset,  # default ImageNet
        "imagenet-2012": ImageNet2012Dataset,
        "coco": COCO2017Dataset,  # default COCO
        "coco-2017": COCO2017Dataset,
    }
)


def _download_coco_train_dataset(dataset_dir):
    try:
        import pycocotools.coco  # pylint: disable=unused-import
    except ImportError:
        raise ImportError(
            "You must have the 'pycocotools' package installed in order "
            "to download the COCO dataset from the FiftyOne Model Zoo "
            "using a PyTorch backend. "
            "See https://github.com/cocodataset/cocoapi for installation "
            "instructions"
        )

    data_dir = os.path.join(dataset_dir, "train2017")
    data_zip_path = os.path.join(dataset_dir, "train2017.zip")
    etaw.download_file(
        "http://images.cocodataset.org/zips/train2017.zip", path=data_zip_path,
    )
    etau.extract_zip(data_zip_path)

    anno_path = os.path.join(
        dataset_dir, "annotations/instances_train2017.json"
    )
    anno_zip_path = os.path.join(dataset_dir, "annotations_trainval2017.zip")
    etaw.download_file(
        "http://images.cocodataset.org/annotations/annotations_trainval2017.zip",
        path=anno_zip_path,
    )
    etau.extract_zip(anno_zip_path)

    return torchvision.datasets.CocoDetection(data_dir, anno_path)


def _download_and_prepare(
    zoo_dataset,
    split,
    download_fcn,
    dataset_dir,
    get_class_labels_fcn,
    sample_parser,
):
    # Download the raw dataset to a tmp directory
    tmp_dir = os.path.join(dataset_dir, "tmp")
    dataset = download_fcn(tmp_dir)

    labels_map = get_class_labels_fcn(dataset)
    sample_parser.labels_map = labels_map
    num_samples = len(dataset)

    if isinstance(sample_parser, foud.ImageClassificationSampleParser):
        write_dataset_fcn = foud.to_image_classification_dataset
        format = fot.ImageClassificationDataset
    elif isinstance(sample_parser, foud.ImageDetectionSampleParser):
        write_dataset_fcn = foud.to_image_detection_dataset
        format = fot.ImageDetectionDataset
    elif isinstance(sample_parser, foud.ImageLabelsSampleParser):
        write_dataset_fcn = foud.to_image_labels_dataset
        format = fot.ImageLabelsDataset
    else:
        raise ValueError("Unsupported sample parser: %s" % sample_parser)

    # Write the formatted dataset to `dataset_dir`
    write_dataset_fcn(
        dataset,
        dataset_dir,
        sample_parser=sample_parser,
        num_samples=num_samples,
    )

    info = foz.ZooDatasetInfo(
        zoo_dataset.name,
        type(zoo_dataset),
        split,
        num_samples,
        format,
        labels_map=labels_map,
    )

    # Cleanup tmp directory
    etau.delete_dir(tmp_dir)

    return info


def _parse_classification_labels_map(dataset):
    labels_map = {}
    for idx, label in enumerate(dataset.classes):
        if isinstance(label, tuple):
            label = label[0]

        labels_map[idx] = label

    return labels_map


def _parse_coco_detection_labels_map(dataset):
    return {c["id"]: c["name"] for c in dataset.coco.dataset["categories"]}
