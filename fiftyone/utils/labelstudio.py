"""
Utilities for working with annotations in
`Label Studio <https://labelstud.io>`_.

Limitations:
- Takes latest annotation if multiple.
- Only uploads files.
- Predictions without scores yet
"""
import itertools
import json
import logging
from copy import deepcopy
from datetime import datetime as dt
from typing import List

import numpy as np

import fiftyone as fo
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua

ls = fou.lazy_import(
    "label_studio_sdk", callback=lambda: fou.ensure_import("label_studio_sdk")
)
etree = fou.lazy_import("lxml.etree", callback=lambda: fou.ensure_import("lxml.etree"))


logger = logging.getLogger(__name__)


class LabelStudioBackendConfig(foua.AnnotationBackendConfig):
    def __init__(
        self,
        name: str,
        label_schema: str,
        media_field="filepath",
        url=None,
        api_key=None,
        project_name=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)

        self.url = url if url is not None else "http://localhost:8080"
        self.api_key = api_key
        self.project_name = project_name

        assert api_key is not None, "set LABELSTUDIO_TOKEN in your environment"
        self._api_key = api_key

    @property
    def api_key(self):
        return self._api_key

    @api_key.setter
    def api_key(self, value):
        self._api_key = value


class LabelStudioBackend(foua.AnnotationBackend):
    @property
    def supported_label_types(self):
        return [
            "classification",
            "detection",
            "detections",
            "polyline",
            "polylines",
            "polygon",
            "polygons",
        ]

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
    def __post_init__(self):
        self.check_connection()

    def _init_project(self, config, samples):
        project_name = deepcopy(config.project_name)
        label_schema = deepcopy(config.label_schema)

        if project_name is None:
            _dataset_name = samples._root_dataset.name.replace(" ", "_")
            project_name = f"FiftyOne_{_dataset_name.replace(' ', '_')}"
        # if project name take, add timestr
        projects = self.list_projects()
        for one in projects:
            if one.params["title"] == project_name:
                time_str = str(int(dt.timestamp(dt.now())))
                project_name += f"_{time_str}"
                break

        # generate label config
        assert len(label_schema) == 1
        label_field, label_info = label_schema.popitem()
        label_config = generate_labelling_config(
            media=samples.media_type,
            label_type=label_info["type"],
            labels=label_info["classes"],
        )

        project = self.start_project(
            title=project_name, label_config=label_config
        )
        return project, label_info["type"]

    def _prepare_tasks(self, samples):
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
        return tasks

    def _import_tasks(self, project, tasks):
        """Upload files to Label Studio and register them as tasks

        Args:
            project: label studio sdk Project instance
            tasks: a list of task dicts

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

        uploaded_ids = project.get_tasks(only_ids=True)[-len(files) :]
        uploaded_tasks = {
            i: t["source_id"] for i, t in zip(uploaded_ids, tasks)
        }
        return uploaded_tasks

    @staticmethod
    def _get_matched_labelled_tasks(project, task_ids):
        matched_tasks = project.get_tasks(selected_ids=task_ids)
        labelled_tasks = list(
            filter(lambda x: bool(x.get("annotations")), matched_tasks)
        )
        return labelled_tasks

    def _import_annotations(self, tasks, task_id2sample_id):
        results = {}
        for t in tasks:
            # convert latest annotation results
            annotations = t.get("annotations", [])
            latest_annotation = (
                annotations[-1]
                if len(annotations) == 0
                else sorted(annotations, key=lambda x: x["updated_at"])[-1]
            )
            labels = [
                import_labelstudio_annotation(r)
                for r in latest_annotation.get("result", [])
            ]

            # # extend multiple types
            # label_cls = label[0]._cls
            # label_type = _LABEL2TYPE[label_cls]
            # label_multiple = _LABEL_TYPES[label_type]["multiple"]
            # if label_multiple is not None:
            #     label = label_multiple(**{label_type: label})
            # else:
            #     label = label[0]
            # label_id = label.id

            # add to dict
            sample_id = task_id2sample_id[t["id"]]
            results[sample_id] = {l.id: l for l in labels}
            # _update_results(results, label_type, sample_id, labels)

        return results

    def _export_to_labelstudio(self, labels, label_type):
        if _LABEL_TYPES[label_type]["multiple"] is None:
            return export_label_to_labelstudio(labels)
        else:
            return [export_label_to_labelstudio(l) for l in labels]

    def upload_tasks(self, samples, backend):
        config = backend.config
        project, label_type = self._init_project(config, samples)
        tasks = self._prepare_tasks(samples)
        uploaded_tasks = self._import_tasks(project, tasks)
        id_map = {}  # TODO change when uploading predictions
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
            results[label_field][label_type][sample_id][label_id] = fo.Label()
        """
        project = self.get_project(results.project_id)
        labelled_tasks = self._get_matched_labelled_tasks(
            project, list(results.uploaded_tasks.keys())
        )
        annotations = {}
        for label_field, label_info in results.config.label_schema.items():
            labels = self._import_annotations(
                labelled_tasks, results.uploaded_tasks
            )
            return_type = foua._RETURN_TYPES_MAP[label_info["type"]]
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
        raise NotImplementedError

    def cleanup(self):
        if self.project_id is not None:
            api = self.backend.connect_to_api()
            api.delete_tasks(self.uploaded_tasks)
            api.delete_project(self.project_id)


