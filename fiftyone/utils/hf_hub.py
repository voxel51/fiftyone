import json
import logging
import os
from packaging.requirements import Requirement
from PIL import Image
import requests

import huggingface_hub as hfh
import yaml

import fiftyone as fo
import fiftyone.constants as foc
from fiftyone.core.config import Config
import fiftyone.core.dataset as fod
import fiftyone.core.labels as fol
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou

DATASETS_SERVER_URL = "https://datasets-server.huggingface.co"
DEFAULT_MEDIA_TYPE = "image"
DATASET_METADATA_FILENAMES = ("fiftyone.yml", "fiftyone.yaml")
DATASETS_MAX_BATCH_SIZE = 100
DEFAULT_IMAGE_FILEPATH_FEATURE = "image"
FIFTYONE_BUILTIN_FIELDS = ("id", "filepath", "tags", "metadata")
REPO_TYPE = "dataset"
SUPPORTED_DTYPES = (
    "int8",
    "int16",
    "int32",
    "int64",
    "float16",
    "float32",
    "float64",
    "bool",
    "string",
)

logger = logging.getLogger(__name__)


def load_from_hub(repo_id, revision=None, **kwargs):
    """
    Load a dataset from the Hugging Face Hub into FiftyOne.

    Args:
        repo_id: the Hugging Face Hub identifier of the dataset
        revision: the revision of the dataset to load
        **kwargs: optional keyword arguments
            split: the split of the dataset to load
            splits: the splits of the dataset to load
            subset: the subset of the dataset to load
            subsets: the subsets of the dataset to load
            max_samples: the maximum number of samples to load
            batch_size: the batch size to use when loading samples
            overwrite (True): whether to overwrite an existing dataset with the same name
            persistent (False): whether the dataset should be persistent
            name: the name of the dataset to create
            config_file: the path to a config file to use to load the dataset,
                if the repo does not have a fiftyone.yml file
    Returns:
        a FiftyOne Dataset
    """
    config = _get_dataset_metadata(repo_id, revision=revision, **kwargs)
    if config is None:
        raise ValueError(f"Could not find fiftyone metadata for {repo_id}")
    return _load_dataset_from_config(config, **kwargs)


class HFHubDatasetConfig(Config):
    def __init__(self, **kwargs):
        """
        Config object for a Hugging Face Hub dataset

        Args:
            name: the name of the dataset
            repo_type: the type of the repository
            repo_id: the identifier of the repository
            revision: the revision of the dataset
            filename: the name of the file
            format: the format of the dataset
            tags: the tags of the dataset
            license: the license of the dataset
            description: the description of the dataset
            fiftyone: the fiftyone version requirement of the dataset
        """
        ## Internals
        self._repo_type = kwargs.get("repo_type", None)
        self._repo_id = kwargs.get("repo_id", None)
        self._revision = kwargs.get("revision", None)
        self._filename = kwargs.get("filename", None)
        self._format = kwargs.get("format", None)

        ## Dataset metadata
        self.tags = kwargs.get("tags", [])
        if isinstance(self.tags, str):
            self.tags = [t.strip() for t in self.tags.split(",")]
        elif isinstance(self.tags, list):
            self.tags = [t.strip() for t in self.tags]
        self.license = kwargs.get("license", None)
        self.description = kwargs.get("description", None)
        self._get_fiftyone_version(kwargs)

    def _get_fiftyone_version(self, kwargs):
        if kwargs.get("fiftyone", None) is None:
            self.version = None
        else:
            version = kwargs["fiftyone"].get("version", None)
            if version is None:
                self.version = None
            else:
                self.version = f"fiftyone{version}"


def _parse_split_kwargs(**kwargs):
    splits = kwargs.get("splits", None)
    split = kwargs.get("split", None)
    if splits is None and split is not None:
        splits = split

    if isinstance(splits, str):
        if "," in splits:
            splits = splits.split(",")
        else:
            splits = [splits]
    return splits


def _parse_subset_kwargs(**kwargs):
    subsets = kwargs.get("subsets", None)
    subset = kwargs.get("subset", None)
    if subsets is None and subset is not None:
        subsets = subset

    if isinstance(subsets, str):
        subsets = [subsets]
    return subsets


