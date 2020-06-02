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

torchvision = fou.lazy_import("torchvision", fou.ensure_torch)


logger = logging.getLogger(__name__)


class TorchVisionDataset(foz.ZooDataset):
    """Base class for zoo datasets that are provided via the
    ``torchvision.datasets`` package.
    """

    pass


class MNISTDataset(TorchVisionDataset):
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

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.MNIST(
                download_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class FashionMNISTDataset(TorchVisionDataset):
    """The Fashion-MNIST database of Zalando's fashion article images.

    The dataset consists of 70000 28 x 28 grayscale images in 10 classes.
    There are 60000 training images and 10000 test images.

    Dataset size:
        36.42 MiB

    Source:
        https://github.com/zalandoresearch/fashion-mnist
    """

    @property
    def name(self):
        return "fashion-mnist"

    @property
    def supported_splits(self):
        return ("test", "train")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.FashionMNIST(
                download_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class CIFAR10Dataset(TorchVisionDataset):
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

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.CIFAR10(
                download_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class CIFAR100Dataset(TorchVisionDataset):
    """The CIFAR-100 dataset of images.

    The dataset consists of 60000 32 x 32 color images in 100 classes, with 600
    images per class. There are 50000 training images and 10000 test images.

    Dataset size:
        132.03 MiB

    Source:
        https://www.cs.toronto.edu/~kriz/cifar.html
    """

    @property
    def name(self):
        return "cifar100"

    @property
    def supported_splits(self):
        return ("test", "train")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.CIFAR100(
                download_dir, train=train, download=True
            )

        get_class_labels_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class ImageNet2012Dataset(TorchVisionDataset):
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
       validation split: ILSVRC2012_img_val.tar

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
        return ("train", "validation")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, _, split):
        if split == "validation":
            _split = "val"
        else:
            _split = split

        def download_fcn(_):
            return torchvision.datasets.ImageNet(dataset_dir, split=_split)

        get_class_labels_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            None,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class COCO2017Dataset(TorchVisionDataset):
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
        return ("train",)  # @todo support other splits
        # return ("test", "train", "val")

    @property
    def default_split(self):
        return "train"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        download_fcn = _download_coco_train_dataset
        get_class_labels_fcn = _parse_coco_detection_labels_map
        sample_parser = foud.ImageDetectionSampleParser(
            label_field="category_id", normalized=False
        )

        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class VOC2007Dataset(TorchVisionDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2007
    (VOC2007) for the classification and detection competitions.

    A total of 9963 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    24640 annotated objects. In the classification competition, the goal is to
    predict the set of labels contained in the image, while in the detection
    competition the goal is to predict the bounding box and label of each
    individual object.

    Dataset size:
        868.85 MiB

    Source:
        http://host.robots.ox.ac.uk/pascal/VOC/voc2007
    """

    @property
    def name(self):
        return "voc-2007"

    @property
    def supported_splits(self):
        return ("train", "validation")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir, year="2007", image_set=image_set, download=True,
            )

        get_class_labels_fcn = None  # @todo implement this
        sample_parser = foud.ImageDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


class VOC2012Dataset(TorchVisionDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2012
    (VOC2012) for the Classification and Detection competitions.

    A total of 11540 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    27450 annotated objects. In the classification competition, the goal is to
    predict the set of labels contained in the image, while in the detection
    competition the goal is to predict the bounding box and label of each
    individual object.

    Dataset size:
        3.59 GiB

    Source:
        http://host.robots.ox.ac.uk/pascal/VOC/voc2012
    """

    @property
    def name(self):
        return "voc-2012"

    @property
    def supported_splits(self):
        return ("train", "validation")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir, year="2012", image_set=image_set, download=True,
            )

        get_class_labels_fcn = None  # @todo implement this
        sample_parser = foud.ImageDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            sample_parser,
        )


AVAILABLE_DATASETS = {
    "mnist": MNISTDataset,
    "fashion-mnist": FashionMNISTDataset,
    "cifar10": CIFAR10Dataset,
    "cifar100": CIFAR100Dataset,
    "imagenet-2012": ImageNet2012Dataset,
    "coco-2017": COCO2017Dataset,
    "voc-2007": VOC2007Dataset,
    "voc-2012": VOC2012Dataset,
}


def _download_and_prepare(
    dataset_dir,
    scratch_dir,
    download_fcn,
    get_class_labels_fcn,
    sample_parser,
):
    # Download the torchvision dataset, if necessary
    dataset = download_fcn(scratch_dir)

    classes = get_class_labels_fcn(dataset)
    num_samples = len(dataset)
    sample_parser.classes = classes

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

    return format, num_samples, classes


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


def _parse_classification_labels(dataset):
    classes = []
    for label in dataset.classes:
        if isinstance(label, tuple):
            label = label[0]

        classes.append(label)

    return classes


def _parse_coco_detection_labels_map(dataset):
    labels_map = {
        c["id"]: c["name"] for c in dataset.coco.dataset["categories"]
    }

    classes = []
    for idx in range(max(labels_map) + 1):
        classes.append(labels_map.get(idx, str(idx)))

    return classes
