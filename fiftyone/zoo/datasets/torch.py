"""
FiftyOne Zoo Datasets provided by :mod:`torchvision:torchvision.datasets`.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.coco as fouc
import fiftyone.utils.data as foud
import fiftyone.utils.imagenet as foui
import fiftyone.utils.voc as fouv
import fiftyone.zoo.datasets as fozd


_TORCH_IMPORT_ERROR = """

You tried to download a dataset from the FiftyOne Dataset Zoo using the PyTorch
backend, but you do not have the necessary packages installed.

Ensure that you have `torch` and `torchvision` installed on your machine, and
then try running this command again.

See https://docs.voxel51.com/user_guide/dataset_zoo/index.html
for more information about working with the Dataset Zoo.
"""

_callback = lambda: fou.ensure_torch(error_msg=_TORCH_IMPORT_ERROR)
torchvision = fou.lazy_import("torchvision", callback=_callback)


class TorchVisionDataset(fozd.ZooDataset):
    """Base class for zoo datasets that are provided via the
    :mod:`torchvision:torchvision.datasets` package.
    """

    pass


class MNISTDataset(TorchVisionDataset):
    """The MNIST database of handwritten digits.

    The dataset consists of 70,000 28 x 28 grayscale images in 10 classes.
    There are 60,000 training images and 10,000 test images.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("mnist", split="test")

        session = fo.launch_app(dataset)

    Dataset size
        21.00 MB

    Source
        http://yann.lecun.com/exdb/mnist
    """

    @property
    def name(self):
        return "mnist"

    @property
    def tags(self):
        return ("image", "classification")

    @property
    def supported_splits(self):
        return ("train", "test")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.MNIST(
                download_dir, train=train, download=True
            )

        get_classes_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class FashionMNISTDataset(TorchVisionDataset):
    """The Fashion-MNIST database of Zalando's fashion article images.

    The dataset consists of 70,000 28 x 28 grayscale images in 10 classes.
    There are 60,000 training images and 10,000 test images.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("fashion-mnist", split="test")

        session = fo.launch_app(dataset)

    Dataset size
        36.42 MB

    Source
        https://github.com/zalandoresearch/fashion-mnist
    """

    @property
    def name(self):
        return "fashion-mnist"

    @property
    def tags(self):
        return ("image", "classification")

    @property
    def supported_splits(self):
        return ("train", "test")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.FashionMNIST(
                download_dir, train=train, download=True
            )

        get_classes_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class CIFAR10Dataset(TorchVisionDataset):
    """The CIFAR-10 dataset consists of 60,000 32 x 32 color images in 10
    classes, with 6,000 images per class. There are 50,000 training images and
    10,000 test images.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar10", split="test")

        session = fo.launch_app(dataset)

    Dataset size
        132.40 MB

    Source
        https://www.cs.toronto.edu/~kriz/cifar.html
    """

    @property
    def name(self):
        return "cifar10"

    @property
    def tags(self):
        return ("image", "classification")

    @property
    def supported_splits(self):
        return ("train", "test")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.CIFAR10(
                download_dir, train=train, download=True
            )

        get_classes_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class CIFAR100Dataset(TorchVisionDataset):
    """The CIFAR-100 dataset of images.

    The dataset consists of 60,000 32 x 32 color images in 100 classes, with
    600 images per class. There are 50,000 training images and 10,000 test
    images.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("cifar100", split="test")

        session = fo.launch_app(dataset)

    Dataset size
        132.03 MB

    Source
        https://www.cs.toronto.edu/~kriz/cifar.html
    """

    @property
    def name(self):
        return "cifar100"

    @property
    def tags(self):
        return ("image", "classification")

    @property
    def supported_splits(self):
        return ("train", "test")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        train = split == "train"

        def download_fcn(download_dir):
            return torchvision.datasets.CIFAR100(
                download_dir, train=train, download=True
            )

        get_classes_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class ImageNet2012Dataset(TorchVisionDataset):
    """The ImageNet 2012 dataset.

    ImageNet, as known as ILSVRC 2012, is an image dataset organized according
    to the WordNet hierarchy. Each meaningful concept in WordNet, possibly
    described by multiple words or word phrases, is called a "synonym set" or
    "synset". There are more than 100,000 synsets in WordNet, majority of them
    are nouns (80,000+). ImageNet provides on average 1,000 images to
    illustrate each synset. Images of each concept are quality-controlled and
    human-annotated. In its completion, we hope ImageNet will offer tens of
    millions of cleanly sorted images for most of the concepts in the WordNet
    hierarchy.

    Note that labels were never publicly released for the test set, so only the
    training and validation sets are provided.

    In order to load the ImageNet dataset, you must download the source data
    manually. The directory should be organized in the following format::

        source_dir/
            ILSVRC2012_devkit_t12.tar.gz    # both splits
            ILSVRC2012_img_train.tar        # train split
            ILSVRC2012_img_val.tar          # validation split

    You can register at http://www.image-net.org/download-images in order to
    get links to download the data.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        # The path to the source files that you manually downloaded
        source_dir = "/path/to/dir-with-imagenet-files"

        dataset = foz.load_zoo_dataset(
            "imagenet-2012",
            split="validation",
            source_dir=source_dir,
        )

        session = fo.launch_app(dataset)

    Dataset size
        144.02 GB

    Source
        http://image-net.org

    Args:
        source_dir (None): the directory containing the manually downloaded
            ImageNet files
    """

    def __init__(self, source_dir=None):
        self.source_dir = source_dir

    @property
    def name(self):
        return "imagenet-2012"

    @property
    def tags(self):
        return ("image", "classification", "manual")

    @property
    def supported_splits(self):
        return ("train", "validation")

    @property
    def requires_manual_download(self):
        return True

    def _download_and_prepare(self, dataset_dir, _, split):
        # Ensure that the source files have been manually downloaded
        foui.ensure_imagenet_manual_download(
            self.source_dir, split, devkit=True
        )

        if split == "validation":
            _split = "val"
        else:
            _split = split

        def download_fcn(_):
            return torchvision.datasets.ImageNet(self.source_dir, split=_split)

        get_classes_fcn = _parse_classification_labels
        sample_parser = foud.ImageClassificationSampleParser()
        return _download_and_prepare(
            dataset_dir,
            None,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class VOC2007Dataset(TorchVisionDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2007
    (VOC2007) for the classification and detection competitions.

    A total of 9,963 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    24,640 annotated objects. In the classification competition, the goal is to
    predict the set of labels contained in the image, while in the detection
    competition the goal is to predict the bounding box and label of each
    individual object.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("voc-2007", split="validation")

        session = fo.launch_app(dataset)

    Dataset size
        868.85 MB

    Source
        http://host.robots.ox.ac.uk/pascal/VOC/voc2007
    """

    @property
    def name(self):
        return "voc-2007"

    @property
    def tags(self):
        return ("image", "detection")

    @property
    def supported_splits(self):
        return ("train", "validation")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir,
                year="2007",
                image_set=image_set,
                download=True,
            )

        get_classes_fcn = _parse_voc_detection_labels
        sample_parser = _VOCDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