class HFHubParquetFilesDatasetConfig(HFHubDatasetConfig):
    def __init__(self, **kwargs):
        """
        Config object for a Hugging Face Hub dataset that is stored as parquet files

        Args:
            name: the name of the dataset
            repo_type: the type of the repository
            repo_id: the identifier of the repository
            revision: the revision of the dataset
            filename: the name of the file
            format: the format of the dataset
            tags: the tags of the dataset
            license: the license of the dataset
            description: the description of the dataset
            fiftyone: the fiftyone version requirement of the dataset
            label_fields: the label fields of the dataset
            media_type: the media type of the dataset
            default_media_fields: the default media fields of the dataset
            additional_media_fields: the additional media fields of the dataset
        """
        self.label_fields = kwargs.get("label_fields", None)
        self.media_type = kwargs.get("media_type", DEFAULT_MEDIA_TYPE)
        # self.detection_format = kwargs.get("detection_format", None)

        self._build_name(kwargs)
        # self._build_mask_targets(kwargs)
        self._build_media_fields_dict(kwargs)
        self._build_allowed_splits(kwargs)
        self._build_allowed_subsets(kwargs)
        super().__init__(**kwargs)

    def _build_name(self, kwargs):
        self.name = kwargs.get("name", None)
        if self.name is None:
            self.name = kwargs.get("repo_id", None)

    def _build_allowed_splits(self, kwargs):
        # Author specifies what splits are compatible with this config
        self._allowed_splits = _parse_split_kwargs(**kwargs)

    def _build_allowed_subsets(self, kwargs):
        # Author specifies what subsets are compatible with this config
        self._allowed_subsets = _parse_subset_kwargs(**kwargs)

    def _build_media_fields_dict(self, kwargs):
        media_fields_dict = kwargs.get("default_media_fields", {})
        if media_fields_dict.get("filepath", None) is None:
            media_fields_dict["filepath"] = DEFAULT_IMAGE_FILEPATH_FEATURE

        additional_media_fields = kwargs.get("additional_media_fields", {})
        media_fields_dict.update(additional_media_fields)
        self.media_fields = media_fields_dict

    # def _build_mask_targets(self, kwargs):
    #     self.mask_targets = kwargs.get("mask_targets", None)
    #     if self.mask_targets is not None and isinstance(self.mask_targets, str):
    #         kwargs = {
    #             "repo_type": self._repo_type,
    #             "repo_id": self._repo_id,
    #             "revision": self._revision,
    #             "filename": self.mask_targets,
    #         }
    #         mask_targets_fp = hf_hub_download(**all_kwargs)
    #         with open(mask_targets_fp, "r") as f:
    #             self.mask_targets = json.load(f)


def _build_config(config_dict):
    format = config_dict.get("format", None)
    if format == "ParquetFilesDataset":
        return HFHubParquetFilesDatasetConfig(**config_dict)
    else:
        return HFHubDatasetConfig(**config_dict)


def _get_dataset_metadata(repo_id, revision=None, **kwargs):
    """
    Checks if a huggingface dataset can be converted to fiftyone. If it is,
    it returns the metadata config loaded from the dataset's metadata file.

    If config_file kwargs is provided, it will use that file to load the config
    """
    common_kwargs = dict(repo_type=REPO_TYPE, revision=revision)
    config_file = kwargs.get("config_file", None)

    if config_file is not None:
        config_file = os.path.abspath(config_file)
        filename = os.path.basename(config_file)
        all_kwargs = dict(repo_id=repo_id, filename=filename, **common_kwargs)
    else:
        api = hfh.HfApi()
        for filename in DATASET_METADATA_FILENAMES:
            if api.file_exists(repo_id, filename, **common_kwargs):
                all_kwargs = dict(
                    repo_id=repo_id, filename=filename, **common_kwargs
                )
                logger.info(
                    f"Downloading config file {filename} from {repo_id}"
                )
                config_file = hfh.hf_hub_download(**all_kwargs)
                break

    if config_file is None:
        return None

    with open(config_file, "r") as f:
        config_dict = yaml.safe_load(f)
        config_dict.update(**all_kwargs)
    return _build_config(config_dict)


def _ensure_dataset_compatibility(config):
    error_level = fo.config.requirement_error_level

    req_str = config.version
    if req_str is None:
        return
    try:
        req = Requirement(req_str)
    except:
        logger.warning(
            f"Unable to parse dataset {config.name}'s fiftyone version requirement {req_str}."
        )
        return

    if not req.specifier.contains(foc.VERSION):
        exception = ImportError(
            f"Dataset {config.name} requires {req_str} but you are running {foc.VERSION}, which is not compatible"
        )
        fou.handle_error(exception, error_level)


