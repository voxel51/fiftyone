"""
FiftyOne Zoo Datasets provided by ``torchvision.datasets``.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import fiftyone.core.utils as fou
import fiftyone.types as fot
import fiftyone.utils.coco as fouc
import fiftyone.utils.data as foud
import fiftyone.utils.imagenet as foui
import fiftyone.utils.voc as fouv
import fiftyone.zoo as foz


_TORCH_IMPORT_ERROR = """

You tried to download a dataset from the FiftyOne Dataset Zoo using the PyTorch
backend, but you do not have the necessary packages installed.

Ensure that you have `torch` and `torchvision` installed on your machine, and
then try running this command again.

See https://voxel51.com/docs/fiftyone/user_guide/dataset_creation/zoo.html
for more information about working with the Dataset Zoo.
"""

_callback = lambda: fou.ensure_torch(error_msg=_TORCH_IMPORT_ERROR)
torchvision = fou.lazy_import("torchvision", callback=_callback)


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

    You must register at http://www.image-net.org/download-images in order to
    get the link to download the dataset.

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

    def _download_and_prepare(self, dataset_dir, _, split):
        # Ensure that the source files have been manually downloaded
        foui.ensure_imagenet_manual_download(dataset_dir, split)

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


class COCO2014Dataset(TorchVisionDataset):
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
        return ("test", "train", "validation")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            fou.ensure_pycocotools()
            images_dir, anno_path = fouc.download_coco_dataset_split(
                download_dir, split, year="2014", cleanup=True
            )
            return torchvision.datasets.CocoDetection(images_dir, anno_path)

        get_class_labels_fcn = _parse_coco_detection_labels_map
        sample_parser = fouc.COCODetectionSampleParser()
        return _download_and_prepare(
            dataset_dir,
            scratch_dir,
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
        return ("test", "train", "validation")

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        def download_fcn(download_dir):
            fou.ensure_pycocotools()
            images_dir, anno_path = fouc.download_coco_dataset_split(
                download_dir, split, year="2017", cleanup=True
            )
            return torchvision.datasets.CocoDetection(images_dir, anno_path)

        get_class_labels_fcn = _parse_coco_detection_labels_map
        sample_parser = fouc.COCODetectionSampleParser()
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

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir, year="2007", image_set=image_set, download=True,
            )

        get_class_labels_fcn = _parse_voc_detection_labels
        sample_parser = fouv.VOCDetectionSampleParser()
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

    def _download_and_prepare(self, dataset_dir, scratch_dir, split):
        if split == "validation":
            image_set = "val"
        else:
            image_set = split

        def download_fcn(download_dir):
            return torchvision.datasets.VOCDetection(
                download_dir, year="2012", image_set=image_set, download=True,
            )

        get_class_labels_fcn = _parse_voc_detection_labels
        sample_parser = fouv.VOCDetectionSampleParser()
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
    "coco-2014": COCO2014Dataset,
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
        dataset_type = fot.FiftyOneImageClassificationDataset()
        dataset_exporter = foud.FiftyOneImageClassificationDatasetExporter(
            dataset_dir, classes=classes
        )
    elif isinstance(sample_parser, foud.ImageDetectionSampleParser):
        dataset_type = fot.FiftyOneImageDetectionDataset()
        dataset_exporter = foud.FiftyOneImageDetectionDatasetExporter(
            dataset_dir, classes=classes
        )
    elif isinstance(sample_parser, foud.ImageLabelsSampleParser):
        dataset_type = fot.FiftyOneImageLabelsDataset()
        dataset_exporter = foud.FiftyOneImageLabelsDatasetExporter(dataset_dir)
    else:
        raise ValueError("Unsupported SampleParser %s" % type(sample_parser))

    # Write the formatted dataset to `dataset_dir`
    foud.write_dataset(
        dataset,
        sample_parser,
        dataset_exporter=dataset_exporter,
        num_samples=num_samples,
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