class VOC2012Dataset(TorchVisionDataset):
    """The dataset for the PASCAL Visual Object Classes Challenge 2012
    (VOC2012) for the Classification and Detection competitions.

    A total of 11,540 images are included in this dataset, where each image
    contains a set of objects, out of 20 different classes, making a total of
    27,450 annotated objects. In the classification competition, the goal is to
    predict the set of labels contained in the image, while in the detection
    competition the goal is to predict the bounding box and label of each
    individual object.

    Example usage::

        import fiftyone as fo
        import fiftyone.zoo as foz

        dataset = foz.load_zoo_dataset("voc-2012", split="validation")

        session = fo.launch_app(dataset)

    Dataset size
        3.59 GB

    Source
        http://host.robots.ox.ac.uk/pascal/VOC/voc2012
    """

    @property
    def name(self):
        return "voc-2012"

    @property
    def tags(self):
        return ("image", "detection")

    @property
    def supported_splits(self):
        return ("train", "validation")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir,
                year="2012",
                image_set=image_set,
                download=True,
            )

        get_classes_fcn = _parse_voc_detection_labels
        sample_parser = _VOCDetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
            download_fcn,
            get_classes_fcn,
            sample_parser,
        )


AVAILABLE_DATASETS = {
    "mnist": MNISTDataset,
    "fashion-mnist": FashionMNISTDataset,
    "cifar10": CIFAR10Dataset,
    "cifar100": CIFAR100Dataset,
    "imagenet-2012": ImageNet2012Dataset,
    "voc-2007": VOC2007Dataset,
    "voc-2012": VOC2012Dataset,
}


class _VOCDetectionSampleParser(foud.ImageDetectionSampleParser):
    def __init__(self):
        super().__init__(
            label_field=None,
            bounding_box_field=None,
            confidence_field=None,
            attributes_field=None,
            classes=None,
            normalized=True,  # True b/c image is not required to parse label
        )

    def _parse_label(self, target, img=None):
        if target is None:
            return None

        if etau.is_str(target):
            annotation = fouv.VOCAnnotation.from_xml(target)
        else:
            annotation = fouv.VOCAnnotation.from_dict(target)

        return annotation.to_detections()


def _download_and_prepare(
    dataset_dir,
    scratch_dir,
    download_fcn,
    get_classes_fcn,
    sample_parser,
):
    # Download the torchvision dataset, if necessary
    dataset = download_fcn(scratch_dir)

    classes = get_classes_fcn(dataset)
    num_samples = len(dataset)
    sample_parser.classes = classes
    label_cls = sample_parser.label_cls

    if not isinstance(label_cls, (list, tuple)):
        label_cls = [label_cls]

    if fol.Classification in label_cls:
        dataset_type = fot.FiftyOneImageClassificationDataset()
        dataset_exporter = foud.FiftyOneImageClassificationDatasetExporter(
            dataset_dir, classes=classes
        )
    elif fol.Detections in label_cls:
        dataset_type = fot.FiftyOneImageDetectionDataset()
        dataset_exporter = foud.FiftyOneImageDetectionDatasetExporter(
            dataset_dir, classes=classes
        )
    else:
        raise ValueError("Unsupported sample parser %s" % type(sample_parser))

    # Write the formatted dataset to `dataset_dir`
    foud.write_dataset(
        dataset, sample_parser, dataset_exporter, num_samples=num_samples
    )

    return dataset_type, num_samples, classes


def _parse_voc_detection_labels(_):
    return fouv.VOC_DETECTION_CLASSES


def _parse_coco_detection_labels_map(dataset):
    try:
        categories = dataset.coco.dataset["categories"]
        classes, _ = fouc.parse_coco_categories(categories)
        return classes
    except:
        return None


def _parse_classification_labels(dataset):
    classes = []
    for label in dataset.classes:
        if isinstance(label, tuple):
            label = label[0]

        classes.append(label)

    return classes