def _get_download_dir(repo_id, split=None, subset=None, **kwargs):

    path_walk = [fo.config.default_dataset_dir, "huggingface", "hub", repo_id]

    ## Note: for now don't support multiple revisions storage..
    if subset is not None:
        path_walk.append(subset)
    if split is not None:
        path_walk.append(split)

    download_dir = os.path.join(*path_walk)

    if not os.path.exists(download_dir):
        os.makedirs(download_dir)

    return download_dir


def _get_split_subset_pairs(config):
    repo_id = config._repo_id
    revision = config._revision
    api_url = f"{DATASETS_SERVER_URL}/splits?dataset={repo_id.replace('/', '%2F')}&revision={revision}"
    response = requests.get(api_url).json()["splits"]
    return [(ss["split"], ss["config"]) for ss in response]


def _load_dataset_from_config(config, **kwargs):
    _ensure_dataset_compatibility(config)
    if isinstance(config, HFHubParquetFilesDatasetConfig):
        return _load_parquet_files_dataset_from_config(config, **kwargs)
    else:
        ## TODO: Implement this
        pass
        # return _load_fiftyone_dataset_from_config(config, **kwargs)


def _get_allowed_splits(config, **kwargs):
    user_splits = _parse_split_kwargs(**kwargs)
    author_splits = config._allowed_splits

    if not user_splits and not author_splits:
        return None
    else:
        return user_splits if user_splits else author_splits


def _get_allowed_subsets(config, **kwargs):
    user_subsets = _parse_subset_kwargs(**kwargs)
    author_subsets = config._allowed_subsets
    if not user_subsets and not author_subsets:
        return None
    else:
        return user_subsets if user_subsets else author_subsets


def _is_valid_split_subset_pair(
    split, subset, allowed_splits, allowed_subsets
):
    if allowed_splits is not None and split not in allowed_splits:
        return False
    if allowed_subsets is not None and subset not in allowed_subsets:
        return False
    return True


def _get_label_field_names_and_types(config):
    label_field_names, label_types = [], []
    label_fields = config.label_fields
    if label_fields is None:
        return label_field_names, label_types

    for label_type, fields in label_fields.items():
        if isinstance(fields, str):
            label_field_names.append(fields)
            label_types.append(label_type)
        elif isinstance(fields, list):
            label_field_names.extend(fields)
            label_types.extend([label_type] * len(fields))

    return label_field_names, label_types


def _get_parquet_dataset_features(repo_id, split, subset, revision=None):
    api_url = f"{DATASETS_SERVER_URL}/info?dataset={repo_id.replace('/', '%2F')}&config={subset}&split={split}]"
    if revision is not None:
        api_url += f"&revision={revision}"

    response = requests.get(api_url)
    features = response.json()["dataset_info"]["features"]
    return features


def _get_num_rows(repo_id, split, subset, revision=None):
    api_url = f"{DATASETS_SERVER_URL}/info?dataset={repo_id.replace('/', '%2F')}&config={subset}&split={split}]"
    if revision is not None:
        api_url += f"&revision={revision}"

    response = requests.get(api_url)
    splits = response.json()["dataset_info"]["splits"]
    return splits[split]["num_examples"]


def _build_rows_request_url(
    repo_id, split=None, subset="default", revision=None, offset=0, length=100
):
    url = f"{DATASETS_SERVER_URL}/rows?dataset={repo_id.replace('/', '%2F')}"
    if split is not None:
        url += f"&split={split}"
    if subset is not None:
        url += f"&config={subset}"
    if revision is not None:
        url += f"&revision={revision}"
    url += f"&offset={offset}&length={length}"
    return url


def _get_rows(
    repo_id, split, subset, start_index=0, end_index=100, revision=None
):
    length = end_index - start_index
    url = _build_rows_request_url(
        repo_id, split, subset, revision, offset=start_index, length=length
    )
    response = requests.get(url)
    return response.json()["rows"]


def _build_media_field_converter(
    media_field_key, media_field_name, feature, download_dir
):
    def convert_media_field(sample_dict, row):
        row_content = row["row"]
        row_index = row["row_idx"]

        filename = f"{media_field_name}_{row_index}.png"
        filepath = os.path.join(download_dir, filename)

        if feature["_type"] == "Image":
            url = row_content[media_field_name]["src"]
        else:
            url = row_content[media_field_name]

        try:
            ## create the file if it doesn't exist
            if not os.path.exists(filepath):
                Image.open(requests.get(url, stream=True).raw).save(filepath)
            sample_dict[media_field_key] = filepath
        except:
            logger.warning(f"Failed to download image from {url}")

    return convert_media_field


