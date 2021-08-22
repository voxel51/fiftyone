"""
Utilities for working with datasets in
`CVAT format <https://github.com/opencv/cvat>`_.

| Copyright 2017-2021, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from bson import ObjectId
from collections import defaultdict
from copy import copy
from copy import deepcopy
from datetime import datetime
import itertools
import logging
import os
import requests
import urllib3
import warnings
import webbrowser

import jinja2
import numpy as np

import eta.core.data as etad
import eta.core.image as etai
import eta.core.utils as etau

import fiftyone.constants as foc
import fiftyone.core.fields as fof
import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
import fiftyone.core.utils as fou
import fiftyone.utils.annotations as foua
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class CVATImageDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for CVAT image datasets stored on disk.

    See :ref:`this page <CVATImageDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.xml"`` specifying the location of the
                labels in ``dataset_dir``
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels.xml``
        include_all_data (False): whether to generate samples for all images in
            the data directory (True) rather than only creating samples for
            images with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.xml",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.include_all_data = include_all_data

        self._info = None
        self._image_paths_map = None
        self._cvat_images_map = None
        self._filenames = None
        self._iter_filenames = None
        self._num_samples = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.isabs(filename):
            image_path = filename
        else:
            image_path = self._image_paths_map[filename]

        cvat_image = self._cvat_images_map.get(filename, None)
        if cvat_image is not None:
            # Labeled image
            image_metadata = cvat_image.get_image_metadata()
            labels = cvat_image.to_labels()
        else:
            # Unlabeled image
            image_metadata = fomt.ImageMetadata.build_for(image_path)
            labels = None

        return image_path, image_metadata, labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._image_paths_map = self._load_data_map(
            self.data_path, recursive=True
        )

        if self.labels_path is not None and os.path.isfile(self.labels_path):
            info, _, cvat_images = load_cvat_image_annotations(
                self.labels_path
            )
        else:
            info = {}
            cvat_images = []

        self._info = info
        self._cvat_images_map = {i.name: i for i in cvat_images}

        filenames = set(self._cvat_images_map.keys())

        if self.include_all_data:
            filenames.update(self._image_paths_map.keys())

        self._filenames = self._preprocess_list(sorted(filenames))
        self._num_samples = len(self._filenames)

    def get_dataset_info(self):
        return self._info


class CVATVideoDatasetImporter(
    foud.LabeledVideoDatasetImporter, foud.ImportPathsMixin
):
    """Importer for CVAT video datasets stored on disk.

    See :ref:`this page <CVATVideoDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory
        data_path (None): an optional parameter that enables explicit control
            over the location of the media. Can be any of the following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``dataset_dir`` where the media files reside
            -   an absolute directory path where the media files reside. In
                this case, the ``dataset_dir`` has no effect on the location of
                the data
            -   a filename like ``"data.json"`` specifying the filename of the
                JSON data manifest file in ``dataset_dir``
            -   an absolute filepath specifying the location of the JSON data
                manifest. In this case, ``dataset_dir`` has no effect on the
                location of the data

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location of the labels in ``dataset_dir``
            -   an absolute folder path to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to ``labels/``
        include_all_data (False): whether to generate samples for all videos in
            the data directory (True) rather than only creating samples for
            videos with label entries (False)
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        include_all_data=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        data_path = self._parse_data_path(
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
        )

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self.include_all_data = include_all_data

        self._info = None
        self._cvat_task_labels = None
        self._video_paths_map = None
        self._labels_paths_map = None
        self._uuids = None
        self._iter_uuids = None
        self._num_samples = None

    def __iter__(self):
        self._iter_uuids = iter(self._uuids)
        return self

    def __len__(self):
        return self._num_samples

    def __next__(self):
        uuid = next(self._iter_uuids)

        video_path = self._video_paths_map[uuid]

        labels_path = self._labels_paths_map.get(uuid, None)
        if labels_path:
            # Labeled video
            info, cvat_task_labels, cvat_tracks = load_cvat_video_annotations(
                labels_path
            )

            if self._info is None:
                self._info = info

            self._cvat_task_labels.merge_task_labels(cvat_task_labels)
            self._info["task_labels"] = self._cvat_task_labels.labels

            frames = _cvat_tracks_to_frames_dict(cvat_tracks)
        else:
            # Unlabeled video
            frames = None

        return video_path, None, None, frames

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_video_metadata(self):
        return False  # has (width, height) but not other important info

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        if self.labels_path is not None and os.path.isdir(self.labels_path):
            self._labels_paths_map = {
                os.path.splitext(p)[0]: os.path.join(self.labels_path, p)
                for p in etau.list_files(self.labels_path, recursive=True)
            }
        else:
            self._labels_paths_map = {}

        uuids = set(self._labels_paths_map.keys())

        if self.include_all_data:
            uuids.update(self._video_paths_map.keys())

        self._info = None
        self._uuids = self._preprocess_list(sorted(uuids))
        self._num_samples = len(self._uuids)
        self._cvat_task_labels = CVATTaskLabels()

    def get_dataset_info(self):
        return self._info


class CVATImageDatasetExporter(
    foud.LabeledImageDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes CVAT image datasets to disk.

    See :ref:`this page <CVATImageDataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a filename like ``"labels.xml"`` specifying the location in
                ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default filename
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
        image_format=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir,
            labels_path=labels_path,
            default="labels.xml",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media
        self.image_format = image_format

        self._name = None
        self._task_labels = None
        self._cvat_images = None
        self._media_exporter = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._cvat_images = []
        self._media_exporter = foud.ImageExporter(
            self.export_media,
            export_path=self.data_path,
            default_ext=self.image_format,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._name = sample_collection.name
        self._task_labels = sample_collection.info.get("task_labels", None)

    def export_sample(self, image_or_path, labels, metadata=None):
        _, uuid = self._media_exporter.export(image_or_path)

        if labels is None:
            return  # unlabeled

        if not isinstance(labels, dict):
            labels = {"labels": labels}

        if all(v is None for v in labels.values()):
            return  # unlabeled

        if metadata is None:
            metadata = fomt.ImageMetadata.build_for(image_or_path)

        cvat_image = CVATImage.from_labels(labels, metadata)

        cvat_image.id = len(self._cvat_images)
        cvat_image.name = uuid

        self._cvat_images.append(cvat_image)

    def close(self, *args):
        # Get task labels
        if self._task_labels is None:
            # Compute task labels from active label schema
            cvat_task_labels = CVATTaskLabels.from_cvat_images(
                self._cvat_images
            )
        else:
            # Use task labels from logged collection info
            cvat_task_labels = CVATTaskLabels(labels=self._task_labels)

        # Write annotations
        writer = CVATImageAnnotationWriter()
        writer.write(
            cvat_task_labels,
            self._cvat_images,
            self.labels_path,
            id=0,
            name=self._name,
        )

        self._media_exporter.close()


class CVATVideoDatasetExporter(
    foud.LabeledVideoDatasetExporter, foud.ExportPathsMixin
):
    """Exporter that writes CVAT video datasets to disk.

    See :ref:`this page <CVATVideoDataset-export>` for format details.

    Args:
        export_dir (None): the directory to write the export. This has no
            effect if ``data_path`` and ``labels_path`` are absolute paths
        data_path (None): an optional parameter that enables explicit control
            over the location of the exported media. Can be any of the
            following:

            -   a folder name like ``"data"`` or ``"data/"`` specifying a
                subfolder of ``export_dir`` in which to export the media
            -   an absolute directory path in which to export the media. In
                this case, the ``export_dir`` has no effect on the location of
                the data
            -   a JSON filename like ``"data.json"`` specifying the filename of
                the manifest file in ``export_dir`` generated when
                ``export_media`` is ``"manifest"``
            -   an absolute filepath specifying the location to write the JSON
                manifest file when ``export_media`` is ``"manifest"``. In this
                case, ``export_dir`` has no effect on the location of the data

            If None, the default value of this parameter will be chosen based
            on the value of the ``export_media`` parameter
        labels_path (None): an optional parameter that enables explicit control
            over the location of the exported labels. Can be any of the
            following:

            -   a folder name like ``"labels"`` or ``"labels/"`` specifying the
                location in ``export_dir`` in which to export the labels
            -   an absolute filepath to which to export the labels. In this
                case, the ``export_dir`` has no effect on the location of the
                labels

            If None, the labels will be exported into ``export_dir`` using the
            default folder name
        export_media (None): controls how to export the raw media. The
            supported values are:

            -   ``True``: copy all media files into the output directory
            -   ``False``: don't export media
            -   ``"move"``: move all media files into the output directory
            -   ``"symlink"``: create symlinks to the media files in the output
                directory
            -   ``"manifest"``: create a ``data.json`` in the output directory
                that maps UUIDs used in the labels files to the filepaths of
                the source media, rather than exporting the actual media

            If None, the default value of this parameter will be chosen based
            on the value of the ``data_path`` parameter
    """

    def __init__(
        self,
        export_dir=None,
        data_path=None,
        labels_path=None,
        export_media=None,
    ):
        data_path, export_media = self._parse_data_path(
            export_dir=export_dir,
            data_path=data_path,
            export_media=export_media,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            export_dir=export_dir, labels_path=labels_path, default="labels/",
        )

        super().__init__(export_dir=export_dir)

        self.data_path = data_path
        self.labels_path = labels_path
        self.export_media = export_media

        self._task_labels = None
        self._num_samples = 0
        self._writer = None
        self._media_exporter = None

    @property
    def requires_video_metadata(self):
        return True

    @property
    def label_cls(self):
        return None

    @property
    def frame_labels_cls(self):
        return {
            "detections": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

    def setup(self):
        self._writer = CVATVideoAnnotationWriter()
        self._media_exporter = foud.ImageExporter(
            self.export_media, export_path=self.data_path,
        )
        self._media_exporter.setup()

    def log_collection(self, sample_collection):
        self._task_labels = sample_collection.info.get("task_labels", None)

    def export_sample(self, video_path, _, frames, metadata=None):
        _, filename = self._media_exporter.export(video_path)

        if frames is None:
            return  # unlabeled

        if metadata is None:
            metadata = fomt.VideoMetadata.build_for(video_path)

        out_anno_path = os.path.join(
            self.labels_path, os.path.splitext(filename)[0] + ".xml"
        )

        # Generate object tracks
        frame_size = (metadata.frame_width, metadata.frame_height)
        cvat_tracks = _frames_to_cvat_tracks(frames, frame_size)

        if cvat_tracks is None:
            return  # unlabeled

        # Get task labels
        if self._task_labels is None:
            # Compute task labels from active label schema
            cvat_task_labels = CVATTaskLabels.from_cvat_tracks(cvat_tracks)
        else:
            # Use task labels from logged collection info
            cvat_task_labels = CVATTaskLabels(labels=self._task_labels)

        # Write annotations
        self._num_samples += 1
        self._writer.write(
            cvat_task_labels,
            cvat_tracks,
            metadata,
            out_anno_path,
            id=self._num_samples - 1,
            name=filename,
        )

    def close(self, *args):
        self._media_exporter.close()


class CVATTaskLabels(object):
    """Description of the labels in a CVAT image annotation task.

    Args:
        labels (None): a list of label dicts in the following format::

            [
                {
                    "name": "car",
                    "attributes": [
                        {
                            "name": "type"
                            "categories": ["coupe", "sedan", "truck"]
                        },
                        ...
                    }
                },
                ...
            ]
    """

    def __init__(self, labels=None):
        self.labels = labels or []

    def merge_task_labels(self, task_labels):
        """Merges the given :class:`CVATTaskLabels` into this instance.

        Args:
            task_labels: a :class:`CVATTaskLabels`
        """
        schema = self.to_schema()
        schema.merge_schema(task_labels.to_schema())
        new_task_labels = CVATTaskLabels.from_schema(schema)
        self.labels = new_task_labels.labels

    def to_schema(self):
        """Returns an ``eta.core.image.ImageLabelsSchema`` representation of
        the task labels.

        Note that CVAT's task labels schema does not distinguish between boxes,
        polylines, and keypoints, so the returned schema stores all annotations
        under the ``"objects"`` field.

        Returns:
            an ``eta.core.image.ImageLabelsSchema``
        """
        schema = etai.ImageLabelsSchema()

        for label in self.labels:
            _label = label["name"]
            schema.add_object_label(_label)
            for attribute in label.get("attributes", []):
                _name = attribute["name"]
                _categories = attribute["categories"]
                for _value in _categories:
                    _attr = etad.CategoricalAttribute(_name, _value)
                    schema.add_object_attribute(_label, _attr)

        return schema

    @classmethod
    def from_cvat_images(cls, cvat_images):
        """Creates a :class:`CVATTaskLabels` instance that describes the active
        schema of the given annotations.

        Args:
            cvat_images: a list of :class:`CVATImage` instances

        Returns:
            a :class:`CVATTaskLabels`
        """
        schema = etai.ImageLabelsSchema()
        for cvat_image in cvat_images:
            for anno in cvat_image.iter_annos():
                _label = anno.label
                schema.add_object_label(_label)

                if anno.occluded is not None:
                    _attr = etad.BooleanAttribute("occluded", anno.occluded)
                    schema.add_object_attribute(_label, _attr)

                for attr in anno.attributes:
                    _attr = attr.to_eta_attribute()
                    schema.add_object_attribute(_label, _attr)

        return cls.from_schema(schema)

    @classmethod
    def from_cvat_tracks(cls, cvat_tracks):
        """Creates a :class:`CVATTaskLabels` instance that describes the active
        schema of the given annotations.

        Args:
            cvat_tracks: a list of :class:`CVATTrack` instances

        Returns:
            a :class:`CVATTaskLabels`
        """
        schema = etai.ImageLabelsSchema()
        for cvat_track in cvat_tracks:
            for anno in cvat_track.iter_annos():
                _label = anno.label
                schema.add_object_label(_label)

                if anno.outside is not None:
                    _attr = etad.BooleanAttribute("outside", anno.outside)
                    schema.add_object_attribute(_label, _attr)

                if anno.occluded is not None:
                    _attr = etad.BooleanAttribute("occluded", anno.occluded)
                    schema.add_object_attribute(_label, _attr)

                if anno.keyframe is not None:
                    _attr = etad.BooleanAttribute("keyframe", anno.keyframe)
                    schema.add_object_attribute(_label, _attr)

                for attr in anno.attributes:
                    _attr = attr.to_eta_attribute()
                    schema.add_object_attribute(_label, _attr)

        return cls.from_schema(schema)

    @classmethod
    def from_labels_dict(cls, d):
        """Creates a :class:`CVATTaskLabels` instance from the ``<labels>``
        tag of a CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<labels>`` tag

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = _ensure_list(d.get("label", []))
        _labels = []
        for label in labels:
            _tmp = label.get("attributes", None) or {}
            attributes = _ensure_list(_tmp.get("attribute", []))
            _attributes = []
            for attribute in attributes:
                _attributes.append(
                    {
                        "name": attribute["name"],
                        "categories": attribute["values"].split("\n"),
                    }
                )

            _labels.append({"name": label["name"], "attributes": _attributes})

        return cls(labels=_labels)

    @classmethod
    def from_schema(cls, schema):
        """Creates a :class:`CVATTaskLabels` instance from an
        ``eta.core.image.ImageLabelsSchema``.

        Args:
            schema: an ``eta.core.image.ImageLabelsSchema``

        Returns:
            a :class:`CVATTaskLabels`
        """
        labels = []
        obj_schemas = schema.objects
        for label in sorted(obj_schemas.schema):
            obj_schema = obj_schemas.schema[label]
            obj_attr_schemas = obj_schema.attrs
            attributes = []
            for name in sorted(obj_attr_schemas.schema):
                attr_schema = obj_attr_schemas.schema[name]
                if isinstance(attr_schema, etad.CategoricalAttributeSchema):
                    attributes.append(
                        {
                            "name": name,
                            "categories": sorted(attr_schema.categories),
                        }
                    )

            labels.append({"name": label, "attributes": attributes})

        return cls(labels=labels)


class CVATImage(object):
    """An annotated image in CVAT image format.

    Args:
        id: the ID of the image
        name: the filename of the image
        width: the width of the image, in pixels
        height: the height of the image, in pixels
        boxes (None): a list of :class:`CVATImageBox` instances
        polygons (None): a list of :class:`CVATImagePolygon` instances
        polylines (None): a list of :class:`CVATImagePolyline` instances
        points (None): a list of :class:`CVATImagePoints` instances
    """

    def __init__(
        self,
        id,
        name,
        width,
        height,
        boxes=None,
        polygons=None,
        polylines=None,
        points=None,
    ):
        self.id = id
        self.name = name
        self.width = width
        self.height = height
        self.boxes = boxes or []
        self.polygons = polygons or []
        self.polylines = polylines or []
        self.points = points or []

    @property
    def has_boxes(self):
        """Whether this image has 2D boxes."""
        return bool(self.boxes)

    @property
    def has_polylines(self):
        """Whether this image has polygons or polylines."""
        return bool(self.polygons) or bool(self.polylines)

    @property
    def has_points(self):
        """Whether this image has keypoints."""
        return bool(self.points)

    def iter_annos(self):
        """Returns an iterator over the annotations in the image.

        Returns:
            an iterator that emits :class:`CVATImageAnno` instances
        """
        return itertools.chain(
            self.boxes, self.polygons, self.polylines, self.points
        )

    def get_image_metadata(self):
        """Returns a :class:`fiftyone.core.metadata.ImageMetadata` instance for
        the annotations.

        Returns:
            a :class:`fiftyone.core.metadata.ImageMetadata`
        """
        return fomt.ImageMetadata(width=self.width, height=self.height)

    def to_labels(self):
        """Returns :class:`fiftyone.core.labels.ImageLabel` representations of
        the annotations.

        Returns:
            a dictionary mapping field keys to
            :class:`fiftyone.core.labels.ImageLabel` containers
        """
        frame_size = (self.width, self.height)

        labels = {}

        if self.boxes:
            detections = [b.to_detection(frame_size) for b in self.boxes]
            labels["detections"] = fol.Detections(detections=detections)

        if self.polygons or self.polylines:
            polygons = [p.to_polyline(frame_size) for p in self.polygons]
            polylines = [p.to_polyline(frame_size) for p in self.polylines]
            labels["polylines"] = fol.Polylines(polylines=polygons + polylines)

        if self.points:
            keypoints = [k.to_keypoint(frame_size) for k in self.points]
            labels["keypoints"] = fol.Keypoints(keypoints=keypoints)

        return labels

    @classmethod
    def from_labels(cls, labels, metadata):
        """Creates a :class:`CVATImage` from a dictionary of labels.

        Args:
            labels: a dictionary mapping keys to
                :class:`fiftyone.core.labels.ImageLabel` containers
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImage`
        """
        width = metadata.width
        height = metadata.height

        _detections = []
        _polygons = []
        _polylines = []
        _keypoints = []
        for _labels in labels.values():
            if isinstance(_labels, fol.Detection):
                _detections.append(_labels)
            elif isinstance(_labels, fol.Detections):
                _detections.extend(_labels.detections)
            elif isinstance(_labels, fol.Polyline):
                if _labels.closed:
                    _polygons.append(_labels)
                else:
                    _polylines.append(_labels)
            elif isinstance(_labels, fol.Polylines):
                for poly in _labels.polylines:
                    if poly.closed:
                        _polygons.append(poly)
                    else:
                        _polylines.append(poly)
            elif isinstance(_labels, fol.Keypoint):
                _keypoints.append(_labels)
            elif isinstance(_labels, fol.Keypoints):
                _keypoints.extend(_labels.keypoints)
            elif _labels is not None:
                msg = (
                    "Ignoring unsupported label type '%s'" % _labels.__class__
                )
                warnings.warn(msg)

        boxes = [CVATImageBox.from_detection(d, metadata) for d in _detections]

        polygons = []
        for p in _polygons:
            polygons.extend(CVATImagePolygon.from_polyline(p, metadata))

        polylines = []
        for p in _polylines:
            polylines.extend(CVATImagePolyline.from_polyline(p, metadata))

        points = [
            CVATImagePoints.from_keypoint(k, metadata) for k in _keypoints
        ]

        return cls(
            None,
            None,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )

    @classmethod
    def from_image_dict(cls, d):
        """Creates a :class:`CVATImage` from an ``<image>`` tag of a CVAT image
        annotations XML file.

        Args:
            d: a dict representation of an ``<image>`` tag

        Returns:
            a :class:`CVATImage`
        """
        id = d["@id"]
        name = d["@name"]
        width = int(d["@width"])
        height = int(d["@height"])

        boxes = []
        for bd in _ensure_list(d.get("box", [])):
            boxes.append(CVATImageBox.from_box_dict(bd))

        polygons = []
        for pd in _ensure_list(d.get("polygon", [])):
            polygons.append(CVATImagePolygon.from_polygon_dict(pd))

        polylines = []
        for pd in _ensure_list(d.get("polyline", [])):
            polylines.append(CVATImagePolyline.from_polyline_dict(pd))

        points = []
        for pd in _ensure_list(d.get("points", [])):
            points.append(CVATImagePoints.from_points_dict(pd))

        return cls(
            id,
            name,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )


class HasCVATPoints(object):
    """Mixin for CVAT annotations that store a list of ``(x, y)`` pixel
    coordinates.

    Attributes:
        points: a list of ``(x, y)`` pixel coordinates defining points
    """

    def __init__(self, points):
        self.points = points

    @property
    def points_str(self):
        return self._to_cvat_points_str(self.points)

    @staticmethod
    def _to_rel_points(points, frame_size):
        width, height = frame_size
        rel_points = [(x / width, y / height) for x, y in points]
        return rel_points

    @staticmethod
    def _to_abs_points(points, frame_size):
        width, height = frame_size
        abs_points = []
        for x, y in points:
            abs_points.append((int(round(x * width)), int(round(y * height))))

        return abs_points

    @staticmethod
    def _to_cvat_points_str(points):
        return ";".join("%g,%g" % (x, y) for x, y in points)

    @staticmethod
    def _parse_cvat_points_str(points_str):
        points = []
        for xy_str in points_str.split(";"):
            x, y = xy_str.split(",")
            points.append((int(round(float(x))), int(round(float(y)))))

        return points


class CVATImageAnno(object):
    """Mixin for annotations in CVAT image format.

    Args:
        occluded (None): whether the object is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, occluded=None, attributes=None):
        self.occluded = occluded
        self.attributes = attributes or []

    def _to_attributes(self):
        attributes = {a.name: a.value for a in self.attributes}

        if self.occluded is not None:
            attributes["occluded"] = self.occluded

        return attributes

    @staticmethod
    def _parse_attributes(label):
        attrs = dict(label.iter_attributes())
        occluded = attrs.pop("occluded", None)
        attributes = [
            CVATAttribute(k, v)
            for k, v in attrs.items()
            if _is_supported_attribute_type(v)
        ]

        return occluded, attributes

    @staticmethod
    def _parse_anno_dict(d):
        occluded = _parse_attribute(d.get("@occluded", None))

        attributes = []
        for attr in _ensure_list(d.get("attribute", [])):
            name = attr["@name"].lstrip("@")
            value = _parse_attribute(attr["#text"])
            attributes.append(CVATAttribute(name, value))

        return occluded, attributes


class CVATImageBox(CVATImageAnno):
    """An object bounding box in CVAT image format.

    Args:
        label: the object label string
        xtl: the top-left x-coordinate of the box, in pixels
        ytl: the top-left y-coordinate of the box, in pixels
        xbr: the bottom-right x-coordinate of the box, in pixels
        ybr: the bottom-right y-coordinate of the box, in pixels
        occluded (None): whether the object is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self, label, xtl, ytl, xbr, ybr, occluded=None, attributes=None
    ):
        self.label = label
        self.xtl = xtl
        self.ytl = ytl
        self.xbr = xbr
        self.ybr = ybr
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the box.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.label

        width, height = frame_size
        bounding_box = [
            self.xtl / width,
            self.ytl / height,
            (self.xbr - self.xtl) / width,
            (self.ybr - self.ytl) / height,
        ]

        attributes = self._to_attributes()

        return fol.Detection(
            label=label, bounding_box=bounding_box, **attributes
        )

    @classmethod
    def from_detection(cls, detection, metadata):
        """Creates a :class:`CVATImageBox` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            detection: a :class:`fiftyone.core.labels.Detection`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImageBox`
        """
        label = detection.label

        width = metadata.width
        height = metadata.height
        x, y, w, h = detection.bounding_box
        xtl = int(round(x * width))
        ytl = int(round(y * height))
        xbr = int(round((x + w) * width))
        ybr = int(round((y + h) * height))

        occluded, attributes = cls._parse_attributes(detection)

        return cls(
            label, xtl, ytl, xbr, ybr, occluded=occluded, attributes=attributes
        )

    @classmethod
    def from_box_dict(cls, d):
        """Creates a :class:`CVATImageBox` from a ``<box>`` tag of a CVAT image
        annotation XML file.

        Args:
            d: a dict representation of a ``<box>`` tag

        Returns:
            a :class:`CVATImageBox`
        """
        label = d["@label"]

        xtl = int(round(float(d["@xtl"])))
        ytl = int(round(float(d["@ytl"])))
        xbr = int(round(float(d["@xbr"])))
        ybr = int(round(float(d["@ybr"])))

        occluded, attributes = cls._parse_anno_dict(d)

        return cls(
            label, xtl, ytl, xbr, ybr, occluded=occluded, attributes=attributes
        )


class CVATImagePolygon(CVATImageAnno, HasCVATPoints):
    """A polygon in CVAT image format.

    Args:
        label: the polygon label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polygon
        occluded (None): whether the polygon is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polygon.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=True,
            filled=True,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, polyline, metadata):
        """Creates a :class:`CVATImagePolygon` from a
        :class:`fiftyone.core.labels.Polyline`.

        If the :class:`fiftyone.core.labels.Polyline` is composed of multiple
        shapes, one :class:`CVATImagePolygon` per shape will be generated.

        Args:
            polyline: a :class:`fiftyone.core.labels.Polyline`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a list of :class:`CVATImagePolygon` instances
        """
        label = polyline.label

        if len(polyline.points) > 1:
            msg = (
                "Found polyline with more than one shape; generating separate "
                "annotations for each shape"
            )
            warnings.warn(msg)

        frame_size = (metadata.width, metadata.height)
        occluded, attributes = cls._parse_attributes(polyline)

        polylines = []
        for points in polyline.points:
            abs_points = cls._to_abs_points(points, frame_size)
            polylines.append(
                cls(
                    label, abs_points, occluded=occluded, attributes=attributes
                )
            )

        return polylines

    @classmethod
    def from_polygon_dict(cls, d):
        """Creates a :class:`CVATImagePolygon` from a ``<polygon>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<polygon>`` tag

        Returns:
            a :class:`CVATImagePolygon`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)

        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATImagePolyline(CVATImageAnno, HasCVATPoints):
    """A polyline in CVAT image format.

    Args:
        label: the polyline label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polyline
        occluded (None): whether the polyline is occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polyline.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=False,
            filled=False,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, polyline, metadata):
        """Creates a :class:`CVATImagePolyline` from a
        :class:`fiftyone.core.labels.Polyline`.

        If the :class:`fiftyone.core.labels.Polyline` is composed of multiple
        shapes, one :class:`CVATImagePolyline` per shape will be generated.

        Args:
            polyline: a :class:`fiftyone.core.labels.Polyline`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a list of :class:`CVATImagePolyline` instances
        """
        label = polyline.label

        if len(polyline.points) > 1:
            msg = (
                "Found polyline with more than one shape; generating separate "
                "annotations for each shape"
            )
            warnings.warn(msg)

        frame_size = (metadata.width, metadata.height)
        occluded, attributes = cls._parse_attributes(polyline)

        polylines = []
        for points in polyline.points:
            abs_points = cls._to_abs_points(points, frame_size)
            if abs_points and polyline.closed:
                abs_points.append(copy(abs_points[0]))

            polylines.append(
                cls(
                    label, abs_points, occluded=occluded, attributes=attributes
                )
            )

        return polylines

    @classmethod
    def from_polyline_dict(cls, d):
        """Creates a :class:`CVATImagePolyline` from a ``<polyline>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<polyline>`` tag

        Returns:
            a :class:`CVATImagePolyline`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)

        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATImagePoints(CVATImageAnno, HasCVATPoints):
    """A set of keypoints in CVAT image format.

    Args:
        label: the keypoints label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the keypoints
        occluded (None): whether the keypoints are occluded
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(self, label, points, occluded=None, attributes=None):
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATImageAnno.__init__(self, occluded=occluded, attributes=attributes)

    def to_keypoint(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Keypoint` representation of
        the points.

        Args:
            frame_size: the ``(width, height)`` of the image

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Keypoint(label=label, points=points, **attributes)

    @classmethod
    def from_keypoint(cls, keypoint, metadata):
        """Creates a :class:`CVATImagePoints` from a
        :class:`fiftyone.core.labels.Keypoint`.

        Args:
            keypoint: a :class:`fiftyone.core.labels.Keypoint`
            metadata: a :class:`fiftyone.core.metadata.ImageMetadata` for the
                image

        Returns:
            a :class:`CVATImagePoints`
        """
        label = keypoint.label

        frame_size = (metadata.width, metadata.height)
        points = cls._to_abs_points(keypoint.points, frame_size)

        occluded, attributes = cls._parse_attributes(keypoint)

        return cls(label, points, occluded=occluded, attributes=attributes)

    @classmethod
    def from_points_dict(cls, d):
        """Creates a :class:`CVATImagePoints` from a ``<points>`` tag of a
        CVAT image annotation XML file.

        Args:
            d: a dict representation of a ``<points>`` tag

        Returns:
            a :class:`CVATImagePoints`
        """
        label = d["@label"]
        points = cls._parse_cvat_points_str(d["@points"])
        occluded, attributes = cls._parse_anno_dict(d)
        return cls(label, points, occluded=occluded, attributes=attributes)


class CVATTrack(object):
    """An annotation track in CVAT video format.

    Args:
        id: the ID of the track
        label: the label for the track
        width: the width of the video frames, in pixels
        height: the height of the video frames, in pixels
        boxes (None): a dict mapping frame numbers to :class:`CVATVideoBox`
            instances
        polygons (None): a dict mapping frame numbers to
            :class:`CVATVideoPolygon` instances
        polylines (None): a dict mapping frame numbers to
            :class:`CVATVideoPolyline` instances
        points (None): a dict mapping frame numbers to :class:`CVATVideoPoints`
            instances
    """

    def __init__(
        self,
        id,
        label,
        width,
        height,
        boxes=None,
        polygons=None,
        polylines=None,
        points=None,
    ):
        self.id = id
        self.label = label
        self.width = width
        self.height = height
        self.boxes = boxes or {}
        self.polygons = polygons or {}
        self.polylines = polylines or {}
        self.points = points or {}

    @property
    def has_boxes(self):
        """Whether this track has 2D boxes."""
        return bool(self.boxes)

    @property
    def has_polylines(self):
        """Whether this track has polygons or polylines."""
        return bool(self.polygons) or bool(self.polylines)

    @property
    def has_points(self):
        """Whether this track has keypoints."""
        return bool(self.points)

    def iter_annos(self):
        """Returns an iterator over the annotations in the track.

        Returns:
            an iterator that emits :class:`CVATVideoAnno` instances
        """
        return itertools.chain(
            self.boxes.values(),
            self.polygons.values(),
            self.polylines.values(),
            self.points.values(),
        )

    def to_labels(self):
        """Returns :class:`fiftyone.core.labels.ImageLabel` representations of
        the annotations.

        Returns:
            a dictionary mapping frame numbers to
            :class:`fiftyone.core.labels.ImageLabel` instances
        """
        frame_size = (self.width, self.height)

        labels = {}

        # Only one of these will actually contain labels

        for frame_number, box in self.boxes.items():
            detection = box.to_detection(frame_size)
            detection.index = self.id
            labels[frame_number] = detection

        for frame_number, polygon in self.polygons.items():
            polyline = polygon.to_polyline(frame_size)
            polyline.index = self.id
            labels[frame_number] = polyline

        for frame_number, polyline in self.polylines.items():
            polyline = polyline.to_polyline(frame_size)
            polyline.index = self.id
            labels[frame_number] = polyline

        for frame_number, points in self.points.items():
            keypoint = points.to_keypoint(frame_size)
            keypoint.index = self.id
            labels[frame_number] = keypoint

        return labels

    @classmethod
    def from_labels(cls, id, labels, frame_size):
        """Creates a :class:`CVATTrack` from a dictionary of labels.

        Args:
            id: the ID of the track
            labels: a dictionary mapping frame numbers to
                :class:`fiftyone.core.labels.ImageLabel` instances
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATTrack`
        """
        width, height = frame_size

        boxes = {}
        polygons = {}
        polylines = {}
        points = {}
        label = None
        for frame_number, _label in labels.items():
            label = _label.label

            if isinstance(_label, fol.Detection):
                boxes[frame_number] = CVATVideoBox.from_detection(
                    frame_number, _label, frame_size
                )
            elif isinstance(_label, fol.Polyline):
                if _label.filled:
                    polygons[frame_number] = CVATVideoPolygon.from_polyline(
                        frame_number, _label, frame_size
                    )
                else:
                    polylines[frame_number] = CVATVideoPolyline.from_polyline(
                        frame_number, _label, frame_size
                    )
            elif isinstance(_label, fol.Keypoint):
                points[frame_number] = CVATVideoPoints.from_keypoint(
                    frame_number, _label, frame_size
                )
            elif _label is not None:
                msg = "Ignoring unsupported label type '%s'" % _label.__class__
                warnings.warn(msg)

        return cls(
            id,
            label,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )

    @classmethod
    def from_track_dict(cls, d, frame_size):
        """Creates a :class:`CVATTrack` from a ``<track>`` tag of a CVAT video
        annotation XML file.

        Args:
            d: a dict representation of an ``<track>`` tag
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATTrack`
        """
        id = d["@id"]
        label = d["@label"]

        width, height = frame_size

        boxes = {}
        for bd in _ensure_list(d.get("box", [])):
            box = CVATVideoBox.from_box_dict(label, bd)
            boxes[box.frame] = box

        polygons = {}
        for pd in _ensure_list(d.get("polygon", [])):
            polygon = CVATVideoPolygon.from_polygon_dict(label, pd)
            polygons[polygon.frame] = polygon

        polylines = {}
        for pd in _ensure_list(d.get("polyline", [])):
            polyline = CVATVideoPolyline.from_polyline_dict(label, pd)
            polylines[polyline.frame] = polyline

        points = {}
        for pd in _ensure_list(d.get("points", [])):
            point = CVATVideoPoints.from_points_dict(label, pd)
            points[point.frame] = point

        return cls(
            id,
            label,
            width,
            height,
            boxes=boxes,
            polygons=polygons,
            polylines=polylines,
            points=points,
        )


class CVATVideoAnno(object):
    """Mixin for annotations in CVAT video format.

    Args:
        outside (None): whether the object is truncated by the frame edge
        occluded (None): whether the object is occluded
        keyframe (None): whether the frame is a key frame
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self, outside=None, occluded=None, keyframe=None, attributes=None
    ):
        self.outside = outside
        self.occluded = occluded
        self.keyframe = keyframe
        self.attributes = attributes or []

    def _to_attributes(self):
        attributes = {a.name: a.value for a in self.attributes}

        if self.outside is not None:
            attributes["outside"] = self.outside

        if self.occluded is not None:
            attributes["occluded"] = self.occluded

        if self.keyframe is not None:
            attributes["keyframe"] = self.keyframe

        return attributes

    @staticmethod
    def _parse_attributes(label):
        attrs = dict(label.iter_attributes())
        occluded = attrs.pop("occluded", None)
        outside = attrs.pop("outside", None)
        keyframe = attrs.pop("keyframe", None)
        attributes = [
            CVATAttribute(k, v)
            for k, v in attrs.items()
            if _is_supported_attribute_type(v)
        ]

        return outside, occluded, keyframe, attributes

    @staticmethod
    def _parse_anno_dict(d):
        outside = _parse_attribute(d.get("@outside", None))
        occluded = _parse_attribute(d.get("@occluded", None))
        keyframe = _parse_attribute(d.get("@keyframe", None))

        attributes = []
        for attr in _ensure_list(d.get("attribute", [])):
            name = attr["@name"].lstrip("@")
            value = _parse_attribute(attr["#text"])
            attributes.append(CVATAttribute(name, value))

        return outside, occluded, keyframe, attributes


class CVATVideoBox(CVATVideoAnno):
    """An object bounding box in CVAT video format.

    Args:
        frame: the frame number
        label: the object label string
        xtl: the top-left x-coordinate of the box, in pixels
        ytl: the top-left y-coordinate of the box, in pixels
        xbr: the bottom-right x-coordinate of the box, in pixels
        ybr: the bottom-right y-coordinate of the box, in pixels
        outside (None): whether the object is truncated by the frame edge
        occluded (None): whether the object is occluded
        keyframe (None): whether the frame is a key frame
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        xtl,
        ytl,
        xbr,
        ybr,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        self.xtl = xtl
        self.ytl = ytl
        self.xbr = xbr
        self.ybr = ybr
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_detection(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Detection` representation of
        the box.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        label = self.label

        width, height = frame_size
        bounding_box = [
            self.xtl / width,
            self.ytl / height,
            (self.xbr - self.xtl) / width,
            (self.ybr - self.ytl) / height,
        ]

        attributes = self._to_attributes()

        return fol.Detection(
            label=label, bounding_box=bounding_box, **attributes
        )

    @classmethod
    def from_detection(cls, frame_number, detection, frame_size):
        """Creates a :class:`CVATVideoBox` from a
        :class:`fiftyone.core.labels.Detection`.

        Args:
            frame_number: the frame number
            detection: a :class:`fiftyone.core.labels.Detection`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoBox`
        """
        label = detection.label

        width, height = frame_size
        x, y, w, h = detection.bounding_box
        xtl = int(round(x * width))
        ytl = int(round(y * height))
        xbr = int(round((x + w) * width))
        ybr = int(round((y + h) * height))

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            detection
        )

        return cls(
            frame_number,
            label,
            xtl,
            ytl,
            xbr,
            ybr,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_box_dict(cls, label, d):
        """Creates a :class:`CVATVideoBox` from a ``<box>`` tag of a CVAT video
        annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<box>`` tag

        Returns:
            a :class:`CVATVideoBox`
        """
        frame = int(d["@frame"])

        xtl = int(round(float(d["@xtl"])))
        ytl = int(round(float(d["@ytl"])))
        xbr = int(round(float(d["@xbr"])))
        ybr = int(round(float(d["@ybr"])))

        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)

        return cls(
            frame,
            label,
            xtl,
            ytl,
            xbr,
            ybr,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPolygon(CVATVideoAnno, HasCVATPoints):
    """A polygon in CVAT video format.

    Args:
        frame: the frame number
        label: the polygon label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polygon
        outside (None): whether the polygon is truncated by the frame edge
        occluded (None): whether the polygon is occluded
        keyframe (None): whether the frame is a key frame
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polygon.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=True,
            filled=True,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, frame_number, polyline, frame_size):
        """Creates a :class:`CVATVideoPolygon` from a
        :class:`fiftyone.core.labels.Polyline`.

        Args:
            frame_number: the frame number
            polyline: a :class:`fiftyone.core.labels.Polyline`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPolygon`
        """
        label = polyline.label

        points = _get_single_polyline_points(polyline)
        points = cls._to_abs_points(points, frame_size)

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            polyline
        )

        return cls(
            frame_number,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_polygon_dict(cls, label, d):
        """Creates a :class:`CVATVideoPolygon` from a ``<polygon>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<polygon>`` tag

        Returns:
            a :class:`CVATVideoPolygon`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPolyline(CVATVideoAnno, HasCVATPoints):
    """A polyline in CVAT video format.

    Args:
        frame: the frame number
        label: the polyline label string
        points: a list of ``(x, y)`` pixel coordinates defining the vertices of
            the polyline
        outside (None): whether the polyline is truncated by the frame edge
        occluded (None): whether the polyline is occluded
        keyframe (None): whether the frame is a key frame
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_polyline(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Polyline` representation of
        the polyline.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Polyline(
            label=label,
            points=[points],
            closed=False,
            filled=False,
            **attributes,
        )

    @classmethod
    def from_polyline(cls, frame_number, polyline, frame_size):
        """Creates a :class:`CVATVideoPolyline` from a
        :class:`fiftyone.core.labels.Polyline`.

        Args:
            frame_number: the frame number
            polyline: a :class:`fiftyone.core.labels.Polyline`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPolyline`
        """
        label = polyline.label

        points = _get_single_polyline_points(polyline)
        points = cls._to_abs_points(points, frame_size)
        if points and polyline.closed:
            points.append(copy(points[0]))

        outside, occluded, keyframe, attributes = cls._parse_attributes(
            polyline
        )

        return cls(
            frame_number,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_polyline_dict(cls, label, d):
        """Creates a :class:`CVATVideoPolyline` from a ``<polyline>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<polyline>`` tag

        Returns:
            a :class:`CVATVideoPolyline`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATVideoPoints(CVATVideoAnno, HasCVATPoints):
    """A set of keypoints in CVAT video format.

    Args:
        frame: the frame number
        label: the keypoints label string
        points: a list of ``(x, y)`` pixel coordinates defining the keypoints
        outside (None): whether the keypoints are truncated by the frame edge
        occluded (None): whether the keypoints are occluded
        keyframe (None): whether the frame is a key frame
        attributes (None): a list of :class:`CVATAttribute` instances
    """

    def __init__(
        self,
        frame,
        label,
        points,
        outside=None,
        occluded=None,
        keyframe=None,
        attributes=None,
    ):
        self.frame = frame
        self.label = label
        HasCVATPoints.__init__(self, points)
        CVATVideoAnno.__init__(
            self,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    def to_keypoint(self, frame_size):
        """Returns a :class:`fiftyone.core.labels.Keypoint` representation of
        the points.

        Args:
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        label = self.label
        points = self._to_rel_points(self.points, frame_size)
        attributes = self._to_attributes()
        return fol.Keypoint(label=label, points=points, **attributes)

    @classmethod
    def from_keypoint(cls, frame_number, keypoint, frame_size):
        """Creates a :class:`CVATVideoPoints` from a
        :class:`fiftyone.core.labels.Keypoint`.

        Args:
            frame_number: the frame number
            keypoint: a :class:`fiftyone.core.labels.Keypoint`
            frame_size: the ``(width, height)`` of the video frames

        Returns:
            a :class:`CVATVideoPoints`
        """
        label = keypoint.label
        points = cls._to_abs_points(keypoint.points, frame_size)
        outside, occluded, keyframe, attributes = cls._parse_attributes(
            keypoint
        )
        return cls(
            frame_number,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )

    @classmethod
    def from_points_dict(cls, label, d):
        """Creates a :class:`CVATVideoPoints` from a ``<points>`` tag of a
        CVAT video annotation XML file.

        Args:
            label: the object label
            d: a dict representation of a ``<points>`` tag

        Returns:
            a :class:`CVATVideoPoints`
        """
        frame = int(d["@frame"])
        points = cls._parse_cvat_points_str(d["@points"])
        outside, occluded, keyframe, attributes = cls._parse_anno_dict(d)
        return cls(
            frame,
            label,
            points,
            outside=outside,
            occluded=occluded,
            keyframe=keyframe,
            attributes=attributes,
        )


class CVATAttribute(object):
    """An attribute in CVAT image format.

    Args:
        name: the attribute name
        value: the attribute value
    """

    def __init__(self, name, value):
        self.name = name
        self.value = value

    def to_eta_attribute(self):
        """Returns an ``eta.core.data.Attribute`` representation of the
        attribute.

        Returns:
            an ``eta.core.data.Attribute``
        """
        if isinstance(self.value, bool):
            return etad.BooleanAttribute(self.name, self.value)

        if etau.is_numeric(self.value):
            return etad.NumericAttribute(self.name, self.value)

        return etad.CategoricalAttribute(self.name, self.value)

    def to_attribute(self):
        """Returns a :class:`fiftyone.core.labels.Attribute` representation of
        the attribute.
        Returns:
            a :class:`fiftyone.core.labels.Attribute`
        """
        if isinstance(self.value, bool):
            return fol.BooleanAttribute(value=self.value)

        if etau.is_numeric(self.value):
            return fol.NumericAttribute(value=self.value)

        return fol.CategoricalAttribute(value=self.value)


class CVATImageAnnotationWriter(object):
    """Class for writing annotations in CVAT image format.

    See :ref:`this page <CVATImageDataset-export>` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template(
            "cvat_image_annotation_template.xml"
        )

    def write(
        self, cvat_task_labels, cvat_images, xml_path, id=None, name=None
    ):
        """Writes the annotations to disk.

        Args:
            cvat_task_labels: a :class:`CVATTaskLabels` instance
            cvat_images: a list of :class:`CVATImage` instances
            xml_path: the path to write the annotations XML file
            id (None): an ID for the task
            name (None): a name for the task
        """
        now = datetime.now().isoformat()
        xml_str = self.template.render(
            {
                "id": id,
                "name": name,
                "size": len(cvat_images),
                "created": now,
                "updated": now,
                "labels": cvat_task_labels.labels,
                "dumped": now,
                "images": cvat_images,
            }
        )
        etau.write_file(xml_str, xml_path)


class CVATVideoAnnotationWriter(object):
    """Class for writing annotations in CVAT video format.

    See :ref:`this page <CVATVideoDataset-export>` for format details.
    """

    def __init__(self):
        environment = jinja2.Environment(
            loader=jinja2.FileSystemLoader(foc.RESOURCES_DIR),
            trim_blocks=True,
            lstrip_blocks=True,
        )
        self.template = environment.get_template(
            "cvat_video_interpolation_template.xml"
        )

    def write(
        self,
        cvat_task_labels,
        cvat_tracks,
        metadata,
        xml_path,
        id=None,
        name=None,
    ):
        """Writes the annotations to disk.

        Args:
            cvat_task_labels: a :class:`CVATTaskLabels` instance
            cvat_tracks: a list of :class:`CVATTrack` instances
            metadata: the :class:`fiftyone.core.metadata.VideoMetadata`
                instance for the video
            xml_path: the path to write the annotations XML file
            id (None): an ID for the task
            name (None): a name for the task
        """
        now = datetime.now().isoformat()
        xml_str = self.template.render(
            {
                "id": id,
                "name": name,
                "size": metadata.total_frame_count,
                "created": now,
                "updated": now,
                "width": metadata.frame_width,
                "height": metadata.frame_height,
                "labels": cvat_task_labels.labels,
                "dumped": now,
                "tracks": cvat_tracks,
            }
        )
        etau.write_file(xml_str, xml_path)


class CVATBackendConfig(foua.AnnotationBackendConfig):
    """Base class for configuring :class:`CVATBackend` instances.

    Args:
        name: the name of the backend
        label_schema: a dictionary containing the description of label fields,
            classes and attribute to annotate
        media_field ("filepath"): string field name containing the paths to
            media files on disk to upload
        url (None): the url of the CVAT server
        username (None): the CVAT username
        password (None): the CVAT password
        segment_size (None): maximum number of images per job. Not applicable
            to videos
        image_quality (75): an int in `[0, 100]` determining the image quality
            uploaded to CVAT
        task_assignee (None): the username to which the task(s) were assigned
        job_assignees (None): a list of usernames to which jobs were assigned
        job_reviewers (None): a list of usernames to which job reviews were
            assigned
    """

    def __init__(
        self,
        name,
        label_schema,
        media_field="filepath",
        url=None,
        username=None,
        password=None,
        segment_size=None,
        image_quality=75,
        task_assignee=None,
        job_assignees=None,
        job_reviewers=None,
        **kwargs,
    ):
        super().__init__(name, label_schema, media_field=media_field, **kwargs)
        self.url = url
        self.segment_size = segment_size
        self.image_quality = image_quality
        self.task_assignee = task_assignee
        self.job_assignees = job_assignees
        self.job_reviewers = job_reviewers

        # store privately so these aren't serialized
        self._username = username
        self._password = password

    @property
    def username(self):
        return self._username

    @username.setter
    def username(self, value):
        self._username = value

    @property
    def password(self):
        return self._password

    @password.setter
    def password(self, value):
        self._password = value


class CVATBackend(foua.AnnotationBackend):
    """Class for interacting with the CVAT annotation backend."""

    @property
    def supported_label_types(self):
        return {
            fol.Classification,
            fol.Classifications,
            fol.Detection,
            fol.Detections,
            fol.Keypoint,
            fol.Keypoints,
            fol.Polyline,
            fol.Polylines,
        }

    @property
    def supported_scalar_types(self):
        return {
            fof.IntField,
            fof.FloatField,
            fof.StringField,
            fof.BooleanField,
        }

    @property
    def supported_attr_types(self):
        return {"text", "select", "radio", "checkbox"}

    @property
    def default_attr_type(self):
        return "text"

    @property
    def default_categorical_attr_type(self):
        return "select"

    def requires_attr_values(self, attr_type):
        return attr_type != "text"

    def connect_to_api(self):
        return CVATAnnotationAPI(
            self.config.name,
            self.config.url,
            username=self.config.username,
            password=self.config.password,
        )

    def upload_annotations(self, samples, launch_editor=False):
        api = self.connect_to_api()

        logger.info("Uploading samples to CVAT...")
        (
            task_ids,
            job_ids,
            frame_id_map,
            labels_task_map,
            assigned_scalar_attrs,
        ) = api.upload_samples(
            samples,
            label_schema=self.config.label_schema,
            media_field=self.config.media_field,
            segment_size=self.config.segment_size,
            image_quality=self.config.image_quality,
            task_assignee=self.config.task_assignee,
            job_assignees=self.config.job_assignees,
            job_reviewers=self.config.job_reviewers,
        )
        logger.info("Upload complete")

        id_map = self.build_label_id_map(samples)

        results = CVATAnnotationResults(
            samples,
            self.config,
            id_map,
            task_ids,
            job_ids,
            frame_id_map,
            labels_task_map,
            assigned_scalar_attrs,
            backend=self,
        )

        if launch_editor:
            task_id = task_ids[0]
            if job_ids and job_ids[task_id]:
                editor_url = api.base_job_url(task_id, job_ids[task_id][0])
            else:
                editor_url = api.base_task_url(task_id)

            logger.info("Launching editor at '%s'...", editor_url)
            api.launch_editor(url=editor_url)

        return results

    def download_annotations(self, results):
        api = self.connect_to_api()

        logger.info("Downloading labels from CVAT...")
        annotations = api.download_annotations(
            results.config.label_schema,
            results.task_ids,
            results.job_ids,
            results.frame_id_map,
            results.labels_task_map,
            results.assigned_scalar_attrs,
        )
        logger.info("Download complete")

        return annotations


class CVATAnnotationResults(foua.AnnotationResults):
    """Class that stores all relevant information needed to monitor the
    progress of an annotation run sent to CVAT and download the results.

    Args:
        samples: a :class:`fiftyone.core.collections.SampleCollection`
        config: a :class:`CVATBackendConfig`
        backend (None): a :class:`CVATBackend`
    """

    def __init__(
        self,
        samples,
        config,
        id_map,
        task_ids,
        job_ids,
        frame_id_map,
        labels_task_map,
        assigned_scalar_attrs,
        backend=None,
    ):
        super().__init__(samples, config, backend=backend)

        self.config = config
        self.id_map = id_map
        self.task_ids = task_ids
        self.job_ids = job_ids
        self.frame_id_map = frame_id_map
        self.labels_task_map = labels_task_map
        self.assigned_scalar_attrs = assigned_scalar_attrs

    def load_credentials(self, url=None, username=None, password=None):
        """Load the CVAT credentials from the given keyword arguments or the
        FiftyOne annotation config.

        Args:
            url (None): the url of the CVAT server
            username (None): the CVAT username
            password (None): the CVAT password
        """
        self._load_config_parameters(
            url=url, username=username, password=password
        )

    def connect_to_api(self):
        """Returns an API instance connected to the CVAT server.

        Returns:
            a :class:`CVATAnnotationAPI`
        """
        return self._backend.connect_to_api()

    def get_status(self):
        """Gets the status of the assigned tasks and jobs.

        Returns:
            a dict of status information
        """
        return self._get_status()

    def print_status(self):
        """Print the status of the assigned tasks and jobs."""
        self._get_status(log=True)

    def cleanup(self):
        """Deletes all tasks associated with this annotation run from the
        CVAT server.
        """
        api = self.connect_to_api()
        api.delete_tasks(self.task_ids)

        # @todo save updated results to DB?
        self.task_ids = []
        self.job_ids = {}

    def _get_status(self, log=False):
        api = self.connect_to_api()

        status = {}
        for label_field, task_ids in self.labels_task_map.items():
            if log:
                logger.info("\nStatus for label field '%s':\n", label_field)

            status[label_field] = {}

            for task_id in task_ids:
                task_url = api.task_url(task_id)

                try:
                    task_json = api.get(task_url).json()
                except:
                    logger.warning(
                        "\tFailed to get info for task '%d' at %s",
                        task_id,
                        task_url,
                    )
                    continue

                task_name = task_json["name"]
                task_status = task_json["status"]
                task_assignee = task_json["assignee"]
                task_updated = task_json["updated_date"]

                if log:
                    logger.info(
                        "\tTask %d (%s):\n"
                        "\t\tStatus: %s\n"
                        "\t\tAssignee: %s\n"
                        "\t\tLast updated: %s\n"
                        "\t\tURL: %s\n",
                        task_id,
                        task_name,
                        task_status,
                        task_assignee,
                        task_updated,
                        api.base_task_url(task_id),
                    )

                jobs_info = {}
                for job_id in self.job_ids[task_id]:
                    job_url = api.taskless_job_url(job_id)

                    try:
                        job_json = api.get(job_url).json()
                    except:
                        logger.warning(
                            "\t\tFailed to get info for job '%d' at %s",
                            job_id,
                            job_url,
                        )
                        continue

                    jobs_info[job_id] = job_json

                    if log:
                        logger.info(
                            "\t\tJob %d:\n"
                            "\t\t\tStatus: %s\n"
                            "\t\t\tAssignee: %s\n"
                            "\t\t\tReviewer: %s\n",
                            job_id,
                            job_json["status"],
                            job_json["assignee"],
                            job_json["reviewer"],
                        )

                status[label_field][task_id] = {
                    "name": task_name,
                    "status": task_status,
                    "assignee": task_assignee,
                    "last_updated": task_updated,
                    "jobs": jobs_info,
                }

        return status

    @classmethod
    def _from_dict(cls, d, samples):
        config = CVATBackendConfig.from_dict(d["config"])

        # int keys were serialized as strings...
        job_ids = {int(task_id): ids for task_id, ids in d["job_ids"].items()}
        frame_id_map = {
            int(task_id): {
                int(frame_id): frame_data
                for frame_id, frame_data in frame_map.items()
            }
            for task_id, frame_map in d["frame_id_map"].items()
        }

        return cls(
            samples,
            config,
            d["id_map"],
            d["task_ids"],
            job_ids,
            frame_id_map,
            d["labels_task_map"],
            d["assigned_scalar_attrs"],
        )


class CVATAnnotationAPI(foua.AnnotationAPI):
    """A class to facilitate connection to and management of tasks in CVAT.

    On initializiation, this class constructs a session based on the provided
    server url and credentials.

    This API provides methods to easily get, put, post, patch, and delete tasks
    and jobs through the formatted urls specified by the CVAT REST API.

    Additionally, samples and label schemas can be uploaded and annotations
    downloaded through this class.

    Args:
        name: the name of the backend
        url: url of the CVAT server
        username (None): the CVAT username
        password (None): the CVAT password
    """

    _TYPES_MAP = {
        "rectangle": ["detection", "detections"],
        "polygon": ["polylines", "polyline", "detection", "detections"],
        "polyline": ["polylines", "polyline"],
        "points": ["keypoints", "keypoint"],
    }

    def __init__(self, name, url, username=None, password=None):
        self._name = name
        self._url = url
        self._username = username
        self._password = password

        self._session = None
        self._user_id_map = {}

        self._setup()

    @property
    def base_url(self):
        return self._url

    @property
    def base_api_url(self):
        return "%s/api/v1" % self.base_url

    @property
    def login_url(self):
        return "%s/auth/login" % self.base_api_url

    @property
    def users_url(self):
        return "%s/users" % self.base_api_url

    @property
    def tasks_url(self):
        return "%s/tasks" % self.base_api_url

    def task_url(self, task_id):
        return "%s/%d" % (self.tasks_url, task_id)

    def task_data_url(self, task_id):
        return "%s/data" % self.task_url(task_id)

    def task_data_meta_url(self, task_id):
        return "%s/data/meta" % self.task_url(task_id)

    def task_annotation_url(self, task_id):
        return "%s/annotations" % self.task_url(task_id)

    def task_annotation_formatted_url(
        self, task_id, annot_filepath, annot_format="CVAT 1.1",
    ):
        return "%s/annotations?format=%s&filename=%s" % (
            self.task_url(task_id),
            annot_format,
            annot_filepath,
        )

    def jobs_url(self, task_id):
        return "%s/jobs" % self.task_url(task_id)

    def job_url(self, task_id, job_id):
        return "%s/%d" % (self.jobs_url(task_id), job_id)

    def taskless_job_url(self, job_id):
        return "%s/jobs/%d" % (self.base_api_url, job_id)

    def base_task_url(self, task_id):
        return "%s/tasks/%d" % (self.base_url, task_id)

    def base_job_url(self, task_id, job_id):
        return "%s/tasks/%d/jobs/%d" % (self.base_url, task_id, job_id)

    def user_search_url(self, username):
        return "%s/users?search=%s" % (self.base_api_url, username)

    def _setup(self):
        if not self._url:
            raise ValueError(
                "You must provide/configure the `url` of the CVAT server"
            )

        username = self._username
        password = self._password

        if username is None or password is None:
            username, password = self._prompt_username_password(
                self._name, username=username, password=password
            )

        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        self._session = requests.Session()
        response = self.post(
            self.login_url, data={"username": username, "password": password}
        )

        if "csrftoken" in response.cookies:
            self._session.headers["X-CSRFToken"] = response.cookies[
                "csrftoken"
            ]

    def get(self, url, **kwargs):
        """Sends a GET request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        response = self._session.get(url, verify=False, **kwargs)
        self._validate(response, kwargs)
        return response

    def patch(self, url, **kwargs):
        """Sends a PATCH request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        response = self._session.patch(url, verify=False, **kwargs)
        self._validate(response, kwargs)
        return response

    def post(self, url, **kwargs):
        """Sends a POST request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        response = self._session.post(url, verify=False, **kwargs)
        self._validate(response, kwargs)
        return response

    def put(self, url, **kwargs):
        """Sends a PUT request to the given CVAT API URL.

        Args:
            url: the url
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        response = self._session.put(url, verify=False, **kwargs)
        self._validate(response, kwargs)
        return response

    def delete(self, url, **kwargs):
        """Sends a DELETE request to the given CVAT API URL.

        Args:
            url: the url to send the request to
            **kwargs: additional request parameters

        Returns:
            the request response
        """
        response = self._session.delete(url, verify=False, **kwargs)
        self._validate(response, kwargs)
        return response

    def get_user_id(self, username):
        """Retrieves the CVAT user ID for the given username.

        Args:
            username: the username

        Returns:
            the user ID, or None if the user was not found
        """
        if username is None:
            return

        if username in self._user_id_map:
            return self._user_id_map[username]

        search_url = self.user_search_url(username)
        user_response = self.get(search_url)
        resp_json = user_response.json()
        for user_info in resp_json["results"]:
            if user_info["username"] == username:
                user_id = user_info["id"]
                self._user_id_map[username] = user_id
                return user_id

        logger.warning("User '%s' not found in %s", username, search_url)

    def create_task(
        self,
        name,
        labels=None,
        segment_size=None,
        image_quality=75,
        task_assignee=None,
    ):
        """Creates a task on the CVAT server using the given label schema.

        Args:
            name: a name for the task
            labels (None): the label schema to use for the created task
            segment_size (None): maximum number of images to load into a job.
                Not applicable to videos
            image_quality (75): an int in `[0, 100]` determining the image
                quality to upload to CVAT
            task_assignee (None): the username to assign the created task(s)

        Returns:
            a tuple of

            -   **task_id**: the id of the created task in CVAT
            -   **attribute_id_map**: a dictionary mapping the ids assigned to
                attributes by CVAT for every class
            -   **class_id_map**: a dictionary mapping the ids assigned to
                classes by CVAT
        """
        if labels is None:
            labels = []

        task_json = {
            "name": name,
            "image_quality": image_quality,
            "labels": labels,
        }

        if segment_size is not None:
            task_json["segment_size"] = segment_size

        task_creation_resp = self.post(self.tasks_url, json=task_json)
        task_json = task_creation_resp.json()
        task_id = task_json["id"]

        attribute_id_map = {}
        class_id_map = {}
        attribute_id_map = {}
        class_id_map[task_id] = {}
        for label in task_json["labels"]:
            class_id = label["id"]
            class_id_map[label["name"]] = class_id
            attribute_id_map[class_id] = {}
            for attr in label["attributes"]:
                attr_name = attr["name"]
                attr_id = attr["id"]
                attribute_id_map[class_id][attr_name] = attr_id

        if task_assignee is not None:
            user_id = self.get_user_id(task_assignee)
            if user_id is not None:
                task_patch = {"assignee_id": self.get_user_id(task_assignee)}
                self.patch(self.task_url(task_id), json=task_patch)

        return task_id, attribute_id_map, class_id_map

    def delete_task(self, task_id):
        """Deletes the given task from the CVAT server.

        Args:
            task_id: the task ID
        """
        self.delete(self.task_url(task_id))

    def delete_tasks(self, task_ids):
        """Deletes the given tasks from the CVAT server.

        Args:
            task_ids: an iterable of task IDs
        """
        logger.info("Deleting tasks...")
        with fou.ProgressBar() as pb:
            for task_id in pb(list(task_ids)):
                self.delete_task(task_id)

    def launch_editor(self, url=None):
        """Launches the CVAT editor in your default web browser.

        Args:
            url (None): an optional URL to open. By default, the base URL of
                the server is opened
        """
        if url is None:
            url = self.base_url

        webbrowser.open(url, new=2)

    def upload_data(
        self,
        task_id,
        paths,
        image_quality=75,
        job_assignees=None,
        job_reviewers=None,
    ):
        """Uploads a list of paths to images or one path to a video to an
        existing task.

        Args:
            task_id: the id of the task to which to upload data
            paths: a list of paths to media files on disk to upload
            image_quality (75): an int in `[0, 100]` determining the image
                quality to upload to CVAT
            job_assignees (None): a list of usernames to assign jobs
            job_reviewers (None): a list of usernames to assign job reviews

        Returns:
            a list of the job ids created for the task
        """
        data = {"image_quality": image_quality}
        files = {
            "client_files[%d]" % i: open(p, "rb") for i, p in enumerate(paths)
        }
        self.post(self.task_data_url(task_id), data=data, files=files)

        job_ids = []
        while job_ids == []:
            job_resp = self.get(self.jobs_url(task_id))
            job_ids = [j["id"] for j in job_resp.json()]

        if job_assignees is not None:
            for ind, job_id in enumerate(job_ids):
                assignee_ind = ind % len(job_assignees)
                assignee = job_assignees[assignee_ind]
                user_id = self.get_user_id(assignee)
                if assignee is not None and user_id is not None:
                    job_patch = {"assignee_id": user_id}
                    self.patch(self.taskless_job_url(job_id), json=job_patch)

        if job_reviewers is not None:
            for ind, job_id in enumerate(job_ids):
                reviewer_ind = ind % len(job_reviewers)
                reviewer = job_reviewers[reviewer_ind]
                user_id = self.get_user_id(reviewer)
                if reviewer is not None and user_id is not None:
                    job_patch = {"reviewer_id": user_id}
                    self.patch(self.taskless_job_url(job_id), json=job_patch)

        return job_ids

    def upload_samples(
        self,
        samples,
        label_schema,
        media_field="filepath",
        segment_size=None,
        image_quality=75,
        task_assignee=None,
        job_assignees=None,
        job_reviewers=None,
    ):
        """Parse the given samples and use the label schema to create tasks,
        upload data, and upload formatted annotations to CVAT.

        Args:
            samples: a :class:`fiftyone.core.collections.SampleCollection` to
                upload to CVAT
            label_schema: a dictionary containing the description of label
                fields, classes and attribute to annotate
            media_field ("filepath"): string field name containing the paths to
                media files on disk to upload
            segment_size (None): maximum number of images to load into a job.
                Not applicable to videos
            image_quality (75): an int in `[0, 100]` determining the image
                quality to upload to CVAT
            task_assignee (None): the username to assign the created task(s)
            job_assignees (None): a list of usernames to assign jobs
            job_reviewers (None): a list of usernames to assign job reviews

        Returns:
            a tuple of

            -   **task_ids**: a list of the task ids created by uploading
                samples
            -   **job_ids**: a dictionary mapping task id to a list of job ids
                created for that task
            -   **frame_id_map**: a dictionary mapping task id to another map
                from the CVAT frame index of every image to the FiftyOne sample
                id (for videos) and FiftyOne frame id
            -   **labels_task_map**: a dictionary mapping label field names to
                a list of tasks created for that label field
            -   **assigned_scalar_attrs**: a dictionary mapping the label field
                name of scalar fields to a boolean indicating whether the
                scalar field is being annotated through a dropdown selection of
                through an attribute with a text input box named "value"
        """
        if media_field not in samples.get_field_schema():
            logger.warning(
                "Media field '%s' not found, uploading media from 'filepath'",
                media_field,
            )
            media_field = "filepath"

        samples = samples.sort_by(media_field)
        task_ids = []
        job_ids = {}
        frame_id_map = {}
        labels_task_map = {}
        assigned_scalar_attrs = {}

        # CVAT only allows for one video per task
        if samples.media_type == fom.VIDEO:
            is_video = True
            task_batch_size = 1
        else:
            is_video = False
            task_batch_size = len(samples)

        # Create a new task for every label field to annotate
        for label_field, label_info in label_schema.items():
            labels_task_map[label_field] = []
            label_type = label_info["type"]
            classes = label_info["classes"]
            input_attributes = label_info["attributes"]
            is_existing_field = label_info["existing_field"]
            cvat_attributes = self._construct_cvat_attributes(input_attributes)

            # Create a new task for every video sample
            for task_index, task_batch_ind in enumerate(
                range(0, len(samples), task_batch_size)
            ):
                batch_samples = samples.skip(task_batch_ind).limit(
                    task_batch_size
                )

                # Only relevant to track label ids for existing non-scalar
                # Label fields
                if is_existing_field and label_type != "scalar":
                    label_id_attr = {
                        "name": "label_id",
                        "mutable": True,
                        "input_type": "text",
                    }
                    cvat_attributes["label_id"] = label_id_attr

                attributes = list(cvat_attributes.values())
                attr_names = list(cvat_attributes.keys())

                # Top level CVAT labels are classes for FiftyOne Label fields
                # for scalar fields, there may only be one CVAT label and it is
                # the label_field string if no classes are provided
                labels = []
                label_names = classes
                assign_scalar_attrs = False
                if classes == []:
                    assign_scalar_attrs = True
                    label_names = [label_field]
                    if attributes:
                        attributes = [attributes[0]]
                        attr_names = [attr_names[0]]
                    else:
                        attributes = [
                            {
                                "name": "value",
                                "mutable": True,
                                "input_type": "text",
                            }
                        ]
                        attr_names = ["value"]
                for ln in label_names:
                    labels.append({"name": ln, "attributes": attributes})

                if label_type == "scalar":
                    # True if scalars are annotated as attributes of tags
                    # False if scalars are annotated as label of tags
                    assigned_scalar_attrs[label_field] = assign_scalar_attrs

                # Parse label data into format expected by CVAT
                annot_tags = []
                annot_shapes = []
                annot_tracks = []
                id_mapping = self._create_id_mapping(batch_samples)

                if is_existing_field:
                    if is_video and label_type in [
                        "detections",
                        "keypoints",
                        "polylines",
                        "keypoint",
                        "polyline",
                        "detection",
                    ]:
                        (
                            annot_shapes,
                            annot_tracks,
                            remapped_attr_names,
                        ) = self._create_shapes_tags_tracks(
                            batch_samples,
                            label_field,
                            label_type,
                            attr_names,
                            classes,
                            is_shape=True,
                            load_tracks=True,
                        )
                    elif label_type in [
                        "classification",
                        "classifications",
                        "scalar",
                    ]:
                        (
                            annot_tags,
                            remapped_attr_names,
                        ) = self._create_shapes_tags_tracks(
                            batch_samples,
                            label_field,
                            label_type,
                            attr_names,
                            classes,
                            is_shape=False,
                            assign_scalar_attrs=assign_scalar_attrs,
                        )
                    else:
                        (
                            annot_shapes,
                            remapped_attr_names,
                        ) = self._create_shapes_tags_tracks(
                            batch_samples,
                            label_field,
                            label_type,
                            attr_names,
                            classes,
                            is_shape=True,
                        )

                    # If "attribute:" was prepended to any attribute names,
                    # update the names of attribute in labels before creating
                    # tasks
                    for label in labels:
                        for attr in label["attributes"]:
                            attr_name = attr["name"]
                            if attr_name in remapped_attr_names:
                                attr["name"] = remapped_attr_names[attr_name]

                current_job_assignees = job_assignees
                current_job_reviewers = job_reviewers
                if is_video:
                    # Videos are uploaded in multiple tasks with 1 job per task
                    # Assign the correct users for the current task
                    if job_assignees is not None:
                        job_assignee_ind = task_index % len(job_assignees)
                        current_job_assignees = [
                            job_assignees[job_assignee_ind]
                        ]

                    if job_reviewers is not None:
                        job_reviewer_ind = task_index % len(job_reviewers)
                        current_job_reviewers = [
                            job_reviewers[job_reviewer_ind]
                        ]

                task_name = "FiftyOne_%s_%s" % (
                    batch_samples._root_dataset.name.replace(" ", "_"),
                    label_field.replace(" ", "_"),
                )

                # Create task and upload raw data
                task_id, attribute_id_map, class_id_map = self.create_task(
                    task_name,
                    labels=labels,
                    segment_size=segment_size,
                    image_quality=image_quality,
                    task_assignee=task_assignee,
                )
                task_ids.append(task_id)
                labels_task_map[label_field].append(task_id)
                paths = batch_samples.values(media_field)
                current_job_ids = self.upload_data(
                    task_id,
                    paths,
                    image_quality=image_quality,
                    job_assignees=current_job_assignees,
                    job_reviewers=current_job_reviewers,
                )
                job_ids[task_id] = current_job_ids
                frame_id_map[task_id] = id_mapping

                # Creating task assigned ids to classes and attributes
                # Remap annotations to these ids before uploading
                annot_shapes = self._remap_ids(
                    annot_shapes, attribute_id_map, class_id_map
                )
                annot_tags = self._remap_ids(
                    annot_tags, attribute_id_map, class_id_map
                )
                annot_tracks = self._remap_track_ids(
                    annot_tracks, attribute_id_map, class_id_map
                )

                annot_json = {
                    "version": 0,
                    "tags": annot_tags,
                    "shapes": annot_shapes,
                    "tracks": annot_tracks,
                }

                len_shapes = 0
                len_tags = 0
                len_tracks = 0
                while (
                    len(annot_shapes) != len_shapes
                    or len(annot_tags) != len_tags
                    or len(annot_tracks) != len_tracks
                ):
                    # Upload annotations
                    resp = self.put(
                        self.task_annotation_url(task_id), json=annot_json
                    )
                    resp_json = resp.json()
                    len_shapes = len(resp_json["shapes"])
                    len_tags = len(resp_json["tags"])
                    len_tracks = len(resp_json["tracks"])

        return (
            task_ids,
            job_ids,
            frame_id_map,
            labels_task_map,
            assigned_scalar_attrs,
        )

    def download_annotations(
        self,
        label_schema,
        task_ids,
        job_ids,
        frame_id_map,
        labels_task_map,
        assigned_scalar_attrs,
    ):
        """Download annotations from the CVAT server and parses them into the
        appropriate FiftyOne types.

        Args:
            label_schema: a dictionary containing the description of label
                fields, classes and attribute to annotate
            task_ids: a list of the task ids created by uploading samples
            job_ids: a dictionary mapping task id to a list of job ids created
                for that task
            frame_id_map: a dictionary mapping task id to another map from the
                CVAT frame index of every image to the FiftyOne sample id
                (for videos) and FiftyOne frame id
            labels_task_map: a dictionary mapping label field names to a list
                of tasks created for that label field
            assigned_scalar_attrs: a dictionary mapping the label field name
                of scalar fields to a boolean indicating whether the scalar
                field is being annotated through a dropdown selection of
                through an attribute with a text input box named "value"

        Returns:
            the label results dict
        """
        results = {}

        rev_labels_task_map = {}
        for lf, tasks in labels_task_map.items():
            for task in tasks:
                rev_labels_task_map[task] = lf

        for task_id in task_ids:
            label_field = rev_labels_task_map[task_id]
            current_schema = label_schema[label_field]
            label_type = current_schema["type"]
            _scalar_attrs = assigned_scalar_attrs.get(label_field, False)

            # Download task data
            task_resp = self.get(self.task_url(task_id))
            task_json = task_resp.json()
            attr_id_map = {}
            class_map = {}
            labels = task_json["labels"]
            for label in labels:
                class_map[label["id"]] = label["name"]
                attr_id_map[label["id"]] = dict(
                    [(i["name"], i["id"]) for i in label["attributes"]]
                )

            response = self.get(self.task_annotation_url(task_id))
            resp_json = response.json()
            shapes = resp_json["shapes"]
            tags = resp_json["tags"]
            tracks = resp_json["tracks"]

            data_resp = self.get(self.task_data_meta_url(task_id))
            frames = data_resp.json()["frames"]

            # Parse annotations into FiftyOne labels
            label_field_results = {}

            tag_results = self._parse_shapes_tags(
                "tags",
                tags,
                frame_id_map[task_id],
                label_type,
                class_map,
                attr_id_map,
                frames,
                assigned_scalar_attrs=_scalar_attrs,
            )
            label_field_results = self._merge_results(
                label_field_results, tag_results
            )

            shape_results = self._parse_shapes_tags(
                "shapes",
                shapes,
                frame_id_map[task_id],
                label_type,
                class_map,
                attr_id_map,
                frames,
                assigned_scalar_attrs=_scalar_attrs,
            )
            label_field_results = self._merge_results(
                label_field_results, shape_results
            )

            for track_index, track in enumerate(tracks):
                label_id = track["label_id"]
                shapes = track["shapes"]
                for shape in shapes:
                    shape["label_id"] = label_id

                track_shape_results = self._parse_shapes_tags(
                    "track",
                    track["shapes"],
                    frame_id_map[task_id],
                    label_type,
                    class_map,
                    attr_id_map,
                    frames,
                    assigned_scalar_attrs=_scalar_attrs,
                    track_index=track_index,
                )
                label_field_results = self._merge_results(
                    label_field_results, track_shape_results
                )

            results = self._merge_results(
                results, {label_field: label_field_results}
            )

        return results

    def _merge_results(self, results, new_results):
        if isinstance(new_results, dict):
            for key, val in new_results.items():
                if key not in results:
                    results[key] = val
                else:
                    results[key] = self._merge_results(results[key], val)

        return results

    def _parse_shapes_tags(
        self,
        annot_type,
        annots,
        frame_id_map,
        label_type,
        class_map,
        attr_id_map,
        frames,
        assigned_scalar_attrs=False,
        track_index=None,
    ):
        """Parses the shapes or tags from the given CVAT annotations into a
        label results dict.

        Args:
            annot_type: the type of annotations to parse, in
                ``("shapes", "tags", "track")``
            annots: list of shapes or tags
            frame_id_map: dict mapping CVAT frame ids to FiftyOne sample and
                frame uuids
            label_type: expected label type to parse from the given annotations
            class_map: dict mapping CVAT class id to class name
            attr_id_map: dict mapping CVAT class id to a map of attr name to
                attr id
            frames: dictionary of metadata per frame
            assign_scalar_attrs (False): boolean indicating whether scalars are
                annotated as text field attributes or a dropdown of classes
            track_index (None): object index to assign to all shapes in
                `annots`

        Returns:
            a label results dict
        """
        results = {}

        prev_type = None

        # For filling in tracked objects
        prev_frame = None
        prev_outside = True
        filled_annots = []

        for annot in annots:
            # Iterate through all keyframes in this track
            # Fill in shapes for all frames between keyframes that are not
            # outside of the frame
            # For non-track annotation, this is skipped
            frame = annot["frame"]
            if (
                prev_frame is not None
                and (frame - 1) > prev_frame
                and not prev_outside
            ):
                # For tracks, fill in previous missing frames if shape was not
                # outside
                for f in range(prev_frame + 1, frame):
                    filled_annot = deepcopy(prev_annot)
                    filled_annot["frame"] = f
                    filled_annots.append(filled_annot)

            prev_annot = annot
            prev_frame = frame
            if "outside" in annot:
                prev_outside = annot["outside"]
            else:
                prev_outside = True

            if "outside" in annot and annot["outside"]:
                # If a tracked object is not in the frame
                continue

            results, prev_type = self._parse_annotation(
                annot,
                results,
                annot_type,
                prev_type,
                frame_id_map,
                label_type,
                class_map,
                attr_id_map,
                frames,
                assigned_scalar_attrs=assigned_scalar_attrs,
                track_index=track_index,
            )

        if (
            prev_frame is not None
            and prev_frame + 1 < len(frame_id_map)
            and not prev_outside
        ):
            # The last track annotation goes to the end of the video, so fill
            # all remaining frames
            for f in range(prev_frame + 1, len(frame_id_map)):
                filled_annot = deepcopy(prev_annot)
                filled_annot["frame"] = f
                filled_annots.append(filled_annot)

        for annot in filled_annots:
            # Create labels for all non-key frames of this track
            # This is skipped for non-track annotations
            results, prev_type = self._parse_annotation(
                annot,
                results,
                annot_type,
                prev_type,
                frame_id_map,
                label_type,
                class_map,
                attr_id_map,
                frames,
                assigned_scalar_attrs=assigned_scalar_attrs,
                track_index=track_index,
            )

        return results

    def _parse_annotation(
        self,
        annot,
        results,
        annot_type,
        prev_type,
        frame_id_map,
        expected_label_type,
        class_map,
        attr_id_map,
        frames,
        assigned_scalar_attrs=False,
        track_index=None,
    ):
        frame = annot["frame"]
        if len(frames) > frame:
            metadata = frames[frame]
        else:
            metadata = frames[0]

        sample_id = frame_id_map[frame]["sample_id"]
        store_frame = False
        if "frame_id" in frame_id_map[frame]:
            store_frame = True
            frame_id = frame_id_map[frame]["frame_id"]

        label = None

        if annot_type in ("shapes", "track"):
            shape_type = annot["type"]
            if expected_label_type == "scalar" and assigned_scalar_attrs:
                # Shapes created with values, set class to value
                annot_attrs = annot["attributes"]
                class_val = False
                if len(annot_attrs) > 0 and "value" in annot_attrs[0]:
                    class_val = annot_attrs[0]["value"]
                    annot["attributes"] = []

            cvat_shape = CVATShape(
                annot, class_map, attr_id_map, metadata, index=track_index
            )
            if shape_type == "rectangle":
                label_type = "detections"
                label = cvat_shape.to_detection()
            elif shape_type == "polygon":
                label_type = "polylines"
                label = cvat_shape.to_polyline(closed=True, filled=True)
                if expected_label_type in ("detection", "detections"):
                    label_type = "detections"
                    label = cvat_shape.polyline_to_detection(label)
            elif shape_type == "polyline":
                label_type = "polylines"
                label = cvat_shape.to_polyline()
            elif shape_type == "points":
                label_type = "keypoints"
                label = cvat_shape.to_keypoint()

            if expected_label_type == "scalar" and assigned_scalar_attrs:
                if class_val and label is not None:
                    # Shapes created with values, set class to value
                    label.label = class_val

        if annot_type == "tags":
            if expected_label_type == "scalar":
                label_type = "scalar"
                if assigned_scalar_attrs:
                    attrs = annot["attributes"]
                    label = _parse_attribute(attrs[0]["value"])
                    if (
                        prev_type is not None
                        and label is not None
                        and type(label) != prev_type
                    ):
                        if prev_type == str:
                            label = str(label)
                        else:
                            logger.warning(
                                "Skipping scalar '%s' that does not match "
                                "previous scalars of type %s",
                                label,
                                str(prev_type),
                            )
                            label = None
                    else:
                        prev_type = type(label)
                else:
                    label = class_map[annot["label_id"]]
            else:
                label_type = "classifications"
                cvat_tag = CVATTag(annot, class_map, attr_id_map)
                label = cvat_tag.to_classification()

        if label is None:
            return results, prev_type

        if label_type not in results:
            results[label_type] = {}

        if sample_id not in results[label_type]:
            results[label_type][sample_id] = {}

        if store_frame:
            if frame_id not in results[label_type][sample_id]:
                results[label_type][sample_id][frame_id] = {}

            if label_type == "scalar":
                results[label_type][sample_id][frame_id] = label
            else:
                results[label_type][sample_id][frame_id][label.id] = label
        else:
            if label_type == "scalar":
                results[label_type][sample_id] = label
            else:
                results[label_type][sample_id][label.id] = label

        return results, prev_type

    def _parse_arg(self, arg, config_arg):
        if arg is None:
            return config_arg

        return arg

    def _construct_cvat_attributes(self, attributes):
        cvat_attrs = {}
        for attr_name, info in attributes.items():
            cvat_attr = {"name": attr_name, "mutable": True}
            for attr_key, val in info.items():
                if attr_key == "type":
                    cvat_attr["input_type"] = val
                elif attr_key == "values":
                    cvat_attr["values"] = [str(v) for v in val]
                elif attr_key == "default":
                    cvat_attr["default_value"] = str(val)

            cvat_attrs[attr_name] = cvat_attr

        return cvat_attrs

    def _create_shapes_tags_tracks(
        self,
        samples,
        label_field,
        label_type,
        attr_names,
        classes,
        is_shape=False,
        load_tracks=False,
        assign_scalar_attrs=False,
    ):
        tags_or_shapes = []
        tracks = {}

        # If a FiftyOne Attribute is being uploaded, "attribute:" is prepended
        # to the name. This needs to be updated in the labels when creating a
        # new task
        remapped_attr_names = {}

        if is_shape:
            samples.compute_metadata()

        frame_id = -1
        for sample in samples:
            metadata = sample.metadata
            sample_id = sample.id
            is_video = False
            if samples.media_type == fom.VIDEO:
                is_video = True
                images = sample.frames.values()
                if label_field.startswith("frames."):
                    label_field = label_field[len("frames.") :]
                if is_shape:
                    width = metadata.frame_width
                    height = metadata.frame_height
            else:
                images = [sample]
                if is_shape:
                    width = metadata.width
                    height = metadata.height

            for image in images:
                frame_id += 1
                try:
                    image_label = image[label_field]
                except:
                    continue

                if image_label is None:
                    continue

                if label_type in ("classification", "classifications"):
                    if label_type == "classifications":
                        classifications = image_label.classifications
                    else:
                        classifications = [image_label]

                    for cls in classifications:
                        (
                            attributes,
                            class_name,
                            remapped_attrs,
                        ) = self._create_attributes(cls, attr_names, classes,)
                        if class_name is None:
                            continue

                        remapped_attr_names.update(remapped_attrs)
                        tags_or_shapes.append(
                            {
                                "label_id": class_name,
                                "group": 0,
                                "frame": frame_id,
                                "source": "manual",
                                "attributes": attributes,
                            }
                        )
                elif label_type == "scalar":
                    if assign_scalar_attrs:
                        attributes = [
                            {
                                "spec_id": attr_names[0],
                                "value": str(image_label),
                            }
                        ]
                        class_name = label_field
                    else:
                        attributes = []
                        class_name = str(image_label)

                    tags_or_shapes.append(
                        {
                            "label_id": class_name,
                            "group": 0,
                            "frame": frame_id,
                            "source": "manual",
                            "attributes": attributes,
                        }
                    )
                else:
                    if label_type == "detection":
                        labels = [image_label]
                        func = self._create_detection_shapes
                    elif label_type == "detections":
                        labels = image_label.detections
                        func = self._create_detection_shapes
                    elif label_type == "polyline":
                        labels = [image_label]
                        func = self._create_polyline_shapes
                    elif label_type == "polylines":
                        labels = image_label.polylines
                        func = self._create_polyline_shapes
                    elif label_type == "keypoint":
                        labels = [image_label]
                        func = self._create_keypoint_shapes
                    elif label_type == "keypoints":
                        labels = image_label.keypoints
                        func = self._create_keypoint_shapes
                    else:
                        raise ValueError(
                            "Label type %s of field %s is not supported"
                            % (label_type, label_field)
                        )

                    shapes, new_tracks, remapped_attrs = func(
                        labels,
                        width,
                        height,
                        attr_names,
                        classes,
                        frame_id=frame_id,
                        load_tracks=load_tracks,
                    )
                    remapped_attr_names.update(remapped_attrs)
                    tags_or_shapes.extend(shapes)
                    tracks = self._update_tracks(tracks, new_tracks)

        if load_tracks:
            formatted_tracks = self._format_tracks(tracks, frame_id)
            return tags_or_shapes, formatted_tracks, remapped_attr_names

        return tags_or_shapes, remapped_attr_names

    def _format_tracks(self, tracks, num_frames):
        formatted_tracks = []
        for index_tracks in tracks.values():
            for track in index_tracks.values():
                # Last shapes are copied and set to `outside`
                last_shape = track["shapes"][-1]
                if last_shape["frame"] < num_frames - 1:
                    new_shape = deepcopy(last_shape)
                    new_shape["frame"] += 1
                    new_shape["outside"] = True
                    track["shapes"].append(new_shape)

                formatted_tracks.append(track)

        return formatted_tracks

    def _update_tracks(self, tracks, new_tracks):
        for class_name, track_info in new_tracks.items():
            if class_name not in tracks:
                tracks[class_name] = track_info
            else:
                for index, track in track_info.items():
                    if index not in tracks[class_name]:
                        tracks[class_name][index] = track
                    else:
                        tracks[class_name][index]["shapes"].extend(
                            track["shapes"]
                        )
                        if tracks[class_name][index]["frame"] > track["frame"]:
                            tracks[class_name][index]["frame"] = track["frame"]

        return tracks

    def _create_id_mapping(self, samples):
        id_mapping = {}
        for sample in samples:
            sample_id = sample.id
            is_video = False
            if samples.media_type == fom.VIDEO:
                is_video = True
                images = sample.frames.values()
            else:
                images = [sample]

            for image in images:
                frame_id = len(id_mapping)
                id_mapping[frame_id] = {"sample_id": sample_id}
                if is_video:
                    id_mapping[frame_id]["frame_id"] = image.id

        return id_mapping

    def _create_keypoint_shapes(
        self,
        keypoints,
        width,
        height,
        attr_names,
        classes,
        frame_id=0,
        load_tracks=False,
    ):
        shapes = []
        tracks = {}
        remapped_attr_names = {}
        for kp in keypoints:
            attributes, class_name, remapped_attrs = self._create_attributes(
                kp, attr_names, classes
            )
            if class_name is None:
                continue

            remapped_attr_names.update(remapped_attrs)
            points = kp.points
            abs_points = HasCVATPoints._to_abs_points(points, (width, height))
            flattened_points = [
                coord for point in abs_points for coord in point
            ]

            shape = {
                "type": "points",
                "occluded": False,
                "z_order": 0,
                "points": flattened_points,
                "label_id": class_name,
                "group": 0,
                "frame": frame_id,
                "source": "manual",
                "attributes": attributes,
            }
            if load_tracks and kp.index is not None:
                index = kp.index
                if class_name not in tracks:
                    tracks[class_name] = {}

                if index not in tracks[class_name]:
                    tracks[class_name][index] = {}
                    tracks[class_name][index]["label_id"] = class_name
                    tracks[class_name][index]["shapes"] = []
                    tracks[class_name][index]["frame"] = frame_id
                    tracks[class_name][index]["group"] = 0
                    tracks[class_name][index]["attributes"] = []

                shape["outside"] = False
                del shape["label_id"]
                tracks[class_name][index]["shapes"].append(shape)
            else:
                shapes.append(shape)

        return shapes, tracks, remapped_attr_names

    def _create_polyline_shapes(
        self,
        polylines,
        width,
        height,
        attr_names,
        classes,
        frame_id=0,
        load_tracks=False,
    ):
        shapes = []
        tracks = {}
        remapped_attr_names = {}
        for poly in polylines:
            attributes, class_name, remapped_attrs = self._create_attributes(
                poly, attr_names, classes
            )
            if class_name is None:
                continue

            remapped_attr_names.update(remapped_attrs)
            points = poly.points[0]
            abs_points = HasCVATPoints._to_abs_points(points, (width, height))
            flattened_points = [
                coord for point in abs_points for coord in point
            ]

            if poly.closed:
                shape = {
                    "type": "polygon",
                    "occluded": False,
                    "z_order": 0,
                    "points": flattened_points,
                    "label_id": class_name,
                    "group": 0,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": attributes,
                }

            else:
                shape = {
                    "type": "polyline",
                    "occluded": False,
                    "z_order": 0,
                    "points": flattened_points,
                    "label_id": class_name,
                    "group": 0,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": attributes,
                }
            if load_tracks and poly.index is not None:
                index = poly.index
                if class_name not in tracks:
                    tracks[class_name] = {}

                if index not in tracks[class_name]:
                    tracks[class_name][index] = {}
                    tracks[class_name][index]["label_id"] = class_name
                    tracks[class_name][index]["shapes"] = []
                    tracks[class_name][index]["frame"] = frame_id
                    tracks[class_name][index]["group"] = 0
                    tracks[class_name][index]["attributes"] = []

                shape["outside"] = False
                del shape["label_id"]
                tracks[class_name][index]["shapes"].append(shape)
            else:
                shapes.append(shape)

        return shapes, tracks, remapped_attr_names

    def _create_detection_shapes(
        self,
        detections,
        width,
        height,
        attr_names,
        classes,
        frame_id=0,
        load_tracks=False,
    ):
        shapes = []
        tracks = {}
        remapped_attr_names = {}
        for det in detections:
            attributes, class_name, remapped_attrs = self._create_attributes(
                det, attr_names, classes
            )
            if class_name is None:
                continue

            remapped_attr_names.update(remapped_attrs)
            if det.mask is None:
                x, y, w, h = det.bounding_box
                xtl = float(round(x * width))
                ytl = float(round(y * height))
                xbr = float(round((x + w) * width))
                ybr = float(round((y + h) * height))

                bbox = [xtl, ytl, xbr, ybr]

                shape = {
                    "type": "rectangle",
                    "occluded": False,
                    "z_order": 0,
                    "points": bbox,
                    "label_id": class_name,
                    "group": 0,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": attributes,
                }

            else:
                polygon = det.to_polyline()
                points = polygon.points[0]
                abs_points = HasCVATPoints._to_abs_points(
                    points, (width, height)
                )

                flattened_points = [
                    coord for point in abs_points for coord in point
                ]

                shape = {
                    "type": "polygon",
                    "occluded": False,
                    "z_order": 0,
                    "points": flattened_points,
                    "label_id": class_name,
                    "group": 0,
                    "frame": frame_id,
                    "source": "manual",
                    "attributes": attributes,
                }

            if load_tracks and det.index is not None:
                index = det.index
                if class_name not in tracks:
                    tracks[class_name] = {}

                if index not in tracks[class_name]:
                    tracks[class_name][index] = {}
                    tracks[class_name][index]["label_id"] = class_name
                    tracks[class_name][index]["shapes"] = []
                    tracks[class_name][index]["frame"] = frame_id
                    tracks[class_name][index]["group"] = 0
                    tracks[class_name][index]["attributes"] = []

                shape["outside"] = False
                del shape["label_id"]
                tracks[class_name][index]["shapes"].append(shape)
            else:
                shapes.append(shape)

        return shapes, tracks, remapped_attr_names

    def _create_attributes(self, label, attributes, classes):
        label_attrs = []
        remapped_attr_names = {}
        label_attrs.append({"spec_id": "label_id", "value": label.id})
        for attribute in attributes:
            value = None
            if attribute in label:
                value = label[attribute]

            elif "attributes" in label:
                if attribute in label.attributes:
                    value = label.get_attribute_value(attribute, None)
                    new_attribute = "attribute:" + attribute
                    remapped_attr_names[attribute] = new_attribute
                    attribute = new_attribute

            if value is not None:
                label_attrs.append({"spec_id": attribute, "value": str(value)})

        if "label" in label and label["label"] in classes:
            class_name = label["label"]
        else:
            class_name = None

        return label_attrs, class_name, remapped_attr_names

    def _remap_ids(self, shapes_or_tags, attribute_id_map, class_id_map):
        for obj in shapes_or_tags:
            label_name = obj["label_id"]
            class_id = class_id_map[label_name]
            obj["label_id"] = class_id
            attr_id_map = attribute_id_map[class_id]
            for attr in obj["attributes"]:
                attr_name = attr["spec_id"]
                attr["spec_id"] = attr_id_map[attr_name]

        return shapes_or_tags

    def _remap_track_ids(self, tracks, attribute_id_map, class_id_map):
        for track in tracks:
            label_name = track["label_id"]
            class_id = class_id_map[label_name]
            track["label_id"] = class_id
            attr_id_map = attribute_id_map[class_id]
            for shape in track["shapes"]:
                for attr in shape["attributes"]:
                    attr_name = attr["spec_id"]
                    attr["spec_id"] = attr_id_map[attr_name]

        return tracks

    def _validate(self, response, kwargs):
        try:
            response.raise_for_status()
        except:
            d = response.__dict__
            logger.info("Arguments the caused this error were:")
            logger.info(kwargs)
            raise Exception(
                "%d error for request %s to url %s with the reason %s. Error "
                "content: %s"
                % (
                    d["status_code"],
                    d["request"],
                    d["url"],
                    d["reason"],
                    d["_content"],
                )
            )


class CVATLabel(object):
    """A class to convert labels returned from the CVAT API to FiftyOne labels
    and the associated attributes.

    Args:
        label_dict: the dictionary containing the label information loaded from
            the CVAT API
        class_map: a dictionary mapping label ids to class strings
        attr_id_map: a dictionary mapping attribute ids attribute names for
            every label
    """

    def __init__(self, label_dict, class_map, attr_id_map):
        label_id = label_dict["label_id"]
        self.label_id = label_id
        self.class_name = class_map[label_id]
        self.attributes = {}
        attr_id_map_rev = {v: k for k, v in attr_id_map[label_id].items()}

        for attr in label_dict["attributes"]:
            name = attr_id_map_rev[attr["spec_id"]]
            val = _parse_attribute(attr["value"])
            if val is not None and val != "":
                self.attributes[name] = CVATAttribute(name=name, value=val)

        self.fo_attributes = {}

        for attr_name, attribute in self.attributes.items():
            if attr_name.startswith("attribute:"):
                name = attr_name.replace("attribute:", "")
                attribute.name = name
                if attribute.value is not None:
                    self.fo_attributes[name] = attribute.to_attribute()

    def update_attrs(self, label):
        """Iterates through attributes of the current label and replaces the
        label id with the "label_id" stored in the CVAT attributes if it
        exists as well as storing all loaded attributes that do not start with
        "attribute:".

        Args:
            label: the :class:`fiftyone.core.labels.Label` instance for which
                to update the attributes

        Returns:
            the updated :class:`fiftyone.core.labels.Label`
        """
        if "label_id" in self.attributes:
            label_id = self.attributes["label_id"].value
            is_uuid = False
            try:
                label_id = ObjectId(label_id)
                is_uuid = True
            except:
                pass

            if label_id is not None and is_uuid:
                label._id = label_id

        for attr_name, attribute in self.attributes.items():
            if attr_name != "label_id" and not attr_name.startswith(
                "attribute:"
            ):
                label[attr_name] = attribute.value

        return label


class CVATShape(CVATLabel):
    """A class to convert labels returned from the CVAT API to FiftyOne labels
    and the associated attributes specifically for label types that require
    spatial metadata.

    Args:
        label_dict: the dictionary containing the label information loaded from
            the CVAT API
        class_map: a dictionary mapping label ids to class strings
        attr_id_map: a dictionary mapping attribute ids attribute names for
            every label
    """

    def __init__(
        self, label_dict, class_map, attr_id_map, metadata, index=None
    ):
        super().__init__(label_dict, class_map, attr_id_map)
        self.width = metadata["width"]
        self.height = metadata["height"]
        self.points = label_dict["points"]
        self.index = index

    def _to_pairs_of_points(self, points):
        reshaped_points = np.reshape(points, (-1, 2))
        return reshaped_points.tolist()

    def to_detection(self):
        """Converts the `CVATLabel` to a
        :class:`fiftyone.core.labels.Detection`

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        xtl, ytl, xbr, ybr = self.points
        bbox = [
            xtl / self.width,
            ytl / self.height,
            (xbr - xtl) / self.width,
            (ybr - ytl) / self.height,
        ]
        label = fol.Detection(
            label=self.class_name,
            bounding_box=bbox,
            attributes=self.fo_attributes,
        )
        label = self.update_attrs(label)
        if self.index is not None:
            label.index = self.index
        return label

    def to_polyline(self, closed=False, filled=False):
        """Converts the `CVATLabel` to a
        :class:`fiftyone.core.labels.Polyline`

        Returns:
            a :class:`fiftyone.core.labels.Polyline`
        """
        points = self._to_pairs_of_points(self.points)
        frame_size = (self.width, self.height)
        rel_points = HasCVATPoints._to_rel_points(points, frame_size)
        label = fol.Polyline(
            label=self.class_name,
            points=[rel_points],
            closed=closed,
            filled=filled,
            attributes=self.fo_attributes,
        )
        label = self.update_attrs(label)
        if self.index is not None:
            label.index = self.index
        return label

    def to_keypoint(self):
        """Converts the `CVATLabel` to a
        :class:`fiftyone.core.labels.Keypoint`

        Returns:
            a :class:`fiftyone.core.labels.Keypoint`
        """
        points = self._to_pairs_of_points(self.points)
        frame_size = (self.width, self.height)
        rel_points = HasCVATPoints._to_rel_points(points, frame_size)
        label = fol.Keypoint(
            label=self.class_name,
            points=rel_points,
            attributes=self.fo_attributes,
        )
        label = self.update_attrs(label)
        if self.index is not None:
            label.index = self.index
        return label

    def polyline_to_detection(self, label):
        """Converts the `CVATLabel` to a
        :class:`fiftyone.core.labels.Detection` with a segmentation mask
        created from the polyline annotation

        Returns:
            a :class:`fiftyone.core.labels.Detection`
        """
        new_fields = label._fields
        default_fields = type(label)._fields_ordered
        label = label.to_detection(frame_size=(self.width, self.height))

        for field, value in new_fields.items():
            if field not in default_fields:
                label[field] = value
        return label


class CVATTag(CVATLabel):
    """A class to convert labels returned from the CVAT API to FiftyOne labels
    and the associated attributes specifically for classifications.
    """

    def to_classification(self):
        """Converts the `CVATLabel` to a
        :class:`fiftyone.core.labels.Classification`

        Returns:
            a :class:`fiftyone.core.labels.Classification`
        """
        label = fol.Classification(
            label=self.class_name, attributes=self.fo_attributes
        )
        label = self.update_attrs(label)
        return label


def load_cvat_image_annotations(xml_path):
    """Loads the CVAT image annotations from the given XML file.

    See :ref:`this page <CVATImageDataset-import>` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a tuple of

        -   **info**: a dict of dataset info
        -   **cvat_task_labels**: a :class:`CVATTaskLabels` instance
        -   **cvat_images**: a list of :class:`CVATImage` instances
    """
    d = fou.load_xml_as_json_dict(xml_path)
    annotations = d.get("annotations", {})

    # Verify version
    version = annotations.get("version", None)
    if version is None:
        logger.warning("No version tag found; assuming version 1.1")
    elif version != "1.1":
        logger.warning(
            "Only version 1.1 is explicitly supported; found %s. Trying to "
            "load assuming version 1.1 format",
            version,
        )

    # Load meta
    meta = annotations.get("meta", {})

    # Load task labels
    task = meta.get("task", {})
    labels_dict = task.get("labels", {})
    cvat_task_labels = CVATTaskLabels.from_labels_dict(labels_dict)

    # Load annotations
    image_dicts = _ensure_list(annotations.get("image", []))
    cvat_images = [CVATImage.from_image_dict(id) for id in image_dicts]

    # Load dataset info
    info = {"task_labels": cvat_task_labels.labels}
    if "created" in task:
        info["created"] = task["created"]

    if "updated" in task:
        info["updated"] = task["updated"]

    if "dumped" in meta:
        info["dumped"] = meta["dumped"]

    return info, cvat_task_labels, cvat_images


def load_cvat_video_annotations(xml_path):
    """Loads the CVAT video annotations from the given XML file.

    See :ref:`this page <CVATVideoDataset-import>` for format details.

    Args:
        xml_path: the path to the annotations XML file

    Returns:
        a tuple of

        -   **info**: a dict of dataset info
        -   **cvat_task_labels**: a :class:`CVATTaskLabels` instance
        -   **cvat_tracks**: a list of :class:`CVATTrack` instances
    """
    d = fou.load_xml_as_json_dict(xml_path)
    annotations = d.get("annotations", {})

    # Verify version
    version = annotations.get("version", None)
    if version is None:
        logger.warning("No version tag found; assuming version 1.1")
    elif version != "1.1":
        logger.warning(
            "Only version 1.1 is explicitly supported; found %s. Trying to "
            "load assuming version 1.1 format",
            version,
        )

    # Load meta
    meta = annotations.get("meta", {})

    # Load task labels
    task = meta.get("task", {})
    labels_dict = task.get("labels", {})
    cvat_task_labels = CVATTaskLabels.from_labels_dict(labels_dict)

    # Load annotations
    track_dicts = _ensure_list(annotations.get("track", []))
    if track_dicts:
        original_size = task["original_size"]
        frame_size = (
            int(original_size["width"]),
            int(original_size["height"]),
        )
        cvat_tracks = [
            CVATTrack.from_track_dict(td, frame_size) for td in track_dicts
        ]
    else:
        cvat_tracks = []

    # Load dataset info
    info = {"task_labels": cvat_task_labels.labels}
    if "created" in task:
        info["created"] = task["created"]

    if "updated" in task:
        info["updated"] = task["updated"]

    if "dumped" in meta:
        info["dumped"] = meta["dumped"]

    return info, cvat_task_labels, cvat_tracks


def _is_supported_attribute_type(value):
    return (
        isinstance(value, bool) or etau.is_str(value) or etau.is_numeric(value)
    )


def _cvat_tracks_to_frames_dict(cvat_tracks):
    frames = defaultdict(dict)
    for cvat_track in cvat_tracks:
        labels = cvat_track.to_labels()
        for frame_number, label in labels.items():
            frame = frames[frame_number]

            if isinstance(label, fol.Detection):
                if "detections" not in frame:
                    frame["detections"] = fol.Detections()

                frame["detections"].detections.append(label)
            elif isinstance(label, fol.Polyline):
                if "polylines" not in frame:
                    frame["polylines"] = fol.Polylines()

                frame["polylines"].polylines.append(label)
            elif isinstance(label, fol.Keypoint):
                if "keypoints" not in frame:
                    frame["keypoints"] = fol.Keypoints()

                frame["keypoints"].keypoints.append(label)

    return frames


def _frames_to_cvat_tracks(frames, frame_size):
    labels_map = defaultdict(dict)
    no_index_map = defaultdict(list)
    found_label = False

    def process_label(label, frame_number):
        if label.index is not None:
            labels_map[label.index][frame_number] = label
        else:
            no_index_map[frame_number].append(label)

    # Convert from per-frame to per-object tracks
    for frame_number, frame_dict in frames.items():
        for _, value in frame_dict.items():
            if isinstance(value, (fol.Detection, fol.Polyline, fol.Keypoint)):
                found_label = True
                process_label(value, frame_number)
            elif isinstance(value, fol.Detections):
                found_label = True
                for detection in value.detections:
                    process_label(detection, frame_number)
            elif isinstance(value, fol.Polylines):
                found_label = True
                for polyline in value.polylines:
                    process_label(polyline, frame_number)
            elif isinstance(value, fol.Keypoints):
                found_label = True
                for keypoint in value.keypoints:
                    process_label(keypoint, frame_number)
            elif value is not None:
                msg = "Ignoring unsupported label type '%s'" % value.__class__
                warnings.warn(msg)

    if not found_label:
        return None  # unlabeled

    cvat_tracks = []

    # Generate object tracks
    max_index = -1
    for index in sorted(labels_map):
        max_index = max(index, max_index)
        labels = labels_map[index]
        cvat_track = CVATTrack.from_labels(index, labels, frame_size)
        cvat_tracks.append(cvat_track)

    # Generate single tracks for detections with no `index`
    index = max_index
    for frame_number, labels in no_index_map.items():
        for label in labels:
            index += 1
            cvat_track = CVATTrack.from_labels(
                index, {frame_number: label}, frame_size
            )
            cvat_tracks.append(cvat_track)

    return cvat_tracks


def _get_single_polyline_points(polyline):
    num_polylines = len(polyline.points)
    if num_polylines == 0:
        return []

    if num_polylines > 0:
        msg = (
            "Found polyline with more than one shape; only the first shape "
            "will be stored in CVAT format"
        )
        warnings.warn(msg)

    return polyline.points[0]


def _ensure_list(value):
    if value is None:
        return []

    if isinstance(value, list):
        return value

    return [value]


def _parse_attribute(value):
    if value in {"True", "true"}:
        return True

    if value in {"False", "false"}:
        return False

    try:
        return int(value)
    except:
        pass

    try:
        return float(value)
    except:
        pass

    if value == "None":
        return None

    return value
