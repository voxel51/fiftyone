"""
Utilities for working with annotations in
`Label Studio <https://labelstud.io>`_.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import datetime
from collections import defaultdict
import itertools
import json
import logging
import os
from packaging import version
import random
import string
import webbrowser

import os
from bson import ObjectId
import numpy as np

import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua

ls = fou.lazy_import(
    "label_studio_sdk",
    callback=lambda: fou.ensure_import("label_studio_sdk>=0.0.13"),
)
brush = fou.lazy_import(
    "label_studio_converter.brush",
    callback=lambda: fou.ensure_import("label_studio_converter.brush"),
)
etree = fou.lazy_import(
    "lxml.etree",
    callback=lambda: fou.ensure_import("lxml.etree"),
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
        url (None): the URL of the Label Studio server
        api_key (None): the API key to use for authentication
        project_name (None): the name of the project to use on the Label Studio
            server
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

        # store privately so these aren't serialized
        self._api_key = api_key

    @property
    def api_key(self):
        return self._api_key

    @api_key.setter
    def api_key(self, value):
        self._api_key = value

    def load_credentials(self, url=None, api_key=None):
        self._load_parameters(url=url, api_key=api_key)


class LabelStudioBackend(foua.AnnotationBackend):
    """Class for interacting with the Label Studio annotation backend."""

    @property
    def supported_media_types(self):
        return [fom.IMAGE]

    @property
    def supported_label_types(self):
        return [
            "classification",
            "classifications",
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

    def upload_annotations(self, samples, anno_key, launch_editor=False):
        api = self.connect_to_api()

        logger.info("Uploading media to Label Studio...")
        results = api.upload_samples(samples, anno_key, self)
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
        label_config = generate_labeling_config(
            label_schema, samples.media_type
        )

        project = self._client.start_project(
            title=project_name, label_config=label_config
        )
        return project

    def _prepare_tasks(self, samples, label_schema, media_field):
        """Prepares Label Studio tasks for the given data."""
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

        predictions = {}
        id_map = {}
        for label_field, label_info in label_schema.items():
            label_type = label_info["type"]
            if label_info["existing_field"]:
                predictions[label_field] = {
                    smp.id: export_label_to_label_studio(
                        smp[label_field],
                        label_type=label_type,
                        full_result={
                            "from_name": label_field,
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
        ls_root = os.getenv("LABEL_STUDIO_LOCAL_FILES_DOCUMENT_ROOT", None)
        ls_local_enabled = os.getenv(
            "LABEL_STUDIO_LOCAL_FILES_SERVING_ENABLED", None
        )
        local_storage_enabled = (
            ls_root is not None
            and ls_local_enabled is not None
            and ls_local_enabled.lower() == "true"
        )

        # If files are not inside local storage root, we can't use local storage
        common_prefix = os.path.commonprefix(
            [one[one["media_type"]] for one in tasks]
        ).rstrip("/")
        common_prefix = os.path.dirname(common_prefix)

        if local_storage_enabled and ls_root in common_prefix:
            logger.debug("Using local LabelStudio storage")
            project.connect_local_import_storage(common_prefix)

            def _get_file_path(file_path):
                return "/data/local-files?d=" + os.path.relpath(
                    file_path, ls_root
                )

            files_data = [
                {one["media_type"]: _get_file_path(one[one["media_type"]])}
                for one in tasks
            ]

            # Make the request to import tasks using URLs
            upload_resp = self._client.make_request(
                "POST",
                f"/api/projects/{project.id}/import",
                json=files_data,
            )
        else:
            logger.debug("Uploading as files")

            files = [
                (one["source_id"], open(one[one["media_type"]], "rb"))
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
        uploaded_ids = project.get_tasks(only_ids=True)[-len(tasks) :]
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

    def _import_annotations(self, tasks, task_map):
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
            latest_result = latest_annotation.get("result", [])
            # we need logic below to group keypoints with same label together
            result_kps = [
                r for r in latest_result if _result_type(r) == "keypointlabels"
            ]
            result_not_kps = [
                r for r in latest_result if _result_type(r) != "keypointlabels"
            ]
            labels = [
                import_label_studio_annotation(r) for r in result_not_kps
            ]
            if result_kps:
                labels += [import_label_studio_annotation(result_kps)]

            if not labels:
                continue

            # add to dict
            sample_id = task_map[t["id"]]
            # we save and pass both id and the name of the label field
            results[sample_id] = {}
            for ln, l in labels:
                if isinstance(l, fol.Classifications):
                    for classification_obj in l.classifications:
                        label_id = classification_obj.id
                        results[sample_id][label_id] = (ln, classification_obj)
                else:
                    results[sample_id][l.id] = (ln, l)

        return results

    def _export_to_label_studio(self, labels, label_type):
        if label_type == "instances":
            raise ValueError(
                "This method does not support uploading instance "
                "segmentations. Use upload_samples() instead"
            )

        if _LABEL_TYPES[label_type]["multiple"] is None:
            return export_label_to_label_studio(labels)

        return [export_label_to_label_studio(l) for l in labels]

    def upload_samples(self, samples, anno_key, backend):
        """Uploads the given samples to Label Studio according to the given
        backend's annotation and server configuration.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
            anno_key: the annotation key
            backend: a :class:`LabelStudioBackend` to use to perform the upload

        Returns:
            a :class:`LabelStudioAnnotationResults`
        """
        config = backend.config

        project = self._init_project(config, samples)

        samples.compute_metadata()

        # @todo can we add support for uploading tasks in batches?
        tasks, predictions, id_map = self._prepare_tasks(
            samples,
            config.label_schema,
            config.media_field,
        )
        uploaded_tasks = self._upload_tasks(project, tasks, predictions)

        return LabelStudioAnnotationResults(
            samples,
            config,
            anno_key,
            id_map,
            project.id,
            uploaded_tasks,
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
        all_labels = self._import_annotations(
            labeled_tasks, results.uploaded_tasks
        )
        annotations = defaultdict(lambda: defaultdict(dict))
        for task_id, task_labels in all_labels.items():
            for label_id, (label_field, label) in task_labels.items():
                annotations[label_field][task_id][label_id] = label

        # convert to expected format
        final_annotations = {}
        for label_field, label_info in results.config.label_schema.items():
            return_type = foua._RETURN_TYPES_MAP[label_info["type"]]
            # need to convert masks to detections
            if label_info["type"] == "instances":
                new_label_field = defaultdict(dict)
                for task_id, task_labels in annotations[label_field].items():
                    for label_id, label in task_labels.items():
                        detections = label.to_detections(
                            {255: label.label}
                        ).detections
                        detections = detections[0] if detections else None
                        new_label_field[task_id][label_id] = detections
                annotations[label_field] = new_label_field
            final_annotations[label_field] = {
                return_type: annotations[label_field]
            }

        return final_annotations

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
            self._client.make_request("DELETE", f"/api/tasks/{t_id}")

    def delete_project(self, project_id):
        """Deletes the project from Label Studio.

        Args:
            project_id: project id
        """
        self._client.make_request("DELETE", f"/api/projects/{project_id}")


class LabelStudioAnnotationResults(foua.AnnotationResults):
    """Class that stores all relevant information needed to monitor the
    progress of an annotation run sent to Label Studio and download the
    results.
    """

    def __init__(
        self,
        samples,
        config,
        anno_key,
        id_map,
        project_id,
        uploaded_tasks,
        backend=None,
    ):
        super().__init__(samples, config, anno_key, id_map, backend=backend)
        self.project_id = project_id
        self.uploaded_tasks = uploaded_tasks

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
    def _from_dict(cls, d, samples, config, anno_key):
        # int keys were serialized as strings...
        uploaded_tasks = {
            int(task_id): source_id
            for task_id, source_id in d["uploaded_tasks"].items()
        }

        return cls(
            samples,
            config,
            anno_key,
            d["id_map"],
            d["project_id"],
            uploaded_tasks,
        )


def generate_labeling_config(label_schema, media):
    """Generates a labeling config for a Label Studio project.

    Args:
        label_shema: dict defining each label type
        media: The media type to label

    Returns:
        a labeling config
    """
    assert media in ["image", "video"]
    possible_types = list(_LABEL_TYPES.keys()) + list(
        foua._RETURN_TYPES_MAP.keys()
    )

    # root view and media view
    root = etree.Element("View")
    etree.SubElement(root, media.capitalize(), name=media, value=f"${media}")

    for label_field, label_info in label_schema.items():
        assert label_info["type"] in possible_types
        parent_tag, child_tag, tag_kwargs = _ls_tags_from_type(
            label_info["type"]
        )
        label_view = etree.SubElement(
            root, parent_tag, name=label_field, toName=media, **tag_kwargs
        )
        if "classes" in label_info and label_info["classes"]:
            for one in label_info["classes"]:
                etree.SubElement(label_view, child_tag, value=one)

    config_str = etree.tostring(root, pretty_print=True).decode()
    return config_str


def _result_type(result):
    if isinstance(result, dict):
        return result["type"]
    elif isinstance(result, list):
        return result[0]["type"]
    else:
        raise TypeError("Result type %s is not understood" % type(result))


def import_label_studio_annotation(result):
    """Imports an annotation from Label Studio.

    Args:
        result: the annotation result from Label Studio

    Returns:
        a :class:`fiftyone.core.labels.Label`
    """
    # TODO link keypoints by parent id
    # TODO handle multiple classes for segmentation
    ls_type = _result_type(result)
    # we return this to match with label field later
    if isinstance(result, dict):
        from_name = result.get("from_name", "from_name")
    elif isinstance(result, list):
        from_name = result[0].get("from_name", "from_name")

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
    return from_name, label


def _update_dict(src_dict, update_dict):
    new = deepcopy(src_dict)
    new.update(update_dict)
    return new


def export_label_to_label_studio(label, label_type=None, full_result=None):
    """Exports a label to the Label Studio format.

    Args:
        label: a :class:`fiftyone.core.labels.Label` or list of
            :class:`fiftyone.core.labels.Label` instances
        label_type (None): the label type to use when exporting the annotation.
            This argument is only used when exporting object detections. By
            default, only the bounding boxes are exported, but you can pass
            ``label_type="instances"`` to export them as brush labels encoding
            the instance masks instead
        full_result (None): if non-empty, return the full Label Studio result

    Returns:
        a dictionary or a list in Label Studio format
    """
    # TODO model version and model score
    if label is None:
        result_value = {}
        ls_type = None
        ids = None
    elif _check_type(label, fol.Classification, fol.Classifications):
        result_value, ls_type, ids = _to_classification(label)
    elif _check_type(label, fol.Detection, fol.Detections):
        if label_type == "instances":
            size = (
                full_result["original_width"],
                full_result["original_height"],
            )
            result_value, ls_type, ids = _to_instance(label, size)
        else:
            result_value, ls_type, ids = _to_detection(label)
    elif _check_type(label, fol.Polyline, fol.Polylines):
        result_value, ls_type, ids = _to_polyline(label)
    elif _check_type(label, fol.Keypoint, fol.Keypoints):
        result_value, ls_type, ids = _to_keypoint(label)
    elif isinstance(label, fol.Segmentation):
        result_value, ls_type, ids = _to_segmentation(label)
    elif isinstance(label, fol.Regression):
        result_value, ls_type, ids = _to_regression(label)
    else:
        raise ValueError("Label type %s is not supported" % type(label))

    if full_result:
        # return full LS result
        if not isinstance(result_value, (list, tuple)):
            result_value = [result_value]
            ids = [ids]

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


def _to_instance(label, size):
    ls_type = "brushlabels"

    if isinstance(label, list):
        return (
            [_to_instance(l, size)[0] for l in label],
            ls_type,
            [l.id for l in label],
        )

    if isinstance(label, fol.Detections):
        return (
            [_to_instance(l, size)[0] for l in label.detections],
            ls_type,
            [l.id for l in label.detections],
        )

    rle = brush.mask2rle(label.to_segmentation(frame_size=size).get_mask())
    result = {"format": "rle", "rle": rle, "brushlabels": [label.label]}
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
    rle = brush.mask2rle(label.get_mask())
    result = {"format": "rle", "rle": rle, "brushlabels": [label.label]}
    return result, "brushlabels", label.id


def _to_regression(label):
    return {"number": label.value}, "number", label.id


def _from_choices(result):
    label_values = result["value"]["choices"]
    if len(label_values) == 1:
        return fol.Classification(label=label_values[0])

    # multi-label classification
    return fol.Classifications(
        classifications=[fol.Classification(label=l) for l in label_values]
    )


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

    if len(keypoints) == 1:
        return keypoints[0]
    else:
        return fol.Keypoints(keypoints=keypoints)


def _from_brushlabels(result):
    label_values = result["value"]["brushlabels"]
    img = brush.decode_rle(result["value"]["rle"])
    shape = (result["original_height"], result["original_width"], 4)
    mask = img.reshape(shape)[:, :, 3]

    label = label_values[0]
    segmentation = fol.Segmentation(label=label, mask=mask)
    return segmentation


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
    """Maps Label Studio parent tag to FiftyOne Label type."""
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
    "instances": dict(
        parent_tag="BrushLabels",
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
