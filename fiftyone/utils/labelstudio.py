"""
Utilities for working with annotations in
`Label Studio <https://labelstud.io>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import datetime
import itertools
import json
import logging
from packaging import version
import random
import string
import webbrowser

from bson import ObjectId
import numpy as np

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua

ls = fou.lazy_import(
    "label_studio_sdk",
    callback=lambda: fou.ensure_import("label_studio_sdk>=0.0.13"),
)


logger = logging.getLogger(__name__)


class LabelStudioBackendConfig(foua.AnnotationBackendConfig):
    """Class for configuring :class:`LabelStudioBackend` instances.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        url: the URL of the Label Studio server
        api_key: the API key to use for authentication
        project_name: the name of the project to use on the Label Studio server
    """

    def __init__(
        self,
        name,
        label_schema,
        media_field="filepath",
        url=None,
        api_key=None,
        project_name=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)

        self.url = url
        self.project_name = project_name

        self._api_key = api_key

    @property
    def api_key(self):
        return self._api_key

    @api_key.setter
    def api_key(self, value):
        self._api_key = value


class LabelStudioBackend(foua.AnnotationBackend):
    """Class for interacting with the Label Studio annotation backend."""

    @property
    def supported_media_types(self):
        return [fom.IMAGE]

    @property
    def supported_label_types(self):
        return [
            "classification",
            "detection",
            "detections",
            "instance",
            "instances",
            "polyline",
            "polylines",
            "polygon",
            "polygons",
            "keypoint",
            "keypoints",
            "segmentation",
            "scalar",
        ]

    @property
    def supported_scalar_types(self):
        return []

    @property
    def supported_attr_types(self):
        return []

    @property
    def supports_keyframes(self):
        return False

    @property
    def supports_video_sample_fields(self):
        return False

    @property
    def requires_label_schema(self):
        return True

    def _connect_to_api(self):
        return LabelStudioAnnotationAPI(
            url=self.config.url, api_key=self.config.api_key
        )

    def upload_annotations(self, samples, launch_editor=False):
        api = self.connect_to_api()

        logger.info("Uploading media to Label Studio...")
        results = api.upload_samples(samples, self)
        logger.info("Upload complete")

        if launch_editor:
            results.launch_editor()

        return results

    def download_annotations(self, results):
        api = self.connect_to_api()

        logger.info("Downloading labels from Label Studio...")
        annotations = api.download_annotations(results)
        logger.info("Download complete")

        return annotations


class LabelStudioAnnotationAPI(foua.AnnotationAPI):
    """A class to upload tasks and predictions to and fetch annotations from
    Label Studio.

    On initialization, the class will check if the server is reachable.
    """

    def __init__(self, url, api_key):
        self.url = url
        self._api_key = api_key
        self.backend = "labelstudio"
        self._min_server_version = "1.5.0"

        self._setup()

    def _setup(self):
        if self._api_key is None:
            self._api_key = self._prompt_api_key(self.backend)

        self._client = ls.Client(self.url, self._api_key)
        self._client.check_connection()
        self._verify_server_version()

    def _verify_server_version(self):
        server_version = self._client.make_request(
            "GET", "/api/version"
        ).json()["release"]
        if not version.parse(server_version) >= version.parse(
            self._min_server_version
        ):
            raise ValueError(
                "Current Label Studio integration is only compatible with "
                "version>=%s" % self._min_server_version
            )

    def _init_project(self, config, samples):
        """Creates a new project on Label Studio.

        If project_name is not set in the configs, it will be generated.
        If project_name exists on the server, a timestamp will be added
        to the project name.

        Args:
            config: a :class:`LabelStudioBackendConfig`
            samples: a :class:`fiftyone.core.collections.SampleCollection`

        Returns:
            a ``label_studio_sdk.Project``
        """
        project_name = deepcopy(config.project_name)
        label_schema = deepcopy(config.label_schema)

        if project_name is None:
            _dataset_name = samples._root_dataset.name.replace(" ", "_")
            project_name = "FiftyOne_%s" % _dataset_name

        # if project name take, add timestamp
        projects = self._client.list_projects()
        for one in projects:
            if one.params["title"] == project_name:
                time_str = str(int(datetime.timestamp(datetime.now())))
                project_name += "_%s" % time_str
                break

        # generate label config
        assert len(label_schema) == 1
        _, label_info = label_schema.popitem()
        label_config = generate_labeling_config(
            media=samples.media_type,
            label_type=label_info["type"],
            labels=label_info["classes"],
        )

        project = self._client.start_project(
            title=project_name, label_config=label_config
        )
        return project

    def _prepare_tasks(self, samples, label_schema, media_field):
        """Prepares Label Studio tasks for the given data."""
        samples.compute_metadata()

        ids, mime_types, filepaths = samples.values(
            ["id", "metadata.mime_type", media_field]
        )

        tasks = [
            {
                "source_id": _id,
                "media_type": "image",
                "mime_type": _mime_type,
                "image": _filepath,
            }
            for _id, _mime_type, _filepath in zip(ids, mime_types, filepaths)
        ]

        predictions, id_map = {}, {}
        for label_field, label_info in label_schema.items():
            if label_info["existing_field"]:
                predictions[label_field] = {
                    smp.id: export_label_to_label_studio(
                        smp[label_field],
                        full_result={
                            "from_name": "label",
                            "to_name": "image",
                            "original_width": smp.metadata["width"],
                            "original_height": smp.metadata["height"],
                            "image_rotation": getattr(smp, "rotation", 0),
                        },
                    )
                    for smp in samples.select_fields(label_field)
                }
                id_map[label_field] = {
                    smp.id: _get_label_ids(smp[label_field])
                    for smp in samples.select_fields(label_field)
                }

        return tasks, predictions, id_map

    def _upload_tasks(self, project, tasks, predictions=None):
        """Uploads files to Label Studio and registers them as tasks.

        Args:
            project: a ``label_studio_sdk.Project``
            tasks: a list of task dicts
            predictions (None): optional predictions to upload

        Returns:
            a dict mapping ``task_id`` to ``sample_id``
        """
        files = [
            (
                one["source_id"],
                (
                    one["source_id"],
                    open(one[one["media_type"]], "rb"),
                    one["mime_type"],
                ),
            )
            for one in tasks
        ]

        # upload files first and get their upload ids
        upload_resp = self._client.make_request(
            "POST",
            f"/api/projects/{project.id}/import",
            params={"commit_to_project": True},
            files=files,
        )

        # create tasks out of the uploaded files
        payload = json.dumps(
            {
                "file_upload_ids": upload_resp.json()["file_upload_ids"],
                "files_as_tasks_list": False,
            }
        )
        self._client.headers.update({"Content-Type": "application/json"})
        self._client.make_request(
            "POST", f"/api/projects/{project.id}/reimport", data=payload
        )

        # get uploaded task ids
        uploaded_ids = project.get_tasks(only_ids=True)[-len(files) :]
        uploaded_tasks = {
            i: t["source_id"] for i, t in zip(uploaded_ids, tasks)
        }

        # upload predictions if given
        if predictions:
            source2task = {v: k for k, v in uploaded_tasks.items()}
            for _, label_predictions in predictions.items():
                ls_predictions = [
                    {
                        "task": source2task[smp_id],
                        "result": pred,
                    }
                    for smp_id, pred in label_predictions.items()
                ]
                project.create_predictions(ls_predictions)

        return uploaded_tasks

    @staticmethod
    def _get_matched_labeled_tasks(project, task_ids):
        matched_tasks = project.get_tasks(selected_ids=task_ids)

        def task_filter(x):
            return x["is_labeled"] or bool(x.get("predictions"))

        return list(filter(task_filter, matched_tasks))

    def _import_annotations(self, tasks, task_map, label_type):
        results = {}
        for t in tasks:
            # convert latest annotation results
            if t["is_labeled"]:
                annotations = t.get("annotations", [])
            else:
                annotations = t.get("predictions", [])

            latest_annotation = (
                annotations[-1]
                if len(annotations) == 0
                else sorted(annotations, key=lambda x: x["updated_at"])[-1]
            )
            if label_type == "keypoints":
                labels = import_label_studio_annotation(
                    latest_annotation["result"]
                )
            else:
                labels = [
                    import_label_studio_annotation(r)
                    for r in latest_annotation.get("result", [])
                ]

            # add to dict
            if labels:
                label_ids = (
                    {l.id: l for l in labels}
                    if not isinstance(labels[0], fol.Regression)
                    else labels[0]
                )
                sample_id = task_map[t["id"]]
                results[sample_id] = label_ids

        return results

    def _export_to_label_studio(self, labels, label_type):
        if _LABEL_TYPES[label_type]["multiple"] is None:
            return export_label_to_label_studio(labels)

        return [export_label_to_label_studio(l) for l in labels]

    def upload_samples(self, samples, backend):
        """Uploads the given samples to Label Studio according to the given
        backend's annotation and server configuration.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            backend: a :class:`LabelStudioBackend` to use to perform the upload

        Returns:
            a :class:`LabelStudioAnnotationResults`
        """
        config = backend.config

        project = self._init_project(config, samples)

        tasks, predictions, id_map = self._prepare_tasks(
            samples,
            config.label_schema,
            config.media_field,
        )
        uploaded_tasks = self._upload_tasks(project, tasks, predictions)

        return LabelStudioAnnotationResults(
            samples,
            config,
            id_map=id_map,
            project_id=project.id,
            uploaded_tasks=uploaded_tasks,
            backend=backend,
        )

    def download_annotations(self, results):
        """Downloads the annotations from the Label Studio server for the given
        results instance and parses them into the appropriate FiftyOne types.

        Args:
            results: a :class:`LabelStudioAnnotationResults`

        Returns:
            the annotations dict
        """
        project = self._client.get_project(results.project_id)
        labeled_tasks = self._get_matched_labeled_tasks(
            project, list(results.uploaded_tasks.keys())
        )
        annotations = {}
        for label_field, label_info in results.config.label_schema.items():
            return_type = foua._RETURN_TYPES_MAP[label_info["type"]]
            labels = self._import_annotations(
                labeled_tasks, results.uploaded_tasks, return_type
            )
            annotations.update({label_field: {return_type: labels}})

        return annotations

    def upload_predictions(self, project, tasks, sample_labels, label_type):
        """Uploads the given predictions to an existing Label Studio project.

        Args:
            project: a ``label_studio_sdk.Project``
            tasks: a list of task dicts
            sample_labels: a list or list of lists of
                :class:`fiftyone.core.labels.Label` instances
            label_type: the label type string
        """
        for task, labels in zip(tasks, sample_labels):
            predictions = self._export_to_label_studio(labels, label_type)
            project.create_prediction(task, predictions)

    def delete_tasks(self, task_ids):
        """Deletes the given tasks from Label Studio.

        Args:
            task_ids: list of task ids
        """
        for t_id in task_ids:
            self._client.make_request(
                "DELETE",
                f"/api/tasks/{t_id}",
            )

    def delete_project(self, project_id):
        """Deletes the project from Label Studio.

        Args:
            project_id: project id
        """
        self._client.make_request(
            "DELETE",
            f"/api/projects/{project_id}",
        )


class LabelStudioAnnotationResults(foua.AnnotationResults):
    """Class that stores all relevant information needed to monitor the
    progress of an annotation run sent to Label Studio and download the
    results.
    """

    def __init__(
        self, samples, config, id_map, project_id, uploaded_tasks, backend=None
    ):
        super().__init__(samples, config, id_map=id_map, backend=backend)
        self.project_id = project_id
        self.uploaded_tasks = uploaded_tasks

    def load_credentials(self, url=None, api_key=None):
        """Load the Label Studio credentials from the given keyword arguments
        or the FiftyOne annotation config.

        Args:
            url (None): the url of the Label Studio server
            api_key (None): the Label Studio API key
        """
        self._load_config_parameters(url=url, api_key=api_key)

    def _load_config_parameters(self, **kwargs):
        config = self.config
        parameters = fo.annotation_config.backends.get(config.name, {})

        for name, value in kwargs.items():
            if value is None:
                value = parameters.get(name, None)

            if value is not None:
                setattr(config, name, value)

    def launch_editor(self):
        """Open a Label Studio tab in browser."""
        project_url = f"{self.config.url}/projects/{self.project_id}"
        logger.info("Launching editor at '%s'...", project_url)
        webbrowser.open_new_tab(project_url)

    def cleanup(self):
        if self.project_id is not None:
            api = self.backend.connect_to_api()
            api.delete_tasks(self.uploaded_tasks)
            api.delete_project(self.project_id)

    @classmethod
    def _from_dict(cls, d, samples, config):
        # int keys were serialized as strings...
        uploaded_tasks = {
            int(task_id): source_id
            for task_id, source_id in d["uploaded_tasks"].items()
        }

        return cls(
            samples,
            config,
            d["id_map"],
            d["project_id"],
            uploaded_tasks,
        )


def generate_labeling_config(media, label_type, labels=None):
    """Generates a labeling config for a Label Studio project.

    Args:
        media: The media type to label
        label_type: The type of labels to use
        labels (None): the labels to use

    Returns:
        a labeling config
    """
    etree = fou.lazy_import(
        "lxml.etree", callback=lambda: fou.ensure_import("lxml.etree")
    )

    assert media in ["image", "video"]
    assert (
        label_type in _LABEL_TYPES.keys()
        or label_type in foua._RETURN_TYPES_MAP.keys()
    )

    # root view and media view
    root = etree.Element("View")
    etree.SubElement(root, media.capitalize(), name=media, value=f"${media}")

    # labels view
    parent_tag, child_tag, tag_kwargs = _ls_tags_from_type(label_type)
    # parent_name = child_tag.lower() if child_tag else parent_tag.lower()
    label_view = etree.SubElement(
        root, parent_tag, name="label", toName=media, **tag_kwargs
    )
    if labels:
        for one in labels:
            etree.SubElement(label_view, child_tag, value=one)

    config_str = etree.tostring(root, pretty_print=True).decode()
    return config_str


def import_label_studio_annotation(result):
    """Imports an annotation from Label Studio.

    Args:
        result: the annotation result from Label Studio

    Returns:
        a :class:`fiftyone.core.labels.Label`
    """
    # TODO link keypoints by parent id
    # TODO handle multiple classes for segmentation
    if isinstance(result, dict):
        ls_type = result["type"]
    elif isinstance(result, list):
        ls_type = result[0]["type"]
    else:
        raise TypeError("Result type %s is not understood" % type(result))

    if ls_type == "choices":
        label = _from_choices(result)
    elif ls_type == "rectanglelabels":
        label = _from_rectanglelabels(result)
    elif ls_type == "polygonlabels":
        label = _from_polygonlabels(result)
    elif ls_type == "keypointlabels":
        label = _from_keypointlabels(result)
    elif ls_type == "brushlabels":
        label = _from_brushlabels(result)
    elif ls_type == "number":
        label = _from_number(result)
    else:
        raise ValueError("Unable to import %s from Label Studio" % ls_type)

    try:
        label_id = result["id"]
        ObjectId(label_id)  # verify that ID is valid
        label.id = label_id
    except:
        pass

    return label


def _update_dict(src_dict, update_dict):
    new = deepcopy(src_dict)
    new.update(update_dict)
    return new


def export_label_to_label_studio(label, full_result=None):
    """Exports a label to the Label Studio format.

    Args:
        label: a :class:`fiftyone.core.labels.Label` or list of
            :class:`fiftyone.core.labels.Label` instances
        full_result (None): if non-empty, return the full Label Studio result

    Returns:
        a dictionary or a list in Label Studio format
    """
    # TODO model version and model score
    if label is None:
        result_value = {}
        ls_type = None
        ids = []
    elif _check_type(label, fol.Classification, fol.Classifications):
        result_value, ls_type, ids = _to_classification(label)
    elif _check_type(label, fol.Detection, fol.Detections):
        result_value, ls_type, ids = _to_detection(label)
    elif _check_type(label, fol.Polyline, fol.Polylines):
        result_value, ls_type, ids = _to_polyline(label)
    elif _check_type(label, fol.Keypoint, fol.Keypoints):
        result_value, ls_type, ids = _to_keypoint(label)
    elif isinstance(label, fol.Segmentation):
        result_value, ls_type, ids = _to_segmentation(label)
    elif isinstance(label, fol.Regression):
        result_value = {"number": label.value}
        ls_type = "number"
        ids = label.id
    else:
        raise ValueError("Label type %s is not supported" % type(label))

    if full_result:
        # return full LS result
        if not isinstance(result_value, (list, tuple)):
            result_value = [result_value]

        return [
            _update_dict(
                full_result,
                dict(value=r, type=ls_type, id=i),
            )
            for r, i in zip(result_value, ids)
        ]

    return result_value


def _generate_prediction_id(n=10):
    return "".join(random.choices(string.ascii_letters, k=n))


def _to_classification(label):
    ls_type = "choices"

    if isinstance(label, list):
        return (
            {ls_type: [l.label for l in label]},
            ls_type,
            [l.id for l in label],
        )

    if isinstance(label, fol.Classifications):
        return (
            {ls_type: [l.label for l in label.classifications]},
            ls_type,
            [l.id for l in label.classifications],
        )

    return {ls_type: [label.label]}, ls_type, label.id


def _to_detection(label):
    ls_type = "rectanglelabels"

    if isinstance(label, list):
        return (
            [_to_detection(l)[0] for l in label],
            ls_type,
            [l.id for l in label],
        )

    if isinstance(label, fol.Detections):
        return (
            [_to_detection(l)[0] for l in label.detections],
            ls_type,
            [l.id for l in label.detections],
        )

    box = _denormalize_values(label.bounding_box)
    result = {
        "x": box[0],
        "y": box[1],
        "width": box[2],
        "height": box[3],
        "rotation": getattr(label, "rotation", 0),
        "rectanglelabels": [label.label],
    }
    return result, ls_type, label.id


def _to_polyline(label):
    ls_type = "polygonlabels"

    if isinstance(label, list):
        return (
            [_to_polyline(l)[0] for l in label],
            ls_type,
            [l.id for l in label],
        )

    if isinstance(label, fol.Polylines):
        return (
            [_to_polyline(l)[0] for l in label.polylines],
            ls_type,
            [l.id for l in label.polylines],
        )

    result = {
        "points": _denormalize_values(label.points[0]),
        "polygonlabels": [label.label],
    }
    return result, ls_type, label.id


def _to_keypoint(label):
    ls_type = "keypointlabels"

    if isinstance(label, list):
        return (
            sum([_to_keypoint(l)[0] for l in label], []),
            ls_type,
            [l.id for l in label],
        )

    if isinstance(label, fol.Keypoints):
        return (
            sum([_to_keypoint(l)[0] for l in label.keypoints], []),
            ls_type,
            [l.id for l in label.keypoints],
        )

    points = _denormalize_values(label.points)
    results = [
        {
            "x": p[0],
            "y": p[1],
            "width": getattr(label, "width", 0.34),
            "keypointlabels": [label.label],
        }
        for p in points
    ]
    return results, ls_type, label.id


def _to_segmentation(label):
    brush = fou.lazy_import(
        "label_studio_converter.brush",
        callback=lambda: fou.ensure_import("label_studio_converter.brush"),
    )
    rle = brush.mask2rle(label.get_mask())
    result = {"format": "rle", "rle": rle, "brushlabels": [label.label]}
    return result, "brushlabels", label.id


def _from_choices(result):
    label_values = result["value"]["choices"]
    if len(label_values) == 1:
        return fol.Classification(label=label_values[0])

    # multi-label classification
    return [fol.Classification(label=l) for l in label_values]


def _from_rectanglelabels(result):
    ls_box = [
        result["value"]["x"],
        result["value"]["y"],
        result["value"]["width"],
        result["value"]["height"],
    ]
    label_values = result["value"][result["type"]]
    return fol.Detection(
        label=label_values[0],
        bounding_box=_normalize_values(ls_box),
        rotation=result["value"].get("rotation", 0),
    )


def _from_polygonlabels(result):
    ls_points = _normalize_values(result["value"]["points"])
    label_values = result["value"][result["type"]]
    kwargs = dict(points=[ls_points], filled=True, closed=True)
    return fol.Polyline(label=label_values[0], **kwargs)


def _from_keypointlabels(result):
    keypoints = []
    group_fn = lambda x: x["value"]["keypointlabels"][0]
    for key, group in itertools.groupby(result, group_fn):
        points = [(one["value"]["x"], one["value"]["y"]) for one in group]
        points = _normalize_values(points)
        keypoints.append(fol.Keypoint(label=key, points=points))

    return keypoints


def _from_brushlabels(result):
    brush = fou.lazy_import(
        "label_studio_converter.brush",
        callback=lambda: fou.ensure_import("label_studio_converter.brush"),
    )

    label_values = result["value"]["brushlabels"]
    img = brush.decode_rle(result["value"]["rle"])
    mask = img.reshape(
        (result["original_height"], result["original_width"], 4)
    )[:, :, 3]
    return fol.Segmentation(label=label_values[0], mask=mask)


def _from_number(result):
    return fol.Regression(value=result["value"]["number"])


def _check_type(label, label_type, label_type_multiple):
    is_singular = isinstance(label, (label_type, label_type_multiple))
    is_list_type = isinstance(label, list) and isinstance(label[0], label_type)
    return is_singular or is_list_type


def _ls_tags_from_type(label_type):
    """Maps fiftyone types to Label Studio tags.

    Args:
        label_type: label studio type

    Returns:
        A tuple of parent tag, child tag and parent_tag kwargs
    """
    x = _LABEL_TYPES.get(
        label_type, _LABEL_TYPES[foua._RETURN_TYPES_MAP[label_type]]
    )
    return x["parent_tag"], x["child_tag"], x.get("tag_kwargs", {})


def _label_class_from_tag(label_type):
    """Maps Label Studio parent tag to fo.Label."""
    reverse = {
        v["parent_tag"].lower(): v["label"] for v in _LABEL_TYPES.values()
    }
    if label_type in reverse:
        return reverse[label_type]

    raise ValueError("Unknown label type: %s" % label_type)


def _tag_from_label(label_cls):
    label_cls = label_cls.lower()
    if label_cls in _LABEL_TO_TYPE:
        label_type = _LABEL_TO_TYPE[label_cls]
        return _LABEL_TYPES[label_type]["parent_tag"]

    if label_cls in foua._RETURN_TYPES_MAP:
        label_type = foua._RETURN_TYPES_MAP[label_cls]
        return _LABEL_TYPES[label_type]["parent_tag"]

    raise ValueError("Unsupported label class: %s" % label_cls)


def _normalize_values(values):
    values = np.array(values) / 100
    return values.tolist()


def _denormalize_values(values):
    values = np.array(values) * 100
    return values.tolist()


def _get_label_ids(label):
    if label is None:
        return []
    if isinstance(
        label, (fol.Classification, fol.Segmentation, fol.Regression)
    ):
        ids = label.id
    elif isinstance(label, fol.Classifications):
        ids = [l.id for l in label.classifications]
    elif isinstance(label, fol.Detections):
        ids = [l.id for l in label.detections]
    elif isinstance(label, fol.Polylines):
        ids = [l.id for l in label.polylines]
    elif isinstance(label, fol.Keypoints):
        ids = [l.id for l in label.keypoints]
    else:
        raise ValueError("Unsupported label type: %s" % type(label))

    return ids


_LABEL_TYPES = {
    "classification": dict(
        parent_tag="Choices",
        child_tag="Choice",
        label=fol.Classification,
        tag_kwargs={"choice": "single-radio"},
    ),
    "classifications": dict(
        parent_tag="Choices",
        child_tag="Choice",
        label=fol.Classification,
        tag_kwargs={"choice": "multiple"},
    ),
    "detections": dict(
        parent_tag="RectangleLabels",
        child_tag="Label",
        label=fol.Detection,
    ),
    "polylines": dict(
        parent_tag="PolygonLabels",
        child_tag="Label",
        label=fol.Polyline,
    ),
    "keypoints": dict(
        parent_tag="KeyPointLabels",
        child_tag="Label",
        label=fol.Keypoint,
    ),
    "segmentation": dict(
        parent_tag="BrushLabels",
        child_tag="Label",
        label=fol.Segmentation,
    ),
    "scalar": dict(
        parent_tag="Number",
        child_tag=None,
        label=fol.Regression,
    ),
}
_LABEL_TO_TYPE = {v["label"].__name__: k for k, v in _LABEL_TYPES.items()}
