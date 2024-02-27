"""
Utilities for working with datasets in
`Prodigy format <https://prodi.gy>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import copy, deepcopy
from datetime import datetime
import itertools
import logging
import multiprocessing
import multiprocessing.dummy
import os
import warnings
import webbrowser

from bson import ObjectId
import jinja2
import numpy as np
import requests
import urllib3

import eta.core.data as etad
import eta.core.image as etai
import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
from fiftyone.core.sample import Sample
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua
import fiftyone.utils.data as foud
import fiftyone.utils.video as fouv


lb = fou.lazy_import(
    "labelbox", callback=lambda: fou.ensure_import("labelbox")
)
lbs = fou.lazy_import("labelbox.schema")
lbo = fou.lazy_import("labelbox.schema.ontology")
lbr = fou.lazy_import("labelbox.schema.review")


logger = logging.getLogger(__name__)


class ProdigyBackendConfig(foua.AnnotationBackendConfig):
    """Base class for configuring :class:`ProdigyBackend` instances.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        url (None): the url of the Prodigy server
        project_name (None): a name for the Prodigy project that will be
            created. The default is ``"FiftyOne_<dataset_name>"``
        port (None): the port on which the Prodigy server should run
    """

    def __init__(
        self,
        name,
        label_schema,
        media_field="filepath",
        url=None,
        project_name=None,
        port=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)

        self.url = url
        self.project_name = project_name

        if port:
            self.port = port


class ProdigyBackend(foua.AnnotationBackend):
    """Class for interacting with the Prodigy annotation backend.

    This class implements the logic required for your annotation backend to
    declare the types of labeling tasks that it supports, as well as the core
    upload_annotations() and download_annotations() methods, which handle
    uploading and downloading data and labels to your annotation tool.
    """

    @property
    def supported_label_types(self):
        return [
            "classification",
            "classifications",
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
        return ProdigyAnnotationAPI(
            "name", url=self.config.url, api_key=self.config.api_key
        )

    def upload_annotations(self, samples, launch_editor=False):
        api = self.connect_to_api()

        logger.info("Starting Prodigy server...")
        results = api.upload_samples(samples, self)
        logger.info("Prodigy server started.")

        if launch_editor:
            results.launch_editor()

        return results

    def download_annotations(self, results):
        api = self.connect_to_api()

        logger.info("Getting labels from Prodigy...")
        annotations = api.download_annotations(results)
        logger.info("Download complete")

        return annotations


class ProdigyAnnotationResults(foua.AnnotationResults):
    """Class that stores all relevant information needed to monitor the
    progress of an annotation run sent to Prodigy and download the results.

    This class stores any intermediate information necessary to track the
    progress of an annotation run that has been created and is now waiting for
    its results to be merged back into the FiftyOne dataset.
    """

    def __init__(
        self, samples, config, id_map, project_id, frame_id_map, backend=None
    ):
        super().__init__(samples, config, id_map, backend=backend)
        self.project_id = project_id
        self.frame_id_map = frame_id_map

    def load_credentials(self, url=None, api_key=None):
        """Load the Labelbox credentials from the given keyword arguments or
        the FiftyOne annotation config.

        Args:
            url (None): the url of the Labelbox server
            api_key (None): the Labelbox API key
        """
        self._load_config_parameters(url=url, api_key=api_key)

    def connect_to_api(self):
        """Returns an API instance connected to the Prodigy server.

        Returns:
            a :class:`ProdigyAnnotationAPI`
        """
        return self._backend.connect_to_api()

    def launch_editor(self):
        """Launches the Prodigy annotation interface and loads the project for this
        annotation run.
        """
        api = self.connect_to_api()
        project_id = self.project_id

        editor_url = api.editor_url(project_id)
        logger.info("Launching annotation interface at '%s'...", editor_url)
        api.launch_editor(url=editor_url)

    def get_status(self):
        """Gets the status of the annotation run.

        Returns:
            a dict of status information
        """
        return self._get_status()

    def print_status(self):
        """Prints the status of the annotation run."""
        self._get_status(log=True)

    def cleanup(self):
        """Deletes the project associated with this annotation run from the
        Prodigy server.
        """
        if self.project_id is not None:
            api = self.connect_to_api()
            api.delete_project(self.project_id)

        # @todo save updated results to DB?
        self.project_id = None

    def _get_status(self, log=False):
        api = self.connect_to_api()

        project = api.get_project(self.project_id)

        created_at = project.created_at
        updated_at = project.updated_at
        num_labeled_samples = len(list(project.labels()))
        members = list(project.members())
        positive = project.review_metrics(lbr.Review.NetScore.Positive)
        negative = project.review_metrics(lbr.Review.NetScore.Negative)
        zero = project.review_metrics(lbr.Review.NetScore.Zero)

        status = {
            "name": project.name,
            "id": project.uid,
            "created": created_at,
            "updated": updated_at,
            "num_labeled_samples": num_labeled_samples,
            "members": members,
            "review": {
                "positive": positive,
                "negative": negative,
                "zero": zero,
            },
        }

        if log:
            logger.info(
                "\nProject: %s\n"
                "ID: %s\n"
                "Created at: %s\n"
                "Updated at: %s\n"
                "Number of labeled samples: %d\n"
                "Members:\n",
                project.name,
                project.uid,
                str(created_at),
                str(updated_at),
                num_labeled_samples,
            )

            if not members:
                logger.info("\t-")

            for member in members:
                user = member.user()
                role = member.role()
                logger.info(
                    "\tUser: %s\n"
                    "\tName: %s\n"
                    "\tRole: %s\n"
                    "\tEmail: %s\n"
                    "\tID: %s\n",
                    user.name,
                    user.nickname,
                    role.name,
                    user.email,
                    user.uid,
                )

            logger.info(
                "\nReviews:\n"
                "\tPositive: %d\n"
                "\tNegative: %d\n"
                "\tZero: %d",
                positive,
                negative,
                zero,
            )

        return status

    @classmethod
    def _from_dict(cls, d, samples, config):
        return cls(
            samples,
            config,
            d["id_map"],
            d["project_id"],
            d["frame_id_map"],
        )


class ProdigyAnnotationAPI(foua.AnnotationAPI):
    """A class to facilitate connection to and management of projects in
    Labelbox.

    On initializiation, this class constructs a client based on the provided
    server url and credentials.

    This API provides methods to easily upload, download, create, and delete
    projects and data through the formatted urls specified by the Labelbox API.

    Additionally, samples and label schemas can be uploaded and annotations
    downloaded through this class.

    Args:
        name: the name of the backend
        url: url of the Labelbox server
        api_key (None): the Labelbox API key
    """

    def __init__(self, name, url, api_key=None, _experimental=False):
        if "://" not in url:
            protocol = "http"
            base_url = url
        else:
            protocol, base_url = url.split("://")

        self._name = name
        self._url = base_url
        self._protocol = protocol
        self._api_key = api_key
        self._experimental = _experimental
        self._roles = None
        self._tool_types_map = None

        self._setup()

    def _setup(self):
        if not self._url:
            raise ValueError(
                "You must provide/configure the `url` of the Labelbox server"
            )

        api_key = self._api_key

        if api_key is None:
            api_key = self._prompt_api_key(self._name)

        self._client = lb.client.Client(
            api_key=api_key,
            endpoint=self.base_graphql_url,
            enable_experimental=self._experimental,
        )

        self._tool_types_map = {
            "detections": lbo.Tool.Type.BBOX,
            "detection": lbo.Tool.Type.BBOX,
            "instance": lbo.Tool.Type.SEGMENTATION,
            "instances": lbo.Tool.Type.SEGMENTATION,
            "segmentation": lbo.Tool.Type.SEGMENTATION,
            "polyline": lbo.Tool.Type.LINE,
            "polylines": lbo.Tool.Type.LINE,
            "polygon": lbo.Tool.Type.POLYGON,
            "polygons": lbo.Tool.Type.POLYGON,
            "keypoint": lbo.Tool.Type.POINT,
            "keypoints": lbo.Tool.Type.POINT,
            "classification": lbo.Classification,
            "classifications": lbo.Classification,
            "scalar": lbo.Classification,
        }

    @property
    def roles(self):
        if self._roles is None:
            self._roles = self._client.get_roles()

        return self._roles

    @property
    def attr_type_map(self):
        return {
            "text": lbo.Classification.Type.TEXT,
            "select": lbo.Classification.Type.DROPDOWN,
            "radio": lbo.Classification.Type.RADIO,
            "checkbox": lbo.Classification.Type.CHECKLIST,
        }

    @property
    def attr_list_types(self):
        # Attribute types that return lists of values
        return ["checkbox"]

    @property
    def base_api_url(self):
        return "%s://api.%s" % (self._protocol, self._url)

    @property
    def base_graphql_url(self):
        return "%s/graphql" % self.base_api_url

    @property
    def projects_url(self):
        return "%s/projects" % self.base_api_url

    def project_url(self, project_id):
        return "%s/%s" % (self.projects_url, project_id)

    def editor_url(self, project_id):
        return "%s://editor.%s/?project=%s" % (
            self._protocol,
            self._url,
            project_id,
        )

    def get_project_users(self, project=None, project_id=None):
        """Returns a list of users that are assigned to the given project.

        Provide either ``project`` or ``project_id`` to this method.

        Args:
            project: a ``labelbox.schema.project.Project``
            project_id: the project ID

        Returns:
            a list of ``labelbox.schema.user.User`` objects
        """
        if project is None:
            if project_id is None:
                raise ValueError(
                    "Either `project` or `project_id` must be provided"
                )

            project = self.get_project(project_id)

        project_users = []
        project_id = project.uid
        users = list(project.organization().users())
        for user in users:
            if project in user.projects():
                project_users.append(user)

        return users

    def add_member(self, project, email, role):
        """Adds a member to the given Labelbox project with the given
        project-level role.

        If the user is not a member of the project's parent organization, an
        email invitivation will be sent.

        Args:
            project: the ``labelbox.schema.project.Project``
            email: the email of the user
            role: the role for the user. Supported values are
                ``["LABELER", "REVIEWER", "TEAM_MANAGER", "ADMIN"]``
        """
        if not self._experimental:
            raise ValueError(
                "This method can only be used if the `LabelboxAnnotationAPI` "
                "object was initialized with `_experimental=True`"
            )

        if role not in self.roles or role == "NONE":
            raise ValueError("Unsupported user role '%s'" % role)

        role_id = self.roles[role]
        organization = self._client.get_organization()

        existing_users = {u.email: u for u in organization.users()}
        if email in existing_users:
            user = existing_users[email]
            user.upsert_project_role(project, role_id)
            return

        limit = organization.invite_limit()
        if limit.remaining == 0:
            logger.warning(
                "Your organization has reached its limit of %d members. "
                "Cannot invite new member %s to project '%s'",
                limit.limit,
                email,
                project.name,
            )
            return

        project_role = lbs.organization.ProjectRole(
            project=project, role=role_id
        )

        organization.invite_user(
            email, self.roles["NONE"], project_roles=[project_role]
        )

    def list_datasets(self):
        """Retrieves the list of datasets in your Labelbox account.

        Returns:
            a list of dataset IDs
        """
        datasets = self._client.get_datasets()
        return [d.uid for d in datasets]

    def delete_datasets(self, dataset_ids):
        """Deletes the given datasets from the Labelbox server.

        Args:
            dataset_ids: an iterable of dataset IDs
        """
        logger.info("Deleting datasets...")
        with fou.ProgressBar() as pb:
            for dataset_id in pb(list(dataset_ids)):
                dataset = self._client.get_dataset(dataset_id)
                dataset.delete()

    def list_projects(self):
        """Retrieves the list of projects in your Labelbox account.

        Returns:
            a list of project IDs
        """
        projects = self._client.get_projects()
        return [p.uid for p in projects]

    def get_project(self, project_id):
        """Retrieves the ``labelbox.schema.project.Project`` for the project
        with the given ID.

        Args:
            project_id: the project ID

        Returns:
            a ``labelbox.schema.project.Project``
        """
        return self._client.get_project(project_id)

    def delete_project(self, project_id, delete_datasets=True):
        """Deletes the given project from the Labelbox server.

        Args:
            project_id: the project ID
            delete_datasets: whether to delete the attached datasets as well
        """
        project = self._client.get_project(project_id)

        logger.info("Deleting project '%s'...", project_id)

        if delete_datasets:
            for dataset in project.datasets():
                dataset.delete()

        project.delete()

    def delete_projects(self, project_ids, delete_datasets=True):
        """Deletes the given projects from the Labelbox server.

        Args:
            project_ids: an iterable of project IDs
            delete_datasets: whether to delete the attached datasets as well
        """
        for project_id in project_ids:
            self.delete_project(project_id, delete_datasets=delete_datasets)

    def launch_editor(self, url=None):
        """Launches the Labelbox editor in your default web browser.

        Args:
            url (None): an optional URL to open. By default, the base URL of
                the server is opened
        """
        if url is None:
            url = self.projects_url

        webbrowser.open(url, new=2)

    def upload_data(self, samples, lb_dataset, media_field="filepath"):
        """Uploads the media for the given samples to Labelbox.

        This method uses ``labelbox.schema.dataset.Dataset.create_data_rows()``
        to add data in batches, and sets the external ID of each DataRow to the
        ID of the corresponding sample.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection`
                containing the media to upload
            lb_dataset: a ``labelbox.schema.dataset.Dataset`` to which to
                add the media
            media_field ("filepath"): string field name containing the paths to
                media files on disk to upload
        """
        media_paths, sample_ids = samples.values([media_field, "id"])

        upload_info = []
        for media_path, sample_id in zip(media_paths, sample_ids):
            item_url = self._client.upload_file(media_path)
            upload_info.append(
                {
                    lb.DataRow.row_data: item_url,
                    lb.DataRow.external_id: sample_id,
                }
            )

        task = lb_dataset.create_data_rows(upload_info)
        task.wait_till_done()

    def upload_samples(self, samples, backend):
        """Uploads the given samples to Labelbox according to the given
        backend's annotation and server configuration.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection` to
                upload to CVAT
            backend: a :class:`LabelboxBackend` to use to perform the upload

        Returns:
            a :class:`LabelboxAnnotationResults`
        """
        config = backend.config
        label_schema = config.label_schema
        media_field = config.media_field
        project_name = config.project_name
        members = config.members
        classes_as_attrs = config.classes_as_attrs

        for label_field, label_info in label_schema.items():
            if label_info["existing_field"]:
                raise ValueError(
                    "Cannot use existing field '%s'; the Labelbox backend "
                    "does not yet support uploading existing labels"
                    % label_field
                )

        if project_name is None:
            _dataset_name = samples._root_dataset.name.replace(" ", "_")
            project_name = "FiftyOne_%s" % _dataset_name

        dataset = self._client.create_dataset(name=project_name)
        self.upload_data(samples, dataset, media_field=media_field)

        project = self._setup_project(
            project_name, dataset, label_schema, classes_as_attrs
        )

        if members:
            for email, role in members:
                self.add_member(project, email, role)

        project_id = project.uid
        id_map = {}
        frame_id_map = self._build_frame_id_map(samples)

        return LabelboxAnnotationResults(
            samples, config, id_map, project_id, frame_id_map, backend=backend
        )

    def download_annotations(self, results):
        """Download the annotations from the Labelbox server for the given
        results instance and parses them into the appropriate FiftyOne types.

        Args:
            results: a :class:`LabelboxAnnotationResults`

        Returns:
            the annotations dict
        """
        project_id = results.project_id
        frame_id_map = results.frame_id_map
        classes_as_attrs = results.config.classes_as_attrs
        label_schema = results.config.label_schema

        project = self._client.get_project(project_id)
        labels_json = self._download_project_labels(project=project)
        is_video = results._samples.media_type == fomm.VIDEO

        annotations = {}

        if classes_as_attrs:
            class_attr = "class_name"
        else:
            class_attr = False

        for d in labels_json:
            labelbox_id = d["DataRow ID"]
            sample_id = d["External ID"]

            if sample_id is None:
                logger.warning(
                    "Skipping DataRow '%s' with no sample ID", labelbox_id
                )
                continue

            metadata = self._get_sample_metadata(project, sample_id)
            if metadata is None:
                logger.warning(
                    "Skipping sample '%s' with no metadata", sample_id
                )
                continue

            frame_size = (metadata["width"], metadata["height"])

            if is_video:
                video_d_list = self._get_video_labels(d["Label"])
                frames = {}
                for label_d in video_d_list:
                    frame_number = label_d["frameNumber"]
                    frame_id = frame_id_map[sample_id][frame_number]
                    labels_dict = _parse_image_labels(
                        label_d, frame_size, class_attr=class_attr
                    )
                    if not classes_as_attrs:
                        labels_dict = self._process_label_fields(
                            label_schema, labels_dict
                        )
                    frames[frame_id] = labels_dict

                self._add_video_labels_to_results(
                    annotations,
                    frames,
                    sample_id,
                    label_schema,
                )

            else:
                labels_dict = _parse_image_labels(
                    d["Label"], frame_size, class_attr=class_attr
                )
                if not classes_as_attrs:
                    labels_dict = self._process_label_fields(
                        label_schema, labels_dict
                    )
                annotations = self._add_labels_to_results(
                    annotations,
                    labels_dict,
                    sample_id,
                    label_schema,
                )

        return annotations

    def _process_label_fields(self, label_schema, labels_dict):
        unexpected_types = [
            "segmentation",
            "detections",
            "keypoints",
            "polylines",
        ]
        field_map = {}
        for label_field, label_info in label_schema.items():
            label_type = label_info["type"]
            mapped_type = _UNIQUE_TYPE_MAP.get(label_type, label_type)
            field_map[mapped_type] = label_field

        _labels_dict = {}
        for field_or_type, label_info in labels_dict.items():
            if field_or_type in unexpected_types:
                # field_or_type is type
                # label_info is labels
                label_field = field_map[field_or_type]
                _labels_dict[label_field] = {}
                if field_or_type in label_info:
                    label_info = label_info[field_or_type]
                _labels_dict[label_field][field_or_type] = label_info
            else:
                # field_or_type is field
                # label_info is {type: labels}
                _labels_dict[field_or_type] = label_info

        return _labels_dict

    def _build_frame_id_map(self, samples):
        if samples.media_type != fomm.VIDEO:
            return {}

        samples.ensure_frames()
        sample_ids, frame_numbers, frame_ids = samples.values(
            ["id", "frames.frame_number", "frames.id"]
        )

        frame_id_map = {}
        for sample_id, fns, fids in zip(sample_ids, frame_numbers, frame_ids):
            frame_id_map[sample_id] = {fn: fid for fn, fid in zip(fns, fids)}

        return frame_id_map

    def _setup_project(
        self, project_name, dataset, label_schema, classes_as_attrs
    ):
        project = self._client.create_project(name=project_name)
        project.datasets.connect(dataset)

        self._setup_editor(project, label_schema, classes_as_attrs)

        if project.setup_complete is None:
            raise ValueError(
                "Failed to create Labelbox project '%s'" % project_name
            )

        return project

    def _setup_editor(self, project, label_schema, classes_as_attrs):
        editor = next(
            self._client.get_labeling_frontends(
                where=lb.LabelingFrontend.name == "Editor"
            )
        )

        tools = []
        classifications = []
        label_types = {}

        _multiple_types = ["scalar", "classification", "classifications"]

        for label_field, label_info in label_schema.items():
            label_type = label_info["type"]
            if label_type not in _multiple_types:
                unique_label_type = _UNIQUE_TYPE_MAP.get(
                    label_type, label_type
                )
                if unique_label_type in label_types and not classes_as_attrs:
                    raise ValueError(
                        "Only one field of each label type is allowed when "
                        "`classes_as_attrs=False`; but found fields '%s' and "
                        "'%s' of type '%s'"
                        % (label_field, label_types[label_type], label_type)
                    )

                label_types[unique_label_type] = label_field

            field_tools, field_classifications = self._create_ontology_tools(
                label_info, label_field, classes_as_attrs
            )
            tools.extend(field_tools)
            classifications.extend(field_classifications)

        ontology_builder = lbo.OntologyBuilder(
            tools=tools, classifications=classifications
        )
        project.setup(editor, ontology_builder.asdict())

    def _create_ontology_tools(
        self, label_info, label_field, classes_as_attrs
    ):
        label_type = label_info["type"]
        classes = label_info["classes"]
        attr_schema = label_info["attributes"]
        general_attrs = self._build_attributes(attr_schema)

        if label_type in ["scalar", "classification", "classifications"]:
            tools = []
            classifications = self._build_classifications(
                classes, label_field, general_attrs, label_type, label_field
            )
        else:
            tools = self._build_tools(
                classes,
                label_field,
                label_type,
                general_attrs,
                classes_as_attrs,
            )
            classifications = []

        return tools, classifications

    def _build_attributes(self, attr_schema):
        attributes = []
        for attr_name, attr_info in attr_schema.items():
            attr_type = attr_info["type"]
            class_type = self.attr_type_map[attr_type]
            if attr_type == "text":
                attr = lbo.Classification(
                    class_type=class_type,
                    instructions=attr_name,
                )
            else:
                attr_values = attr_info["values"]
                options = [lbo.Option(value=str(v)) for v in attr_values]
                attr = lbo.Classification(
                    class_type=class_type,
                    instructions=attr_name,
                    options=options,
                )

            attributes.append(attr)

        return attributes

    def _build_classifications(
        self, classes, name, general_attrs, label_type, label_field
    ):
        """Returns the classifications for the given label field. Generally,
        the classification is a dropdown selection for given classes, but can
        be a text entry for scalars without provided classes.

        Attributes are available for Classification and Classifications types
        in nested dropdowns.
        """
        classifications = []
        options = []
        for c in classes:
            if isinstance(c, dict):
                sub_classes = c["classes"]
                attrs = self._build_attributes(c["attributes"]) + general_attrs
            else:
                sub_classes = [c]
                attrs = general_attrs

            if label_type == "scalar":
                # Scalar fields cannot have attributes
                attrs = []

            for sc in sub_classes:
                if label_type == "scalar":
                    sub_attrs = attrs
                else:
                    # Multiple copies of attributes for different classes can
                    # get confusing, prefix each attribute with the label field
                    # and class name
                    prefix = "field:%s_class:%s_attr:" % (label_field, str(sc))
                    sub_attrs = deepcopy(attrs)
                    for attr in sub_attrs:
                        attr.instructions = prefix + attr.instructions

                options.append(lbo.Option(value=str(sc), options=sub_attrs))

        if label_type == "scalar" and not classes:
            classification = lbo.Classification(
                class_type=lbo.Classification.Type.TEXT,
                instructions=name,
            )
            classifications.append(classification)
        elif label_type == "classifications":
            classification = lbo.Classification(
                class_type=lbo.Classification.Type.CHECKLIST,
                instructions=name,
                options=options,
            )
            classifications.append(classification)
        else:
            classification = lbo.Classification(
                class_type=lbo.Classification.Type.RADIO,
                instructions=name,
                options=options,
            )
            classifications.append(classification)

        return classifications

    def _build_tools(
        self, classes, label_field, label_type, general_attrs, classes_as_attrs
    ):
        tools = []

        if classes_as_attrs:
            tool_type = self._tool_types_map[label_type]
            attributes = self._create_classes_as_attrs(classes, general_attrs)
            tools.append(
                lbo.Tool(
                    name=label_field,
                    tool=tool_type,
                    classifications=attributes,
                )
            )
        else:
            for c in classes:
                if isinstance(c, dict):
                    subset_classes = c["classes"]
                    subset_attr_schema = c["attributes"]
                    subset_attrs = self._build_attributes(subset_attr_schema)
                    all_attrs = general_attrs + subset_attrs
                    for sc in subset_classes:
                        tool = self._build_tool_for_class(
                            sc, label_type, all_attrs
                        )
                        tools.append(tool)
                else:
                    tool = self._build_tool_for_class(
                        c, label_type, general_attrs
                    )
                    tools.append(tool)

        return tools

    def _build_tool_for_class(self, class_name, label_type, attributes):
        tool_type = self._tool_types_map[label_type]
        return lbo.Tool(
            name=str(class_name),
            tool=tool_type,
            classifications=attributes,
        )

    def _create_classes_as_attrs(self, classes, general_attrs):
        """Creates radio attributes for all classes and formats all
        class-specific attributes.
        """
        options = []
        for c in classes:
            if isinstance(c, dict):
                subset_attrs = self._build_attributes(c["attributes"])
                for sc in c["classes"]:
                    options.append(
                        lbo.Option(value=str(sc), options=subset_attrs)
                    )
            else:
                options.append(lbo.Option(value=str(c)))

        classes_attr = lbo.Classification(
            class_type=lbo.Classification.Type.RADIO,
            instructions="class_name",
            options=options,
            required=True,
        )

        return [classes_attr] + general_attrs

    def _get_sample_metadata(self, project, sample_id):
        metadata = None
        for dataset in project.datasets():
            try:
                data_row = dataset.data_row_for_external_id(sample_id)
                metadata = data_row.media_attributes
            except lb.exceptions.ResourceNotFoundError:
                pass

        return metadata

    def _get_video_labels(self, label_dict):
        url = label_dict["frames"]
        headers = {"Authorization": "Bearer %s" % self._api_key}
        response = requests.get(url, headers=headers)
        return ndjson.loads(response.text)

    def _download_project_labels(self, project_id=None, project=None):
        if project is None:
            if project_id is None:
                raise ValueError(
                    "Either `project_id` or `project` must be provided"
                )

            project = self._client.get_project(project_id)

        return download_labels_from_labelbox(project)

    def _add_labels_to_results(
        self,
        results,
        labels_dict,
        sample_id,
        label_schema,
    ):
        """Adds the labels in ``labels_dict`` to ``results``.

        results::

            <label_field>: {
                <label_type>: {
                    <sample_id>: {
                        <label_id>:
                            <fo.Label> or <label - for scalars>
                    }
                }
            }

        labels_dict::

            {
                <label_field>: {
                    <label_type>: [<fo.Label>, ...]
                }
            }
        """
        # Parse all classification attributes first
        attributes = self._gather_classification_attributes(
            labels_dict, label_schema
        )

        # Parse remaining label fields and add classification attributes if
        # necessary
        results = self._parse_expected_label_fields(
            results,
            labels_dict,
            sample_id,
            label_schema,
            attributes,
        )

        return results

    def _add_video_labels_to_results(
        self,
        results,
        frames_dict,
        sample_id,
        label_schema,
    ):
        """Adds the video labels in ``frames_dict`` to ``results``.

        results::

            <label_field>: {
                <label_type>: {
                    <sample_id>: {
                        <frame_id>: {
                            <label_id>: <fo.Label>
                        }
                        or <label - for scalars>
                    }
                }
            }

        frames_dict::

            {
                <frame_id>: {
                    <label_field>: {
                        <label_type>: [<fo.Label>, ...]
                    }
                }
            }
        """
        for frame_id, labels_dict in frames_dict.items():
            # Parse all classification attributes first
            attributes = self._gather_classification_attributes(
                labels_dict, label_schema
            )

            # Parse remaining label fields and add classification attributes if
            # necessary
            results = self._parse_expected_label_fields(
                results,
                labels_dict,
                sample_id,
                label_schema,
                attributes,
                frame_id=frame_id,
            )

        return results

    def _gather_classification_attributes(self, labels_dict, label_schema):
        attributes = {}
        for label_field, labels in labels_dict.items():
            if label_field not in label_schema:
                if (
                    "field:" not in label_field
                    or "_class:" not in label_field
                    or "_attr:" not in label_field
                ):
                    logger.warning(
                        "Ignoring invalid classification label field '%s'",
                        label_field,
                    )
                    continue

                label_field, substr = label_field.replace("field:", "").split(
                    "_class:"
                )
                class_name, attr_name = substr.split("_attr:")

                if isinstance(labels, fol.Classification):
                    val = _parse_attribute(labels.label)
                elif isinstance(labels, fol.Classifications):
                    attr_type = _get_attr_type(
                        label_schema,
                        label_field,
                        attr_name,
                        class_name=class_name,
                    )
                    val = [
                        _parse_attribute(c.label)
                        for c in labels.classifications
                    ]
                    if attr_type not in self.attr_list_types:
                        if val:
                            val = val[0]
                        else:
                            val = None
                else:
                    logger.warning(
                        "Ignoring invalid label of type %s in label field "
                        "'%s'. Expected a %s or %s"
                        % (
                            type(labels),
                            label_field,
                            fol.Classification,
                            fol.Classifications,
                        )
                    )
                    continue

                if label_field not in attributes:
                    attributes[label_field] = {}

                if class_name not in attributes[label_field]:
                    attributes[label_field][class_name] = {}

                attributes[label_field][class_name][attr_name] = val

        return attributes

    def _parse_expected_label_fields(
        self,
        results,
        labels_dict,
        sample_id,
        label_schema,
        attributes,
        frame_id=None,
    ):
        for label_field, labels in labels_dict.items():
            if label_field in label_schema:
                label_info = label_schema[label_field]
                mask_targets = label_info.get("mask_targets", None)
                expected_type = label_info["type"]
                if isinstance(labels, dict):
                    # Object labels
                    label_results = self._convert_label_types(
                        labels,
                        expected_type,
                        sample_id,
                        frame_id=frame_id,
                        mask_targets=mask_targets,
                    )
                else:
                    # Classifications and scalar labels
                    label_info = label_schema[label_field]
                    expected_type = label_info["type"]
                    if expected_type == "classifications":
                        # Update attributes
                        if label_field in attributes:
                            for c in labels.classifications:
                                class_name = str(c.label)
                                if class_name in attributes[label_field]:
                                    for attr_name, attr_val in attributes[
                                        label_field
                                    ][class_name].items():
                                        c[attr_name] = attr_val

                        result_type = "classifications"
                        sample_results = {
                            c.id: c for c in labels.classifications
                        }
                    elif expected_type == "classification":
                        # Update attributes
                        if label_field in attributes:
                            class_name = str(labels.label)
                            if class_name in attributes[label_field]:
                                for attr_name, attr_val in attributes[
                                    label_field
                                ][class_name].items():
                                    labels[attr_name] = attr_val

                        result_type = "classifications"
                        sample_results = {labels.id: labels}
                    else:
                        # Scalar
                        result_type = "scalar"
                        sample_results = _parse_attribute(labels.label)

                    if frame_id is not None:
                        sample_results = {frame_id: sample_results}

                    label_results = {result_type: {sample_id: sample_results}}

                label_results = {label_field: label_results}
                results = self._merge_results(results, label_results)

        return results

    def _convert_label_types(
        self,
        labels_dict,
        expected_type,
        sample_id,
        frame_id=None,
        mask_targets=None,
    ):
        output_labels = {}
        for lb_type, labels_list in labels_dict.items():
            if lb_type == "detections":
                fo_type = "detections"

            if lb_type == "keypoints":
                fo_type = "keypoints"

            if lb_type == "polylines":
                if expected_type in ["detections", "instances"]:
                    fo_type = "detections"
                elif expected_type == "segmentation":
                    fo_type = "segmentation"
                else:
                    fo_type = "polylines"

            if lb_type == "segmentation":
                if expected_type == "segmentation":
                    fo_type = "segmentation"
                else:
                    fo_type = "detections"

                labels_list = self._convert_segmentations(
                    labels_list, fo_type, mask_targets=mask_targets
                )

            if fo_type not in output_labels:
                output_labels[fo_type] = {}

            if sample_id not in output_labels[fo_type]:
                output_labels[fo_type][sample_id] = {}

            if labels_list:
                if frame_id is not None:
                    if frame_id not in output_labels[fo_type][sample_id]:
                        output_labels[fo_type][sample_id][frame_id] = {}

            for label in labels_list:
                if frame_id is not None:
                    output_labels[fo_type][sample_id][frame_id][
                        label.id
                    ] = label
                else:
                    output_labels[fo_type][sample_id][label.id] = label

        return output_labels

    def _convert_segmentations(
        self, labels_list, label_type, mask_targets=None
    ):
        labels = []
        for seg_dict in labels_list:
            mask = seg_dict["mask"]
            label = str(seg_dict["label"])
            attrs = seg_dict["attributes"]
            labels.append(fol.Detection.from_mask(mask, label, **attrs))

        if label_type != "segmentation":
            return labels

        frame_size = (mask.shape[1], mask.shape[0])
        detections = fol.Detections(detections=labels)
        segmentation = detections.to_segmentation(
            frame_size=frame_size, mask_targets=mask_targets
        )
        return [segmentation]

    def _merge_results(self, results, new_results):
        if isinstance(new_results, dict):
            for key, val in new_results.items():
                if key not in results:
                    results[key] = val
                else:
                    results[key] = self._merge_results(results[key], val)

        return results
