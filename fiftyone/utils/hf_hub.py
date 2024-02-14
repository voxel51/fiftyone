"""
Utilities for working with
`Hugging Face Hub <hhttps://huggingface.co/docs/huggingface_hub>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import importlib.util
import inspect
import io
import logging
import os
import shutil
import sys

import PIL
from PIL import (
    JpegImagePlugin,
    PngImagePlugin,
    WebPImagePlugin,
    GifImagePlugin,
    MpoImagePlugin,
)

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.dataset as fod
import fiftyone.core.utils as fou
import fiftyone.types as fot
import huggingface_hub as hfh


logger = logging.getLogger(__name__)


datasets = fou.lazy_import(
    "datasets", callback=lambda: fou.ensure_package("datasets")
)


def push_to_hub(
    dataset, repo_name, private=True, exist_ok=False, **data_card_kwargs
):
    """Push a FiftyOne dataset to the Hugging Face Hub.

    Args:
        dataset: a FiftyOne dataset
        repo_name: the name of the dataset repo to create
        private (True): whether the repo should be private
        exist_ok (False): if True, do not raise an error if repo already exists.
        data_card_kwargs: additional keyword arguments to pass to the
            `DatasetCard` constructor
    """
    ### export the dataset to a temp local dir
    tmp_dir = f"/tmp/{repo_name}"

    dataset.export(
        export_dir=tmp_dir,
        dataset_type=fot.FiftyOneDataset,
        export_media=True,
    )

    hf_username = hfh.whoami()["name"]

    ## Create the dataset repo
    repo_id = os.path.join(hf_username, repo_name)
    hfh.create_repo(
        repo_id, repo_type="dataset", private=private, exist_ok=exist_ok
    )

    ## Upload the dataset to the repo
    api = hfh.HfApi()

    api.upload_folder(
        folder_path=tmp_dir,
        repo_id=repo_id,
        repo_type="dataset",
    )

    ## Create the dataset card
    card = _create_dataset_card(repo_id, dataset, **data_card_kwargs)
    card.push_to_hub(repo_id)

    ## Clean up
    shutil.rmtree(tmp_dir)


def load_from_hub(repo_id, *args, **kwargs):
    """Load a dataset from the Hugging Face Hub.

    Args:
        repo_id: the ID of the dataset repo to load
        *args: additional arguments to pass to `datasets.load_dataset`
        **kwargs: additional keyword arguments to pass to the `Dataset` constructor

    Returns:
        a :class:`fiftyone.core.Dataset`
    """
    if _is_convertable_to_fiftyone(repo_id):
        return _load_from_hub_with_script(repo_id, *args, **kwargs)
    else:
        return _load_fiftyone_dataset_from_hub(repo_id, **kwargs)


DATASET_CONTENT_TEMPLATE = """