def _get_image_shape(image_path):
    with Image.open(image_path) as img:
        return img.size


def _get_detection_label_field_name(feature):
    for key, value in feature["feature"].items():
        if value["_type"] == "ClassLabel":
            return key
    return None


def _get_bounding_box_field_name(feature):
    for key, value in feature["feature"].items():
        if value["_type"] == "Sequence" and value["length"] == 4:
            return key
    return None


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


def _build_label_field_converter(
    field_name, field_type, feature, config, download_dir
):
    def convert_classification_field(sample_dict, row):
        row_content = row["row"]
        label_index = row_content[field_name]
        label = (feature["names"][label_index],)
        if isinstance(label, tuple):
            label = label[0]
        sample_dict[field_name] = fol.Classification(label=str(label))

    def convert_detection_field(sample_dict, row):
        img_w, img_h = _get_image_shape(sample_dict["filepath"])

        feature_content = row["row"][field_name]
        det_keys = list(feature["feature"].keys())
        bbox_key = _get_bounding_box_field_name(feature)
        det_label_key = _get_detection_label_field_name(feature)

        num_dets = len(feature_content[det_label_key])

        detections = []
        for i in range(num_dets):
            label = feature_content[det_label_key][i]
            bounding_box = feature_content[bbox_key][i]

            bounding_box = _convert_bounding_box(bounding_box, (img_w, img_h))
            det_dict = {
                "label": feature["feature"][det_label_key]["names"][label],
                "bounding_box": bounding_box,
            }
            for key in det_keys:
                if (
                    key not in [bbox_key, det_label_key]
                    and key not in FIFTYONE_BUILTIN_FIELDS
                ):
                    det_dict[key] = feature_content[key][i]

            detections.append(fol.Detection(**det_dict))

        sample_dict[field_name] = fol.Detections(detections=detections)

    def convert_mask_field(sample_dict, row):
        row_content = row["row"]
        row_index = row["row_idx"]
        filename = f"{field_name}_{row_index}.png"
        filepath = os.path.join(download_dir, filename)

        if feature["_type"] == "Image":
            url = row_content[field_name]["src"]
        else:
            url = row_content[field_name]

        try:
            ## create the file if it doesn't exist
            if not os.path.exists(filepath):
                Image.open(requests.get(url, stream=True).raw).save(filepath)

            sample_dict[field_name] = fol.Segmentation(mask_path=filepath)
        except:
            logger.warning(f"Failed to download mask from {url}")

    def convert_label_field(sample_dict, row):
        pass

    if field_type == "classification":
        return convert_classification_field
    elif "detection" in field_type:
        return convert_detection_field
    elif "mask" in field_type:
        return convert_mask_field

    return convert_label_field


def _build_dtype_field_converter(field_name, feature, config):
    def dont_convert(sample_dict, row):
        pass

    def convert_dtype_field(sample_dict, row):
        row_content = row["row"]
        fo_field_name = field_name
        if field_name in FIFTYONE_BUILTIN_FIELDS:
            fo_field_name = f"hf_{field_name}"
        sample_dict[fo_field_name] = row_content[field_name]

    if (
        feature["_type"] == "Value"
        and feature["dtype"] not in SUPPORTED_DTYPES
    ):
        return dont_convert
    elif (
        feature["_type"] == "Sequence"
        and feature["feature"]["dtype"] not in SUPPORTED_DTYPES
    ):
        logger.warning(
            f"Field {field_name} has dtype {feature['dtype']} which is not supported by fiftyone"
        )
        return dont_convert
    else:
        return convert_dtype_field


def _build_parquet_to_fiftyone_conversion(config, split, subset, **kwargs):
    feature_converters = {}

    features = _get_parquet_dataset_features(
        config._repo_id, split, subset, revision=config._revision
    )

    media_field_names = list(set(config.media_fields.values()))
    media_field_keys = list(config.media_fields.keys())
    lf_names, lf_types = _get_label_field_names_and_types(config)

    download_dir = _get_download_dir(
        config._repo_id, split=split, subset=subset, **kwargs
    )

    ## Media field handling
    for media_field_key in media_field_keys:
        media_field_name = config.media_fields[media_field_key]
        feature = features[media_field_name]
        feature_converters[media_field_name] = _build_media_field_converter(
            media_field_key, media_field_name, feature, download_dir
        )

    ## Label field handling
    for lfn, lft in zip(lf_names, lf_types):
        feature = features[lfn]
        feature_converters[lfn] = _build_label_field_converter(
            lfn, lft.replace("_fields", ""), feature, config, download_dir
        )

    for feature_name, feature in features.items():
        if feature_name in media_field_names or feature_name in lf_names:
            continue
        feature_converters[feature_name] = _build_dtype_field_converter(
            feature_name, feature, config
        )

    return feature_converters


