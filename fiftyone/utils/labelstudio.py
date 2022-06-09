"""
Utilities for working with annotations in
`Label Studio <https://labelstud.io>`_.

Run Label Studio:
    1. As a python package:
        pip install label-studio
        label-studio start
    2. As a docker image:
        docker run -d -p 8080:8080 \
            --name labelstudio \
            -v /tmp/labelstudio:/data \
            labelstudio/labelstudio

Set environment variables:
    export FIFTYONE_LABELSTUDIO_URL=<url>
    export FIFTYONE_LABELSTUDIO_TOKEN=<token>

Annotate:
    dataset = fo.load_dataset("quickstart")
    dataset.annotate(<anno_key>, label_field=<field_name>,
                    label_type=<label_type>,
                    classes=[list, of, classes],
                    backend="labelstudio")
    # Note: a new project will be created with a labelling config
    # that matches label type and classes.
    # Note: it might take a while because files have to be
    # uploaded to the Label Studio server.

Load annotations:
    dataset.load_annotations(<anno_key>)
    # Note: this will only load the latest annotation per task
    # if multiple annotations exist for a task.
"""
import itertools
import json
import logging
import os
import random
import string
import webbrowser
from copy import deepcopy
from datetime import datetime as dt
from typing import List

import numpy as np

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.core.labels as fol
import fiftyone.utils.annotations as foua

ls = fou.lazy_import(
    "label_studio_sdk", callback=lambda: fou.ensure_import("label_studio_sdk")
)

logger = logging.getLogger(__name__)


