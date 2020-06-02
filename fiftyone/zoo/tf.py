"""
FiftyOne Zoo Datasets provided by ``tensorflow_datasets``.

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
import resource

import eta.core.utils as etau

import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.types as fot
import fiftyone.zoo as foz

tfds = fou.lazy_import("tensorflow_datasets", callback=fou.ensure_tfds)


logger = logging.getLogger(__name__)


class TFDSDataset(foz.ZooDataset):
    """Base class for zoo datasets that are provided via the
    ``tensorflow_datasets`` package.
    """

    pass


class MNISTDataset(TFDSDataset):
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
        def download_fcn(download_dir):
            return tfds.load(
                "mnist",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class FashionMNISTDataset(TFDSDataset):
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
        def download_fcn(download_dir):
            return tfds.load(
                "fashion_mnist",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class CIFAR10Dataset(TFDSDataset):
    """The CIFAR-10 dataset of images.

    The dataset consists of 60000 32 x 32 color images in 10 classes, with 6000
    images per class. There are 50000 training images and 10000 test images.

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
        def download_fcn(download_dir):
            return tfds.load(
                "cifar10",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class CIFAR100Dataset(TFDSDataset):
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
        def download_fcn(download_dir):
            return tfds.load(
                "cifar100",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class Caltech101Dataset(TFDSDataset):
    """The Caltech-101 dataset of images.

    The dataset consists of pictures of objects belonging to 101 classes, plus
    one background clutter class. Each image is labelled with a single object.
    Each class contains roughly 40 to 800 images, totalling around 9k images.
    Images are of variable sizes, with typical edge lengths of 200-300 pixels.
    This version contains image-level labels only.

    Dataset size:
        125.64 MiB

    Source:
        http://www.vision.caltech.edu/Image_Datasets/Caltech101
    """

    @property
    def name(self):
        return "caltech101"

    @property
    def supported_splits(self):
        return ("test", "train")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "caltech101",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class ImageNet2012Dataset(TFDSDataset):
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
            return tfds.load(
                "imagenet",
                split=_split,
                data_dir=dataset_dir,
                download=False,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["label"].names
        get_num_samples_fcn = lambda info: info.splits[_split].num_examples
        sample_parser = _TFDSImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            None,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class COCO2014Dataset(TFDSDataset):
    """COCO is a large-scale object detection, segmentation, and captioning
    dataset.

    This version contains images, bounding boxes and labels for the 2014
    version of the dataset.

    Notes:
        - COCO defines 91 classes but the data only uses 80 classes
        - some images from the train and validation sets don't have annotations
        - the test set does not have annotations
        - COCO 2014 and 2017 uses the same images, but different train/val/test
            splits

    Dataset size:
        37.57 GiB

    Source:
        http://cocodataset.org/#home
    """

    @property
    def name(self):
        return "coco-2014"

    @property
    def supported_splits(self):
        return ("test", "test2015", "train", "validation")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "coco/2014",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["objects"][
            "label"
        ].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageDetectionSampleParser(normalized=False)
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class COCO2017Dataset(TFDSDataset):
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
        return ("test", "train", "validation")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "coco/2017",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["objects"][
            "label"
        ].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageDetectionSampleParser(
            bounding_box_field="bbox"
        )
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class KITTIDataset(TFDSDataset):
    """KITTI contains a suite of vision tasks built using an autonomous
    driving platform.

    The full benchmark contains many tasks such as stereo, optical flow, visual
    odometry, etc. This dataset contains the object detection dataset,
    including the monocular images and bounding boxes. The dataset contains
    7481 training images annotated with 3D bounding boxes. A full description
    of the annotations can be found in the README of the object development kit
    on the KITTI homepage.

    Dataset size:
        5.27 GiB

    Source:
        http://www.cvlibs.net/datasets/kitti
    """

    @property
    def name(self):
        return "kitti"

    @property
    def supported_splits(self):
        return ("test", "train", "validation")

    @property
    def default_split(self):
        return "test"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "kitti",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["objects"][
            "type"
        ].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageDetectionSampleParser(label_field="type")
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class VOC2007Dataset(TFDSDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2007
    (VOC2007) for the detection competition.

    A total of 9963 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    24640 annotated objects.

    Note that, as per the official dataset, the test set of VOC2007 does not
    contain annotations.

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
        return ("train", "validation", "test")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "voc/2007",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["objects"][
            "label"
        ].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


class VOC2012Dataset(TFDSDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2012
    (VOC2012) for the detection competition.

    A total of 11540 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    27450 annotated objects.

    Note that, as per the official dataset, the test set of VOC2012 does not
    contain annotations.

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
        return ("train", "validation", "test")

    @property
    def default_split(self):
        return "validation"

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            return tfds.load(
                "voc/2012",
                split=split,
                data_dir=download_dir,
                download=True,
                with_info=True,
            )

        get_class_labels_fcn = lambda info: info.features["objects"][
            "label"
        ].names
        get_num_samples_fcn = lambda info: info.splits[split].num_examples
        sample_parser = _TFDSImageDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_class_labels_fcn,
            get_num_samples_fcn,
            sample_parser,
        )


AVAILABLE_DATASETS = {
    "mnist": MNISTDataset,
    "fashion-mnist": FashionMNISTDataset,
    "caltech101": Caltech101Dataset,
    "cifar10": CIFAR10Dataset,
    "cifar100": CIFAR100Dataset,
    "imagenet-2012": ImageNet2012Dataset,
    "coco-2014": COCO2014Dataset,
    "coco-2017": COCO2017Dataset,
    "kitti": KITTIDataset,
    "voc-2007": VOC2007Dataset,
    "voc-2012": VOC2012Dataset,
}


class _TFDSImageClassificationSampleParser(
    foud.ImageClassificationSampleParser
):
    def __init__(self, image_field="image", label_field="label", **kwargs):
        super(_TFDSImageClassificationSampleParser, self).__init__(**kwargs)
        self.image_field = image_field
        self.label_field = label_field

    def parse_image(self, sample):
        img = sample[self.image_field]
        return super(_TFDSImageClassificationSampleParser, self).parse_image(
            (img, None)
        )

    def parse_label(self, sample):
        target = sample[self.label_field]
        return super(_TFDSImageClassificationSampleParser, self).parse_label(
            (None, target)
        )


class _TFDSImageDetectionSampleParser(foud.ImageDetectionSampleParser):
    def __init__(self, image_field="image", objects_field="objects", **kwargs):
        super(_TFDSImageDetectionSampleParser, self).__init__(**kwargs)
        self.image_field = image_field
        self.objects_field = objects_field

    def parse_image(self, sample):
        img = sample[self.image_field]
        return self._parse_image(img)

    def parse_label(self, sample):
        target = sample[self.objects_field]

        if not self.normalized:
            # Absolute bounding box coordinates were provided, so we must have
            # the image to convert to relative coordinates
            img = self._parse_image(sample[self.image_field])
        else:
            img = None

        return self._parse_label(target, img=img)

    def parse(self, sample):
        img = sample[self.image_field]
        img = self._parse_image(img)
        target = sample[self.objects_field]
        label = self._parse_label(target, img=img)
        return img, label

    def _parse_label(self, target, img=None):
        # Convert from dict-of-lists to list-of-dicts
        target = [
            {self.bounding_box_field: bbox, self.label_field: label}
            for bbox, label in zip(
                target[self.bounding_box_field], target[self.label_field]
            )
        ]

        return super(_TFDSImageDetectionSampleParser, self)._parse_label(
            target, img=img
        )


def _download_and_prepare(
    dataset_dir,
    scratch_dir,
    download_fcn,
    get_class_labels_fcn,
    get_num_samples_fcn,
    sample_parser,
):
    #
    # Download the TFDS dataset, if necessary
    #
    # Prevents ResourceExhaustedError that can arise...
    # https://github.com/tensorflow/datasets/issues/1441#issuecomment-581660890
    #
    with fou.ResourceLimit(
        resource.RLIMIT_NOFILE, soft=4096, warn_on_failure=True
    ):
        dataset, info = download_fcn(scratch_dir)

    classes = get_class_labels_fcn(info)
    num_samples = get_num_samples_fcn(info)
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

    try:
        samples = dataset.as_numpy_iterator()
    except AttributeError:
        # Must be tensorflow < 2.1
        samples = tfds.as_numpy(dataset)

    # Write the formatted dataset to `dataset_dir`
    write_dataset_fcn(
        samples,
        dataset_dir,
        sample_parser=sample_parser,
        num_samples=num_samples,
    )

    return format, num_samples, classes
