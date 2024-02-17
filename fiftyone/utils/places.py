import os
import logging
import shutil
import json

import eta.core.serial as etas
import eta.core.utils as etau
import eta.core.web as etaw

import fiftyone.utils.data as foud

logger = logging.getLogger(__name__)


def download_places_dataset_split(
    dataset_dir,
    split,
    raw_dir=None,
):
    if split not in _IMAGE_DOWNLOAD_LINKS:
        raise ValueError(
            "Unsupported split '%s'; supported values are %s"
            % (split, tuple(_IMAGE_DOWNLOAD_LINKS.keys()))
        )

    # anno_path = os.path.join(dataset_dir, "categories.txt")
    did_download = False

    if raw_dir is None:
        raw_dir = os.path.join(dataset_dir, "raw")
    etau.ensure_dir(raw_dir)

    annotation_tar_name = os.path.basename(_ANNOTATION_DOWNLOAD_LINK)
    anno_dir = os.path.join(raw_dir, annotation_tar_name.replace(".tar", ""))

    if not os.path.isdir(anno_dir):
        logger.info("Downloading annotations to %s if necessary!", anno_dir)
        archive_path = os.path.join(raw_dir, annotation_tar_name)
        if not os.path.isfile(archive_path):
            etaw.download_file(_ANNOTATION_DOWNLOAD_LINK, path=archive_path)

        etau.extract_tar(archive_path, delete_tar=True)
    else:
        logger.info("Found %s at '%s'", annotation_tar_name, anno_dir)

    images_dir = os.path.join(dataset_dir, "data")

    if not os.path.isdir(images_dir):
        etau.ensure_dir(images_dir)
        logger.info(
            "Downloading %s split from %s to %s",
            split,
            _IMAGE_DOWNLOAD_LINKS[split],
            images_dir,
        )

        images_tar = os.path.join(
            images_dir, os.path.basename(_IMAGE_DOWNLOAD_LINKS[split])
        )
        if not os.path.isfile(images_tar):
            etaw.download_file(_IMAGE_DOWNLOAD_LINKS[split], path=images_tar)

        logger.info("Extracting and moving images...")

        etau.extract_tar(images_tar, delete_tar=True)

        if split == "validation" or split == "test":
            src = os.path.join(images_dir, _TAR_NAMES[split])
            dst = images_dir

            for f in os.listdir(src):
                _dst = os.path.join(dst, f)
                if os.path.isfile(_dst):
                    os.remove(_dst)
                elif os.path.isdir(_dst):
                    shutil.rmtree(_dst, ignore_errors=True)

                shutil.move(os.path.join(src, f), dst)

            etau.delete_dir(src)

            did_download = True

        if split == "train":
            src = os.path.join(images_dir, _TAR_NAMES[split])
            dst = images_dir

            for root, dirs, files in os.walk(src):
                for file in files:
                    if (
                        file.endswith(".png")
                        or file.endswith(".jpg")
                        or file.endswith(".jpeg")
                    ):
                        rel_path = os.path.relpath(root, src)
                        new_name = os.path.splitext(
                            os.path.join(rel_path, file)
                        )[0]
                        new_filename = (
                            new_name.replace(os.path.sep, "_")
                            + os.path.splitext(file)[1]
                        )
                        destination_path = os.path.join(dst, new_filename)
                        shutil.move(os.path.join(root, file), destination_path)

            for root, dirs, files in os.walk(src, topdown=False):
                for dir_name in dirs:
                    dir_path = os.path.join(root, dir_name)
                    shutil.rmtree(dir_path)

            did_download = True
    else:
        logger.info("Found %s split at '%s'", split, images_dir)

    categories_map = {}
    with open(os.path.join(raw_dir, "categories_places365.txt"), "r") as file:
        for line in file:
            components = line.strip().split()

            category = components[0]
            key = int(components[1])

            categories_map[key] = category

    if did_download:
        labels_dir = os.path.join(dataset_dir, "labels")
        etau.ensure_dir(labels_dir)
        txt_file = os.path.join(raw_dir, _ANNOTATION_FILES_PATH[split])
        json_file = os.path.join(labels_dir, "labels.json")

        if split == "validation":
            data = {}

            with open(txt_file, "r") as file:
                for line in file:
                    components = line.strip().split()

                    file_name = components[0]
                    category = int(components[1])

                    data[file_name] = categories_map[category]

            with open(json_file, "w") as outfile:
                json.dump(data, outfile, indent=4)

        if split == "train":
            data = {}

            with open(txt_file, "r") as file:
                for line in file:
                    components = line.strip().split()

                    file_name = components[0][1:].replace("/", "_")
                    category = int(components[1])

                    data[file_name] = categories_map[category]

            with open(json_file, "w") as outfile:
                json.dump(data, outfile, indent=4)

        if split == "test":
            data = {}

            with open(txt_file, "r") as file:
                for line in file:
                    line = line.strip()
                    data[line] = "Unlabelled"

            with open(json_file, "w") as outfile:
                json.dump(data, outfile, indent=4)

    num_samples = len(etau.list_files(os.path.join(images_dir)))
    classes = list(categories_map.values())

    return num_samples, classes, did_download


class PlacesDatasetImporter(foud.LabeledImageDatasetImporter):
    def __init__(
        self,
        dataset_dir=None,
        # data_path=None,
        # labels_path=None,
        # classes=None,
        # compute_metadata=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):

        super().__init__(
            dataset_dir=dataset_dir,
            # data_path=data_path,
            # labels_path=labels_path,
            # compute_metadata=compute_metadata,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self._labels_map = None
        self._images_map = None
        self._uuids = None
        self._iter_uuids = None

    @property
    def has_image_metadata(self):
        return False

    @property
    def has_dataset_info(self):
        return False

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __next__(self):
        image_id = next(self._iter_uuids)
        image_path = self._images_map[image_id]
        label = self._labels_map[os.path.basename(image_path)]

        return image_path, None, label

    def setup(self):
        dataset_dir = self.dataset_dir

        data_dir = os.path.join(dataset_dir, "data")
        labels_dir = os.path.join(dataset_dir, "labels")

        images_map = {
            os.path.splitext(filename)[0]: os.path.join(data_dir, filename)
            for filename in etau.list_files(data_dir)
        }
        available_ids = list(images_map.keys())

        self._uuids = available_ids
        self._images_map = images_map
        self._labels_map = etas.load_json(
            os.path.join(labels_dir, "labels.json")
        )

    @staticmethod
    def _get_num_samples(dataset_dir):
        return len(etau.list_files(os.path.join(dataset_dir, "data")))


_IMAGE_DOWNLOAD_LINKS = {
    "train": "http://data.csail.mit.edu/places/places365/train_256_places365standard.tar",
    "validation": "http://data.csail.mit.edu/places/places365/val_256.tar",
    "test": "http://data.csail.mit.edu/places/places365/test_256.tar",
}

_TAR_NAMES = {
    "train": "data_256",
    "validation": "val_256",
    "test": "test_256",
}

_ANNOTATION_DOWNLOAD_LINK = "http://data.csail.mit.edu/places/places365/filelist_places365-standard.tar"

_ANNOTATION_FILES_PATH = {
    "train": "places365_train_standard.txt",
    "validation": "places365_val.txt",
    "test": "places365_test.txt",
}

_SPLIT_SIZES = {"train": 1803460, "validation": 36500, "test": 328500}

_SUPPORTED_SPLITS = ["train", "validation", "test"]