def generate_labelling_config(media: str, label_type: str, labels: List[str]):
    """
    Generate a labelling config for a Label Studio project.

    Args:
        media: The media type to label.
        label_type: The type of labels to use.
        labels: The labels to use.

    Returns:
        A labelling config.
    """
    assert media in ["image", "video"]
    assert label_type in ["polylines", "detections", "classification"]

    # root view and media view
    root = etree.Element("View")
    etree.SubElement(root, media.capitalize(), name=media, value=f"${media}")

    # labels view
    parent_tag, child_tag = _ls_tags_from_type(label_type)
    label_view = etree.SubElement(
        root, parent_tag, name=child_tag.lower(), toName=media
    )
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
    ls_type = result["type"]
    method = _label_class_from_tag(ls_type)
    value, *_ = result["value"][ls_type]
    if ls_type == "choices":
        kwargs = {}
    elif ls_type == "rectanglelabels":
        ls_box = [
            result["value"]["x"],
            result["value"]["y"],
            result["value"]["width"],
            result["value"]["height"],
        ]
        kwargs = dict(bounding_box=_normalize_values(ls_box))
    elif ls_type == "polygonlabels":
        ls_points = _normalize_values(result["value"]["points"])
        points = [[x, y] for x, y in zip(ls_points[:-1], ls_points[1:])]
        kwargs = dict(points=points, filled=True, closed=True)
    else:
        kwargs = {}
    return method(label=value, **kwargs)


def export_label_to_labelstudio(label):
    """Export a label to the Label Studio format

    Args:
        label: fo.Label instance

    Returns:
        a dictionary the Label Studio format
    """
    label_cls = label._cls
    ls_tag = _tag_from_label(label_cls).lower()
    result = {ls_tag: [label.label]}
    if ls_tag == "choices":
        return result
    elif ls_tag == "rectanglelabels":
        box = _denormalize_values(label.bounding_box)
        result.update(
            {
                "x": box[0],
                "y": box[1],
                "width": box[2],
                "height": box[3],
                "rotation": getattr(label, "rotation", 0),
            }
        )
        return result
    elif ls_tag == "polygonlabels":
        # if odd number of points then just take every odd vertex and unravel
        points = [p for p in itertools.chain(*label.points[::2])]
        if len(label.points) % 2 == 0:
            # if even number of points then add last point to the end
            points.append(label.points[-1][1])
        result.update({"points": _denormalize_values(points)})
        return result
    else:
        return result


def _ls_tags_from_type(label_type: str):
    """Map fiftyone types to labelstudio tags

    Args:
        label_type: label studio type

    Returns:
        A tuple of parent tag and child tag
    """
    if label_type in _LABEL_TYPES:
        x = _LABEL_TYPES[label_type]
        return x["parent_tag"], x["child_tag"]
    else:
        raise ValueError(f"Unknown label type: {label_type}")


def _label_class_from_tag(label_type: str):
    """Map Label Studio parent tag to fo.Label"""
    reverse = {
        v["parent_tag"].lower(): v["label"] for v in _LABEL_TYPES.values()
    }
    if label_type in reverse:
        return reverse[label_type]
    else:
        raise ValueError(f"Unknown label type: {label_type}")


def _tag_from_label(label_cls):
    if label_cls in _LABEL2TYPE:
        label_type = _LABEL2TYPE[label_cls]
        return _LABEL_TYPES[label_type]["parent_tag"]
    else:
        raise ValueError(f"Unsupported label class: {label_cls}")


def _normalize_values(values: List[float]) -> List[float]:
    values = np.array(values) / 100
    return values.tolist()


def _denormalize_values(values: List[float]) -> List[float]:
    values = np.array(values) * 100
    return values.tolist()


_LABEL_TYPES = {
    "polylines": dict(
        parent_tag="PolygonLabels",
        child_tag="Label",
        label=fo.Polyline,
        multiple=fo.Polylines,
    ),
    "detections": dict(
        parent_tag="RectangleLabels",
        child_tag="Label",
        label=fo.Detection,
        multiple=fo.Detections,
    ),
    "classification": dict(
        parent_tag="Choices",
        child_tag="Choice",
        label=fo.Classification,
        multiple=fo.Classifications,
    ),
}
_LABEL2TYPE = {v["label"].__name__: k for k, v in _LABEL_TYPES.items()}