class LabelStudioBackendConfig(foua.AnnotationBackendConfig):
    """Base class for Label Studio backend configuration.

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
        name: str,
        label_schema: str,
        media_field="filepath",
        url="http://localhost:8080",
        api_key=None,
        project_name=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)

        self.url = url
        self.project_name = project_name

        self._api_key = (
            api_key if api_key else os.getenv("FIFTYONE_LABELSTUDIO_TOKEN")
        )
        if self._api_key is None:
            raise ValueError("No Label Studio API key provided")

    @property
    def api_key(self):
        return self._api_key

    @api_key.setter
    def api_key(self, value):
        self._api_key = value


class LabelStudioBackend(foua.AnnotationBackend):
    """Base class to connect to Label Studio API and handle annotations."""

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
    def supported_attr_types(self):
        return []

    @property
    def supports_keyframes(self):
        return False

    @property
    def supports_video_sample_fields(self):
        return False

    def connect_to_api(self):
        return LabelStudioAnnotationSDK(
            url=self.config.url, api_key=self.config.api_key
        )

    def upload_annotations(self, samples, launch_editor=False):
        api = self.connect_to_api()

        logger.info("Uploading media to Label Studio...")
        results = api.upload_tasks(samples, self)
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


class LabelStudioAnnotationSDK(ls.Client):
    """A class to upload tasks and predictions to and fetch annotations
    from Label Studio

    On initialization, the class will check if the server is reachable.

    """

    def __post_init__(self):
        self.check_connection()

    def _init_project(self, config, samples):
        """Create a new project on Label Studio.

        If project_name is not set in the configs, it will be generated.
        If project_name exists on the server, a timestamp will be added
        to the project name.

        Args:
            config: an instance of LabelStudioBackendConfig
            samples: a sample collection object

        Returns:
            a label_studio_sdk.Project object
        """
        project_name = deepcopy(config.project_name)
        label_schema = deepcopy(config.label_schema)

        if project_name is None:
            _dataset_name = samples._root_dataset.name.replace(" ", "_")
            project_name = f"FiftyOne_{_dataset_name.replace(' ', '_')}"

        # if project name take, add timestamp
        projects = self.list_projects()
        for one in projects:
            if one.params["title"] == project_name:
                time_str = str(int(dt.timestamp(dt.now())))
                project_name += f"_{time_str}"
                break

        # generate label config
        assert len(label_schema) == 1
        _, label_info = label_schema.popitem()
        label_config = generate_labelling_config(
            media=samples.media_type,
            label_type=label_info["type"],
            labels=label_info["classes"],
        )

        project = self.start_project(
            title=project_name, label_config=label_config
        )
        return project

    def _prepare_tasks(self, samples, label_schema):
        """Extract sample data and existing labels if any"""
        samples.compute_metadata()
        tasks = [
            {
                "source_id": one.id,
                one.media_type: one.filepath,
                "media_type": "image",
                "mime_type": one.metadata.mime_type,
            }
            for one in samples.select_fields("filepath")
        ]

        predictions, id_map = {}, {}
        for label_field, label_info in label_schema.items():
            if label_info["existing_field"]:
                predictions[label_field] = {
                    smp.id: export_label_to_labelstudio(
                        smp[label_field],
                        full_result={
                            "from_name": "label",
                            "to_name": smp.media_type,
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

    def _import_tasks(self, project, tasks, predictions=None):
        """Upload files to Label Studio and register them as tasks.

        Args:
            project: label studio sdk Project instance
            tasks: a list of task dicts
            predictions: if given, these predictions will be uploaded as well

        Returns:
            a dict mapping of task_id to sample_id
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
        upload_resp = self.make_request(
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
        self.headers.update({"Content-Type": "application/json"})
        self.make_request(
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
    def _get_matched_labelled_tasks(project, task_ids):
        matched_tasks = project.get_tasks(selected_ids=task_ids)
        labelled_tasks = list(
            filter(lambda x: bool(x.get("annotations")), matched_tasks)
        )
        return labelled_tasks

    def _import_annotations(self, tasks, task_id2sample_id, label_type):
        results = {}
        for t in tasks:
            # convert latest annotation results
            annotations = t.get("annotations", [])
            latest_annotation = (
                annotations[-1]
                if len(annotations) == 0
                else sorted(annotations, key=lambda x: x["updated_at"])[-1]
            )
            if label_type == "keypoints":
                labels = import_labelstudio_annotation(
                    latest_annotation["result"]
                )
            else:
                labels = [
                    import_labelstudio_annotation(r)
                    for r in latest_annotation.get("result", [])
                ]

            # add to dict
            label_ids = (
                {l.id: l for l in labels}
                if not isinstance(labels[0], fol.Regression)
                else labels[0]
            )
            sample_id = task_id2sample_id[t["id"]]
            results[sample_id] = label_ids

        return results

    def _export_to_labelstudio(self, labels, label_type):
        if _LABEL_TYPES[label_type]["multiple"] is None:
            return export_label_to_labelstudio(labels)
        return [export_label_to_labelstudio(l) for l in labels]

    def upload_tasks(self, samples, backend):
        """Create a Label Studio project and upload samples"""
        config = backend.config
        project = self._init_project(config, samples)
        tasks, predictions, id_map = self._prepare_tasks(
            samples, config.label_schema
        )
        uploaded_tasks = self._import_tasks(project, tasks, predictions)
        return LabelStudioAnnotationResults(
            samples,
            config,
            id_map=id_map,
            project_id=project.id,
            uploaded_tasks=uploaded_tasks,
            backend=backend,
        )

    def download_annotations(self, results):
        """Import annotations from Label Studio.

        Args:
            results: LabelStudioAnnotationResults object

        Returns:
            # Scalar fields
            results[label_type][sample_id] = scalar

            # Label fields
            results[label_type][sample_id][label_id] = label
        """
        project = self.get_project(results.project_id)
        labelled_tasks = self._get_matched_labelled_tasks(
            project, list(results.uploaded_tasks.keys())
        )
        annotations = {}
        for label_field, label_info in results.config.label_schema.items():
            return_type = foua._RETURN_TYPES_MAP[label_info["type"]]
            labels = self._import_annotations(
                labelled_tasks, results.uploaded_tasks, return_type
            )
            annotations.update({label_field: {return_type: labels}})
        return annotations

    def upload_predictions(self, project, tasks, sample_labels, label_type):
        """Upload existing labels to Label Studio."""
        for task, labels in zip(tasks, sample_labels):
            predictions = self._export_to_labelstudio(labels, label_type)
            project.create_prediction(task, predictions)

    def delete_tasks(self, task_ids):
        """Delete tasks from Label Studio.

        Args:
            task_ids: list of task ids
        """
        for t_id in task_ids:
            self.make_request(
                "DELETE",
                f"/api/tasks/{t_id}",
            )

    def delete_project(self, project_id):
        """Delete project from Label Studio.

        Args:
            project_id: project id
        """
        self.make_request(
            "DELETE",
            f"/api/projects/{project_id}",
        )


class LabelStudioAnnotationResults(foua.AnnotationResults):
    """Base class for storing intermediate annotation results"""

    def __init__(
        self, samples, config, id_map, project_id, uploaded_tasks, backend=None
    ):
        super().__init__(samples, config, id_map=id_map, backend=backend)
        self.project_id = project_id
        self.uploaded_tasks = uploaded_tasks

    def load_credentials(self, **kwargs):
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


def generate_labelling_config(media, label_type, labels=None):
    """
    Generate a labelling config for a Label Studio project.

    Args:
        media: The media type to label.
        label_type: The type of labels to use.
        labels: The labels to use.

    Returns:
        A labelling config.
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


def import_labelstudio_annotation(result: dict):
    """Import an annotation from Label Studio.

    Args:
        result: The annotation result from Label Studio.

    Returns:
        fo.Label instance.
    """
    # TODO link keypoints by parent id
    # TODO handle multiple classes for segmentation
    if isinstance(result, dict):
        ls_type = result["type"]
    elif isinstance(result, list):
        ls_type = result[0]["type"]
    else:
        raise TypeError(f"type {type(result)} is not understood")

    if ls_type == "choices":
        return _from_choices(result)
    elif ls_type == "rectanglelabels":
        return _from_rectanglelabels(result)
    elif ls_type == "polygonlabels":
        return _from_polygonlabels(result)
    elif ls_type == "keypointlabels":
        return _from_keypointlabels(result)
    elif ls_type == "brushlabels":
        return _from_brushlabels(result)
    elif ls_type == "number":
        return fol.Regression(value=result["value"]["number"])
    else:
        raise ValueError(f"unable to import {ls_type=} from Label Studio")


def _update_dict(src_dict, update_dict):
    new = deepcopy(src_dict)
    new.update(update_dict)
    return new


def export_label_to_labelstudio(label, full_result=None):
    """Export a label to the Label Studio format

    Args:
        label: fo.Label instance or a list of fo.Label instances.
        full_result: If not empty, return the full result for Label Studio.

    Returns:
        a dictionary or a list with the Label Studio format
    """
    # TODO model version and model score
    if _check_type(label, fol.Classification, fol.Classifications):
        result_value, ls_type = _to_classification(label)
    elif _check_type(label, fol.Detection, fol.Detections):
        result_value, ls_type = _to_detection(label)
    elif _check_type(label, fol.Polyline, fol.Polylines):
        result_value, ls_type = _to_polyline(label)
    elif _check_type(label, fol.Keypoint, fol.Keypoints):
        result_value, ls_type = _to_keypoint(label)
    elif isinstance(label, fol.Segmentation):
        result_value, ls_type = _to_segmentation(label)
    elif isinstance(label, fol.Regression):
        result_value = {"number": label.value}
        ls_type = "number"
    else:
        raise ValueError(f"{type(label)} is not supported")

    if bool(full_result):
        # return full LS result
        if not isinstance(result_value, (list, tuple)):
            result_value = [result_value]
        return [
            _update_dict(
                full_result,
                dict(value=r, type=ls_type, id=_generate_prediction_id()),
            )
            for r in result_value
        ]
    else:
        return result_value


def _generate_prediction_id(n=10):
    return "".join(random.choices(string.ascii_letters, k=n))


def _to_classification(label):
    ls_type = "choices"
    if isinstance(label, list):
        return {ls_type: [l.label for l in label]}, ls_type
    elif isinstance(label, fol.Classifications):
        return {ls_type: [l.label for l in label.classifications]}, ls_type
    else:
        return {ls_type: [label.label]}, ls_type


def _to_detection(label):
    ls_type = "rectanglelabels"
    if isinstance(label, list):
        return [_to_detection(l)[0] for l in label], ls_type
    elif isinstance(label, fol.Detections):
        return [_to_detection(l)[0] for l in label.detections], ls_type
    else:
        box = _denormalize_values(label.bounding_box)
        result = {
            "x": box[0],
            "y": box[1],
            "width": box[2],
            "height": box[3],
            "rotation": getattr(label, "rotation", 0),
            "rectanglelabels": [label.label],
        }
        return result, ls_type


def _to_polyline(label):
    ls_type = "polygonlabels"
    if isinstance(label, list):
        return [_to_polyline(l)[0] for l in label], ls_type
    elif isinstance(label, fol.Polylines):
        return [_to_polyline(l)[0] for l in label.polylines], ls_type
    else:
        result = {
            "points": _denormalize_values(label.points[0]),
            "polygonlabels": [label.label],
        }
        return result, ls_type


def _to_keypoint(label):
    ls_type = "keypointlabels"
    if isinstance(label, list):
        return sum([_to_keypoint(l)[0] for l in label], []), ls_type
    elif isinstance(label, fol.Keypoints):
        return sum([_to_keypoint(l)[0] for l in label.keypoints], []), ls_type
    else:
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
        return results, ls_type


def _to_segmentation(label):
    brush = fou.lazy_import(
        "label_studio_converter.brush",
        callback=lambda: fou.ensure_import("label_studio_converter.brush"),
    )
    rle = brush.mask2rle(label.mask)
    result = {"format": "rle", "rle": rle, "brushlabels": [label.label]}
    return result, "brushlabels"


def _from_choices(result):
    label_values = result["value"]["choices"]
    if len(label_values) == 1:
        return fol.Classification(label=label_values[0])
    else:
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


def _check_type(label, label_type, label_type_multiple):
    is_singular = isinstance(label, (label_type, label_type_multiple))
    is_list_type = isinstance(label, list) and isinstance(label[0], label_type)
    return is_singular or is_list_type


def _ls_tags_from_type(label_type: str):
    """Map fiftyone types to labelstudio tags

    Args:
        label_type: label studio type

    Returns:
        A tuple of parent tag, child tag and parent_tag kwargs
    """
    x = _LABEL_TYPES.get(
        label_type, _LABEL_TYPES[foua._RETURN_TYPES_MAP[label_type]]
    )
    return x["parent_tag"], x["child_tag"], x.get("tag_kwargs", {})


def _label_class_from_tag(label_type: str):
    """Map Label Studio parent tag to fo.Label"""
    reverse = {
        v["parent_tag"].lower(): v["label"] for v in _LABEL_TYPES.values()
    }
    if label_type in reverse:
        return reverse[label_type]
    raise ValueError(f"Unknown label type: {label_type}")


def _tag_from_label(label_cls):
    label_cls = label_cls.lower()
    if label_cls in _LABEL2TYPE:
        label_type = _LABEL2TYPE[label_cls]
        return _LABEL_TYPES[label_type]["parent_tag"]
    if label_cls in foua._RETURN_TYPES_MAP:
        label_type = foua._RETURN_TYPES_MAP[label_cls]
        return _LABEL_TYPES[label_type]["parent_tag"]
    else:
        raise ValueError(f"Unsupported label class: {label_cls}")


def _normalize_values(values: List[float]) -> List[float]:
    values = np.array(values) / 100
    return values.tolist()


def _denormalize_values(values: List[float]) -> List[float]:
    values = np.array(values) * 100
    return values.tolist()


def _get_label_ids(label):
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
        raise ValueError(f"Unsupported label type: {type(label)}")
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
_LABEL2TYPE = {v["label"].__name__: k for k, v in _LABEL_TYPES.items()}