This is a [FiftyOne](https://github.com/voxel51/fiftyone) dataset with {num_samples} samples.

```plaintext
{dataset_printout}
```

## Installation
If you haven't already, install FiftyOne:

```bash
pip install fiftyone
```

## Usage

```python
import fiftyone as fo
import fiftyone.utils.huggingface_hub as fouh

# Load the dataset
dataset = fouh.load_from_hub("{repo_id}")
## can also pass in any other dataset kwargs, like `name`, `persistent`, etc.

# Launch the App
session = fo.launch_app(dataset)
```
"""


def _get_dataset_tasks(dataset):
    """Get the tasks that can be performed on the given dataset."""

    def _has_label(ftype):
        return (
            len(list(dataset.get_field_schema(embedded_doc_type=ftype).keys()))
            > 0
        )

    tasks = []
    if _has_label(fol.Classification) or _has_label(fol.Classifications):
        tasks.append("image-classification")
    if _has_label(fol.Detections):
        tasks.append("object-detection")
    if _has_label(fol.Segmentation):
        tasks.append("semantic-segmentation")
    return tasks


def _get_dataset_tags(dataset):
    """Get the tags of the given dataset."""
    tags = ["fiftyone"]
    tags.append(dataset.media_type)
    tags.extend(dataset.tags)
    return sorted(list(set(tags)))


def _generate_dataset_summary(repo_id, dataset):
    """Generate a summary of the given dataset."""
    return DATASET_CONTENT_TEMPLATE.format(
        dataset_printout=dataset.__repr__(),
        num_samples=len(dataset),
        repo_id=repo_id,
    )


def _create_dataset_card(repo_id, dataset, **dataset_card_kwargs):
    """Create a `DatasetCard` for the given dataset."""

    card_inputs = {
        "language": "en",
        "annotations_creators": [],
        "task_categories": _get_dataset_tasks(dataset),
        "task_ids": [],
        "pretty_name": dataset.name,
        "license": None,
        "tags": _get_dataset_tags(dataset),
    }

    for key, value in dataset_card_kwargs.items():
        card_inputs[key] = value

    dataset_summary = _generate_dataset_summary(repo_id, dataset)
    if dataset_summary is not None:
        card_inputs["dataset_summary"] = dataset_summary

    card_data = hfh.DatasetCardData(**card_inputs)
    return hfh.DatasetCard.from_template(card_data)


def _import_module_from_path(path):
    spec = importlib.util.spec_from_file_location("module.name", path)
    module = importlib.util.module_from_spec(spec)
    sys.modules["module.name"] = module
    spec.loader.exec_module(module)
    return module


def _find_subclasses_in_module(module, base_class):
    subclasses = []
    for _, obj in inspect.getmembers(module):
        if (
            inspect.isclass(obj)
            and issubclass(obj, base_class)
            and obj is not base_class
        ):
            subclasses.append(obj)
    return subclasses


def _save_PIL_image_to_disk(image, path, basename):
    ext = ".jpeg"

    if isinstance(image, PngImagePlugin.PngImageFile):
        ext = ".png"
        save_path = os.path.join(path, basename + ext)
        if not os.path.exists(save_path):
            image.save(save_path)
    elif isinstance(image, JpegImagePlugin.JpegImageFile):
        save_path = os.path.join(path, basename + ext)
        if not os.path.exists(save_path):
            image.save(save_path)
    elif isinstance(
        image,
        (MpoImagePlugin.MpoImageFile, WebPImagePlugin.WebPImageFile),
    ):
        save_path = os.path.join(path, basename + ext)
        if os.path.exists(save_path):
            return save_path
        image_bytes = io.BytesIO()
        image.save(image_bytes, format="JPEG")
        image_bytes.seek(0)

        with open(save_path, "wb") as file:
            file.write(image_bytes.getvalue())
    elif isinstance(image, GifImagePlugin.GifImageFile):
        save_path = os.path.join(path, basename + ext)
        if os.path.exists(save_path):
            return save_path
        image.convert("RGB").save(save_path, "JPEG")
    else:
        return Warning(f"Image type {type(image)} not supported")
        # raise ValueError(f"Image type {type(image)} not supported")

    return save_path


def _get_download_dir(repo_id, *hf_args):
    download_dir = os.path.join(
        fo.config.default_dataset_dir, "huggingface", "hub", repo_id
    )
    if len(hf_args) > 0:
        download_dir = os.path.join(download_dir, *hf_args)

    if not os.path.exists(download_dir):
        os.makedirs(download_dir)

    return download_dir


def _get_image_field_name(hf_dataset):
    if isinstance(hf_dataset, datasets.DatasetDict):
        split_names = list(hf_dataset.keys())
        return _get_image_field_name(hf_dataset[split_names[0]])

    for feature_name, feature in hf_dataset.features.items():
        if isinstance(feature, datasets.features.Image):
            return feature_name
    return None


def _add_images(
    fo_dataset, hf_dataset, image_field, download_dir, split_name=None
):
    samples = []
    for i, item in enumerate(hf_dataset):
        image = item[image_field]
        basename = f"{image_field}_{i:08d}"
        save_path = _save_PIL_image_to_disk(image, download_dir, basename)
        sample_dict = {"filepath": save_path}
        if split_name is not None:
            sample_dict["tags"] = [split_name]
        samples.append(fo.Sample(**sample_dict))
    fo_dataset.add_samples(samples)


def _convert_hf_value_dtype(hf_value):
    dtype = hf_value.dtype
    if dtype in ["int8", "int16", "int32", "int64"]:
        return fo.IntField
    elif dtype in ["float16", "float32", "float64"]:
        return fo.FloatField
    elif dtype == "bool":
        return fo.BooleanField
    elif dtype == "string":
        return fo.StringField
    else:
        raise ValueError(f"Unknown dtype {dtype}")


def _is_classification_field(feature):
    return isinstance(feature, datasets.features.ClassLabel)


def _add_classification_field(fo_dataset, hf_dataset, feature_name):
    logger.info(f"Adding classification field {feature_name} to dataset")
    fo_dataset.add_sample_field(
        feature_name,
        fo.EmbeddedDocumentField,
        embedded_doc_type=fo.Classification,
    )
    label_classes = hf_dataset.features[feature_name].names
    labels = []
    for i, item in enumerate(hf_dataset):
        label = fo.Classification(label=label_classes[item[feature_name]])
        labels.append(label)
    fo_dataset.set_values(feature_name, labels)


def _is_bounding_box_field(feature):
    return isinstance(feature, datasets.Sequence) and feature.length == 4


def _get_bounding_box_field_name(hf_dataset, detection_field_name):
    for column_name, feature in hf_dataset.features[
        detection_field_name
    ].feature.items():
        if _is_bounding_box_field(feature):
            return column_name


def _has_bounding_box(feature):
    if not hasattr(feature, "feature"):
        return False
    return any(
        [
            _is_bounding_box_field(subfeature)
            for subfeature in feature.feature.values()
        ]
    )


def _has_class_label(feature):
    if not hasattr(feature, "feature"):
        return False
    return any(
        [
            isinstance(subfeature, datasets.ClassLabel)
            for subfeature in feature.feature.values()
        ]
    )


def _is_class_label_field(feature):
    return isinstance(feature, datasets.ClassLabel)


def _get_detection_label_field_name(hf_dataset, detection_field_name):
    for column_name, feature in hf_dataset.features[
        detection_field_name
    ].feature.items():
        if _is_class_label_field(feature):
            return column_name


def _convert_bounding_box(hf_bbox, img_size):
    x, y, w, h = hf_bbox
    if all([0 <= c <= 1 for c in [x, y, w, h]]):
        return hf_bbox
    else:
        return [
            x / img_size[0],
            y / img_size[1],
            w / img_size[0],
            h / img_size[1],
        ]


def _is_detection_field(feature):
    if not isinstance(feature, datasets.Sequence):
        return False
    return _has_class_label(feature) and _has_bounding_box(feature)


def _add_detections_field(fo_dataset, hf_dataset, feature_name):
    logger.info(f"Adding detections field {feature_name} to dataset")

    image_widths = fo_dataset.values("metadata.width")
    image_heights = fo_dataset.values("metadata.height")
    img_sizes = list(zip(image_widths, image_heights))
    fo_dataset.add_sample_field(
        feature_name, fo.EmbeddedDocumentField, embedded_doc_type=fo.Detections
    )
    label_field = _get_detection_label_field_name(hf_dataset, feature_name)
    label_classes = (
        hf_dataset.features[feature_name].feature[label_field].names
    )
    bbox_field_name = _get_bounding_box_field_name(hf_dataset, feature_name)

    det_keys = list(hf_dataset.features[feature_name].feature.keys())
    dataset_detections = []
    for i, item in enumerate(hf_dataset):
        detections = []
        for j in range(len(item[feature_name][bbox_field_name])):
            detection_dict = {}
            for key in det_keys:
                if key == bbox_field_name:
                    detection_dict["bounding_box"] = _convert_bounding_box(
                        item[feature_name][bbox_field_name][j], img_sizes[i]
                    )
                elif key == label_field:
                    detection_dict["label"] = label_classes[
                        item[feature_name][label_field][j]
                    ]
                elif key == "id":
                    detection_dict["hf_id"] = item[feature_name][key][j]
                else:
                    detection_dict[key] = item[feature_name][key][j]
            detection = fo.Detection(**detection_dict)
            detections.append(detection)
        detections = fo.Detections(detections=detections)
        dataset_detections.append(detections)

    fo_dataset.set_values(feature_name, dataset_detections)


def _convert_hf_type_to_fiftyone(fo_dataset, hf_dataset, feature_name):
    feature_type = hf_dataset.features[feature_name]
    logger.info(f"Converting feature {feature_name} of type {feature_type}")

    if isinstance(feature_type, datasets.features.Value):
        fo_dtype = _convert_hf_value_dtype(feature_type)
        _feature_name = "hf_id" if feature_name == "id" else feature_name
        fo_dataset.add_sample_field(_feature_name, fo_dtype)
        vals = hf_dataset[_feature_name]
        fo_dataset.set_values(_feature_name, vals)
    elif _is_classification_field(feature_type):
        _add_classification_field(fo_dataset, hf_dataset, _feature_name)
    elif _is_detection_field(feature_type):
        _add_detections_field(fo_dataset, hf_dataset, _feature_name)
    elif isinstance(feature_type, datasets.Sequence):
        subfeature = feature_type.feature
        fo_subtype = _convert_hf_value_dtype(subfeature)
        fo_dataset.add_sample_field(
            _feature_name, fo.ListField, subfield=fo_subtype
        )
        vals = hf_dataset[_feature_name]
        fo_dataset.set_values(_feature_name, vals)


def _convert_hf_dataset_to_fiftyone(
    hf_dataset, repo_id, image_field=None, **kwargs
):
    if "name" not in kwargs:
        kwargs["name"] = repo_id
    logger.info("Converting dataset")
    fo_dataset = fo.Dataset(**kwargs)
    download_dir = _get_download_dir(repo_id)
    if image_field is None:
        image_field = _get_image_field_name(hf_dataset)

    def _add_split_to_fo_dataset(
        main_fo_dataset, hf_split, image_field, download_dir, split_name=None
    ):
        tmp_fo_dataset = fo.Dataset()
        _add_images(
            tmp_fo_dataset,
            hf_split,
            image_field,
            download_dir,
            split_name=split_name,
        )
        tmp_fo_dataset.compute_metadata()
        for feature_name in hf_split.features:
            if feature_name == image_field:
                continue
            _convert_hf_type_to_fiftyone(
                tmp_fo_dataset, hf_split, feature_name
            )
        main_fo_dataset.merge_samples(tmp_fo_dataset)

    if isinstance(hf_dataset, datasets.DatasetDict):
        split_names = list(hf_dataset.keys())
        for split_name in split_names:
            logger.info(f"Processing split '{split_name}'")
            split = hf_dataset[split_name]
            _add_split_to_fo_dataset(
                fo_dataset,
                split,
                image_field,
                download_dir,
                split_name=split_name,
            )
    else:
        _add_images(fo_dataset, hf_dataset, image_field, download_dir)
        fo_dataset.compute_metadata()
        _add_split_to_fo_dataset(
            fo_dataset,
            hf_dataset,
            image_field,
            download_dir,
        )

    return fo_dataset


class BaseHuggingFaceLoader:
    def __init__(self, repo_id: str, hf_dataset, **kwargs):
        self.repo_id = repo_id
        self.hf_dataset = hf_dataset
        self.kwargs = kwargs

    def load(self):
        raise NotImplementedError


class DefaultHuggingFaceLoader(BaseHuggingFaceLoader):
    def __init__(self, repo_id: str, hf_dataset, **kwargs):
        super().__init__(repo_id, hf_dataset, **kwargs)

    def load(self):
        return _convert_hf_dataset_to_fiftyone(
            self.hf_dataset, self.repo_id, **self.kwargs
        )


def _is_convertable_to_fiftyone(repo_id):
    api = hfh.HfApi()
    return api.file_exists(repo_id, "fiftyone.py", repo_type="dataset")


def _load_fiftyone_dataset_from_hub(repo_id, **kwargs):
    download_dir = os.path.join(
        fo.config.default_dataset_dir, "huggingface/hub", repo_id
    )
    hfh.snapshot_download(
        repo_id=repo_id, repo_type="dataset", local_dir=download_dir
    )

    dataset = fod.Dataset.from_dir(
        download_dir, dataset_type=fot.FiftyOneDataset, **kwargs
    )
    return dataset


def _load_from_hub_with_script(repo_id, *args, **kwargs):
    hf_dataset = datasets.load_dataset(repo_id, *args)
    fo_module_path = hfh.hf_hub_download(
        repo_id=repo_id, repo_type="dataset", filename="fiftyone.py"
    )
    conversion_module = _import_module_from_path(fo_module_path)
    subclasses = _find_subclasses_in_module(
        conversion_module, BaseHuggingFaceLoader
    )
    if len(subclasses) == 0:
        loader = DefaultHuggingFaceLoader(repo_id, hf_dataset, **kwargs)
    else:
        loader = subclasses[0](repo_id, hf_dataset, **kwargs)
    return loader.load()