def _add_parquet_subset_to_dataset(dataset, config, split, subset, **kwargs):
    feature_converters = _build_parquet_to_fiftyone_conversion(
        config, split, subset
    )

    num_rows = _get_num_rows(
        config._repo_id, split, subset, revision=config._revision
    )
    max_samples = kwargs.get("max_samples", None)
    if max_samples is not None:
        num_rows = min(num_rows, max_samples)

    batch_size = min(
        kwargs.get("batch_size", DATASETS_MAX_BATCH_SIZE),
        DATASETS_MAX_BATCH_SIZE,
    )
    if (
        kwargs.get("batch_size", None) is not None
        and batch_size != kwargs["batch_size"]
    ):
        logger.debug(
            f"Batch size {kwargs['batch_size']} is larger than the maximum batch size {DATASETS_MAX_BATCH_SIZE}. Using {DATASETS_MAX_BATCH_SIZE} instead"
        )

    logger.info(
        f"Adding {num_rows} samples to dataset {dataset.name} from {config.name} ({split}, {subset}) in batch sizes of {batch_size}..."
    )

    tags = [split]
    if subset != "default" and subset != config._repo_id:
        tags.append(subset)

    for start_idx in range(0, num_rows, batch_size):
        end_idx = min(start_idx + batch_size, num_rows)

        rows = _get_rows(
            config._repo_id,
            split,
            subset,
            start_index=start_idx,
            end_index=end_idx,
            revision=config._revision,
        )

        samples = []
        for row in rows:
            sample_dict = {}
            for convert in feature_converters.values():
                convert(sample_dict, row)

            sample_dict["row_idx"] = row["row_idx"]
            sample_dict["tags"] = tags
            sample = Sample(**sample_dict)
            samples.append(sample)
        dataset.add_samples(samples)


def _configure_dataset_media_fields(dataset, config):
    media_fields = config.media_fields
    media_field_keys = list(media_fields.keys())
    if len(media_field_keys) > 1:
        dataset.app_config_media_fields = media_field_keys
    if "thumbnail_path" in media_field_keys:
        dataset.app_config.grid_media_field = "thumbnail_path"
    dataset.save()


def _add_dataset_metadata(dataset, config):
    dataset.tags = config.tags
    description = config.description
    if description is not None:
        dataset.description = description

    dataset.info["source"] = "Hugging Face Hub"
    dataset.info["repo_id"] = config._repo_id
    if config.license is not None:
        dataset.info["license"] = config.license
    if config._revision is not None:
        dataset.info["revision"] = config._revision
    dataset.save()


def _load_parquet_files_dataset_from_config(config, **kwargs):
    logger.info("Loading parquet files dataset from config")
    allowed_splits = _get_allowed_splits(config, **kwargs)
    allowed_subsets = _get_allowed_subsets(config, **kwargs)
    if "splits" in kwargs:
        kwargs.pop("splits")
    if "split" in kwargs:
        kwargs.pop("split")

    overwrite = kwargs.get("overwrite", False)
    persistent = kwargs.get("persistent", False)

    split_subset_pairs = _get_split_subset_pairs(config)

    name_kwarg = kwargs.get("name", None)
    if name_kwarg is not None:
        name = name_kwarg
    else:
        name = config.name
        max_samples = kwargs.get("max_samples", None)
        if max_samples is not None:
            name += f"-{max_samples}"

    dataset = fod.Dataset(
        name=name,
        persistent=persistent,
        overwrite=overwrite,
    )

    for split, subset in split_subset_pairs:
        if not _is_valid_split_subset_pair(
            split, subset, allowed_splits, allowed_subsets
        ):
            continue

        _add_parquet_subset_to_dataset(
            dataset, config, split, subset, **kwargs
        )

    _configure_dataset_media_fields(dataset, config)
    _add_dataset_metadata(dataset, config)
    return dataset
