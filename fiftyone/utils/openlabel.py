"""
Utilities for working with datasets in
`OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import enum
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud
import fiftyone.utils.labels as foul


logger = logging.getLogger(__name__)


class SegmentationType(enum.Enum):
    """The FiftyOne label type to load segmentations into"""

    INSTANCE = 1
    POLYLINE = 2
    SEMANTIC = 3


class OpenLABELImageDatasetImporter(
    foud.LabeledImageDatasetImporter, foud.ImportPathsMixin
):
    """Importer for OpenLABEL image datasets stored on disk.

    See :ref:`this page <OpenLABELImageDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
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
            -   a dict mapping file_ids to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   a folder name like ``"labels"`` or ``"labels/"`` specifying a
                subfolder of ``dataset_dir`` where the multiple label files
                reside
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to looking for ``labels.json``
            and ``label/``
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "segmentations", "keypoints")``.
            By default, all labels are loaded
        use_polylines (False): whether to represent segmentations as
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections` with dense masks
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        label_types=None,
        use_polylines=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        _label_types = _parse_label_types(label_types)

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self._label_types = _label_types
        self.use_polylines = use_polylines

        self._info = None
        self._image_paths_map = None
        self._annotations = None
        self._file_ids = None
        self._iter_file_ids = None

    def __iter__(self):
        self._iter_file_ids = iter(self._file_ids)
        return self

    def __len__(self):
        return len(self._file_ids)

    def __next__(self):
        file_id = next(self._iter_file_ids)

        if os.path.isfile(file_id):
            sample_path = file_id
        elif _remove_ext(file_id) in self._image_paths_map:
            sample_path = self._image_paths_map[_remove_ext(file_id)]
        else:
            sample_path = self._image_paths_map[
                _remove_ext(os.path.basename(file_id))
            ]

        stream = self._annotations.get_stream(file_id)
        height, width = stream.height, stream.width

        if height is None or width is None:
            sample_metadata = fomt.ImageMetadata.build_for(sample_path)
            height, width = sample_metadata["height"], sample_metadata["width"]
        else:
            sample_metadata = fomt.ImageMetadata(width=width, height=height)

        frame_size = (width, height)
        objects = self._annotations.get_objects(file_id)
        seg_type = (
            SegmentationType.POLYLINE
            if self.use_polylines
            else SegmentationType.INSTANCE
        )
        label = objects.to_labels(frame_size, self._label_types, seg_type)

        if self._has_scalar_labels:
            label = next(iter(label.values())) if label else None

        return sample_path, sample_metadata, label

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def _has_scalar_labels(self):
        return len(self._label_types) == 1

    @property
    def label_cls(self):
        seg_type = fol.Polylines if self.use_polylines else fol.Detections
        types = {
            "detections": fol.Detections,
            "segmentations": seg_type,
            "keypoints": fol.Keypoints,
        }

        if self._has_scalar_labels:
            return types[self._label_types[0]]

        return {k: v for k, v in types.items() if k in self._label_types}

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        file_ids = []
        annotations = OpenLABELAnnotations(fom.IMAGE)

        if self.labels_path is not None:
            labels_path = fou.normpath(self.labels_path)

            base_dir = None
            if os.path.isfile(labels_path):
                label_paths = [labels_path]
            elif os.path.isdir(labels_path):
                base_dir = labels_path
            elif os.path.basename(
                labels_path
            ) == "labels.json" and os.path.isdir(_remove_ext(labels_path)):
                base_dir = _remove_ext(labels_path)
            else:
                label_paths = []

            if base_dir is not None:
                label_paths = etau.list_files(base_dir, recursive=True)
                label_paths = [l for l in label_paths if l.endswith(".json")]

            for label_path in label_paths:
                file_ids.extend(annotations.parse_labels(base_dir, label_path))

        file_ids = _validate_file_ids(file_ids, image_paths_map)

        self._info = {}
        self._image_paths_map = image_paths_map
        self._annotations = annotations
        self._file_ids = file_ids

    def get_dataset_info(self):
        return self._info


class OpenLABELVideoDatasetImporter(
    foud.LabeledVideoDatasetImporter, foud.ImportPathsMixin
):
    """Importer for OpenLABEL video datasets stored on disk.

    See :ref:`this page <OpenLABELVideoDataset-import>` for format details.

    Args:
        dataset_dir (None): the dataset directory. If omitted, ``data_path``
            and/or ``labels_path`` must be provided
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
            -   a dict mapping file_ids to absolute filepaths

            If None, this parameter will default to whichever of ``data/`` or
            ``data.json`` exists in the dataset directory
        labels_path (None): an optional parameter that enables explicit control
            over the location of the labels. Can be any of the following:

            -   a filename like ``"labels.json"`` specifying the location of
                the labels in ``dataset_dir``
            -   a folder name like ``"labels"`` or ``"labels/"`` specifying a
                subfolder of ``dataset_dir`` where the multiple label files
                reside
            -   an absolute filepath to the labels. In this case,
                ``dataset_dir`` has no effect on the location of the labels

            If None, the parameter will default to looking for ``labels.json``
            and ``labels/``
        label_types (None): a label type or list of label types to load. The
            supported values are
            ``("detections", "segmentations", "keypoints")``.
            By default, all labels are loaded
        use_polylines (False): whether to represent segmentations as
            :class:`fiftyone.core.labels.Polylines` instances rather than
            :class:`fiftyone.core.labels.Detections` with dense masks
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to load
    """

    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        label_types=None,
        use_polylines=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        if dataset_dir is None and data_path is None and labels_path is None:
            raise ValueError(
                "At least one of `dataset_dir`, `data_path`, and "
                "`labels_path` must be provided"
            )

        data_path = self._parse_data_path(
            dataset_dir=dataset_dir,
            data_path=data_path,
            default="data/",
        )

        labels_path = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels.json",
        )

        _label_types = _parse_label_types(label_types)

        super().__init__(
            dataset_dir=dataset_dir,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )

        self.data_path = data_path
        self.labels_path = labels_path
        self._label_types = _label_types
        self.use_polylines = use_polylines

        self._info = None
        self._video_paths_map = None
        self._annotations = None
        self._file_ids = None
        self._iter_file_ids = None

    def __iter__(self):
        self._iter_file_ids = iter(self._file_ids)
        return self

    def __len__(self):
        return len(self._file_ids)

    def __next__(self):
        file_id = next(self._iter_file_ids)

        if os.path.isfile(file_id):
            sample_path = file_id
        elif _remove_ext(file_id) in self._video_paths_map:
            sample_path = self._video_paths_map[_remove_ext(file_id)]
        else:
            sample_path = self._video_paths_map[
                _remove_ext(os.path.basename(file_id))
            ]

        stream = self._annotations.get_stream(file_id)
        height, width = stream.height, stream.width

        if height is None or width is None:
            sample_metadata = fomt.VideoMetadata.build_for(sample_path)
            height, width = (
                sample_metadata["frame_height"],
                sample_metadata["frame_width"],
            )
        else:
            sample_metadata = fomt.VideoMetadata(
                frame_width=width, frame_height=height
            )

        frame_size = (width, height)
        frames = self._annotations.get_objects(file_id)
        seg_type = (
            SegmentationType.POLYLINE
            if self.use_polylines
            else SegmentationType.INSTANCE
        )
        frame_labels = frames.to_labels(
            frame_size, self._label_types, seg_type
        )

        return sample_path, sample_metadata, None, frame_labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_video_metadata(self):
        return True

    @property
    def _has_scalar_labels(self):
        return len(self._label_types) == 1

    @property
    def label_cls(self):
        seg_type = fol.Polylines if self.use_polylines else fol.Detections
        types = {
            "detections": fol.Detections,
            "segmentations": seg_type,
            "keypoints": fol.Keypoints,
        }

        if self._has_scalar_labels:
            return types[self._label_types[0]]

        return {k: v for k, v in types.items() if k in self._label_types}

    def setup(self):
        video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        file_ids = []
        annotations = OpenLABELAnnotations(fom.VIDEO)

        if self.labels_path is not None:
            labels_path = fou.normpath(self.labels_path)

            base_dir = None
            if os.path.isfile(labels_path):
                label_paths = [labels_path]
            elif os.path.isdir(labels_path):
                base_dir = labels_path
            elif os.path.basename(
                labels_path
            ) == "labels.json" and os.path.isdir(_remove_ext(labels_path)):
                base_dir = _remove_ext(labels_path)
            else:
                label_paths = []

            if base_dir is not None:
                label_paths = etau.list_files(base_dir, recursive=True)
                label_paths = [l for l in label_paths if l.endswith(".json")]

            for label_path in label_paths:
                file_ids.extend(annotations.parse_labels(base_dir, label_path))

        file_ids = _validate_file_ids(file_ids, video_paths_map)

        self._info = {}
        self._video_paths_map = video_paths_map
        self._annotations = annotations
        self._file_ids = file_ids

    def get_dataset_info(self):
        return self._info


class OpenLABELAnnotations(object):
    """Annotations parsed from OpenLABEL format able to be converted to
    FiftyOne labels.

    Args:
        media_type: whether the annotations correspond to images
            (``fiftyone.core.media.IMAGE``) or videos
            (``fiftyone.core.media.VIDEO``)
    """

    def __init__(self, media_type):
        self.is_video = media_type == fom.VIDEO
        self.objects = {}
        self.streams = {}
        self.metadata = {}
        self.uri_to_streams = {}

    def parse_labels(self, base_dir, labels_path):
        """Parses a single OpenLABEL labels file.

        Args:
            base_dir: path to the directory containing the labels file
            labels_path: path to the labels json file

        Returns:
            a list of potential file_ids that the parsed labels correspond to
        """
        abs_path = labels_path
        if not os.path.isabs(abs_path):
            abs_path = os.path.join(base_dir, labels_path)

        labels = etas.load_json(abs_path).get("openlabel", {})
        label_file_id = _remove_ext(labels_path)
        potential_file_ids = [label_file_id]

        metadata = OpenLABELMetadata(labels.get("metadata", {}))
        self.metadata[label_file_id] = metadata
        potential_file_ids.extend(metadata.parse_potential_file_ids())

        if self.is_video:
            object_parser = OpenLABELFramesParser()
        else:
            object_parser = OpenLABELObjectsParser()

        self._parse_streams(labels, label_file_id)
        self._parse_objects(labels, object_parser)
        self._parse_frames(labels, label_file_id, object_parser)
        self._store_objects(object_parser, label_file_id, potential_file_ids)

        potential_file_ids.extend(self._update_stream_uris(label_file_id))

        return potential_file_ids

    def _update_stream_uris(self, label_file_id):
        file_ids = self.streams[label_file_id].uris
        for uri in file_ids:
            self.uri_to_streams[uri] = label_file_id

        return file_ids

    def _parse_streams(self, labels, label_file_id):
        self.streams[label_file_id] = OpenLABELStreams()
        for stream_name, stream_info in labels.get("streams", {}).items():
            self.streams[label_file_id].add_stream_dict(
                stream_name, stream_info
            )

    def _parse_objects(self, labels, parser):
        for obj_id, obj_d in labels.get("objects", {}).items():
            parser.add_object_dict(obj_id, obj_d)

    def _store_objects(self, parser, label_file_id, potential_file_ids):
        for stream_name, objects in parser.to_stream_objects_map().items():
            _uris = []
            if stream_name is not None:
                stream = self.streams[label_file_id].streams.get(
                    stream_name, None
                )
                if stream:
                    _uris.append(stream.uri)

            for uri in set(_uris + potential_file_ids):
                if uri in self.objects:
                    self.objects[uri].add_objects(objects)
                else:
                    self.objects[uri] = deepcopy(objects)

    def _parse_frames(self, labels, label_file_id, object_parser):
        for frame_ind, frame in labels.get("frames", {}).items():
            frame_number = int(frame_ind) + 1
            _objects = frame.get("objects", {})
            for obj_id, obj_d in _objects.items():
                if self.is_video:
                    object_parser.add_object_dict(
                        obj_id, obj_d, frame_number=frame_number
                    )
                else:
                    object_parser.add_object_dict(obj_id, obj_d)

            _streams = frame.get("frame_properties", {}).get("streams", None)
            if _streams:
                for stream_name, stream_info in _streams.items():
                    self.streams[label_file_id].add_stream_dict(
                        stream_name, stream_info
                    )

    def get_objects(self, uri):
        """Get the :class:`OpenLABELObjects` or :class:`OpenLABELFrames`
        corresponding to a given uri.

        Args:
            uri: the uri of the media for which to get objects

        Returns:
            the :class:`OpenLABELObjects` or :class:`OpenLABELFrames`
            corresponding to the given uri
        """
        if self.is_video:
            return self.objects.get(uri, OpenLABELFrames({}))

        return self.objects.get(uri, OpenLABELObjects([]))

    def get_stream(self, uri):
        """Get the :class:`OpenLABELStream` corresponding to a given uri.

        Args:
            uri: the uri of the media for which to get the stream

        Returns:
            the :class:`OpenLABELStream` corresponding to the given uri
        """
        if uri not in self.uri_to_streams:
            return OpenLABELStream(uri=uri)

        label_file_id = self.uri_to_streams[uri]
        streams = self.streams[label_file_id]
        return streams.get_one_stream(uri)


class OpenLABELParser(object):
    """An interface for :class:`OpenLABELFramesParser` or
    :class:`OpenLABELObjectsParser`.
    """

    def __init__(self):
        self.stream_to_id_map = defaultdict(list)
        self.streamless_objects = set()

    @property
    def _label_type(self):
        raise NotImplementedError("Subclass must implement `_label_type`")

    def _get_objects_for_ids(self, ids):
        raise NotImplementedError(
            "Subclass must impelment `_get_objects_for_ids()`"
        )

    def _parse_object(self, obj, obj_id, obj_d):
        if obj is None:
            obj, frame_numbers = OpenLABELObject.from_anno_dict(obj_id, obj_d)
        else:
            frame_numbers = obj.update_object_dict(obj_d)

        stream = obj.stream
        if stream is None:
            self.streamless_objects.add(obj_id)
        else:
            if obj_id in self.streamless_objects:
                self.streamless_objects.remove(obj_id)

            self.stream_to_id_map[stream].append(obj_id)

        return obj, frame_numbers

    def to_stream_objects_map(self):
        """Get the parsed objects for each stream.

        Returns:
            a dict mapping streams to openLABEL objects or frames
        """
        stream_objects_map = {}
        for stream_name, ids in self.stream_to_id_map.items():
            objects = self._get_objects_for_ids(ids)
            stream_objects_map[stream_name] = self._label_type(objects)

        objects = self._get_objects_for_ids(self.streamless_objects)
        if objects:
            stream_objects_map[None] = self._label_type(objects)

        return stream_objects_map


class OpenLABELObjectsParser(OpenLABELParser):
    """Parses and collects :class:`OpenLABELObjects` from object dictionaries."""

    def __init__(self):
        super().__init__()
        self.objects = {}

    @property
    def _label_type(self):
        return OpenLABELObjects

    def add_object_dict(self, obj_id, obj_d):
        """Parses the given raw object dictionary.

        Args:
            obj_id: the string id of the given object
            obj_d: a dict containing object information to parse
        """
        obj = self.objects.get(obj_id, None)
        obj, _ = self._parse_object(obj, obj_id, obj_d)
        self.objects[obj_id] = obj

    def _get_objects_for_ids(self, ids):
        return [self.objects[i] for i in ids]


class OpenLABELObjects(object):
    """A collection of :class:`OpenLABELObject`.

    Args:
        objects: a list of :class:`OpenLABELObject`
    """

    def __init__(self, objects):
        self.objects = objects

    def _to_labels(self, frame_size, labels_type, obj_to_label):
        labels = []
        for obj in self.objects:
            labels.extend(obj_to_label(obj, frame_size))

        kwargs = {labels_type._LABEL_LIST_FIELD: labels}
        return labels_type(**kwargs)

    def _to_detections(self, frame_size):
        return self._to_labels(
            frame_size,
            fol.Detections,
            OpenLABELObject.to_detections,
        )

    def _to_keypoints(self, frame_size):
        return self._to_labels(
            frame_size,
            fol.Keypoints,
            OpenLABELObject.to_keypoints,
        )

    def _to_polylines(self, frame_size):
        return self._to_labels(
            frame_size,
            fol.Polylines,
            OpenLABELObject.to_polylines,
        )

    def _to_segmentations(
        self, frame_size, seg_type=SegmentationType.INSTANCE
    ):
        polylines = self._to_polylines(frame_size)
        if seg_type == SegmentationType.POLYLINE:
            return polylines

        return polylines.to_detections(frame_size=frame_size)

    def add_objects(self, new_objects):
        """Adds additional OpenLABEL objects to this collection.

        Args:
            new_objects: either a list of :class:`OpenLABELObject` or a
                different :class:`OpenLABELObjects`
        """
        if isinstance(new_objects, OpenLABELObjects):
            self.objects.extend(new_objects.objects)
        else:
            self.objects.extend(new_objects)

    def to_labels(
        self, frame_size, label_types, seg_type=SegmentationType.INSTANCE
    ):
        """Converts the stored :class:`OpenLABELObject` to FiftyOne labels.

        Args:
            frame_size: the size of the image frame in pixels (width, height)
            label_types: a list of label types to load
            seg_type (SegmentationType.INSTANCE): the type to use to store
                segmentations

        Returns:
            a dict mapping the specified label types to FiftyOne labels
        """
        label = {}

        if "detections" in label_types:
            label["detections"] = self._to_detections(frame_size)

        if "keypoints" in label_types:
            label["keypoints"] = self._to_keypoints(frame_size)

        if "segmentations" in label_types:
            label["segmentations"] = self._to_segmentations(
                frame_size, seg_type=seg_type
            )

        return label


class OpenLABELFramesParser(OpenLABELParser):
    """Parses and collects :class:`OpenLABELObject` framewise from object
    dictionaries
    """

    def __init__(self):
        super().__init__()
        self.framewise_objects = defaultdict(dict)

    @property
    def _label_type(self):
        return OpenLABELFrames

    def add_object_dict(self, obj_id, obj_d, frame_number=None):
        """Parses the given raw object dictionary.

        Args:
            obj_id: the string id of the given object
            obj_d: a dict containing object information to parse
            frame_number (None): the frame number corresponding to the given
                object
        """
        obj = self.framewise_objects[frame_number].get(obj_id, None)
        obj, frame_numbers = self._parse_object(obj, obj_id, obj_d)

        if frame_numbers:
            if frame_number is not None:
                frame_numbers.append(frame_number)
                frame_numbers = sorted(set(frame_numbers))
        else:
            frame_numbers = [frame_number]

        for frame_number in frame_numbers:
            if frame_number is not None and self.framewise_objects[None].get(
                obj_id, False
            ):
                del self.framewise_objects[None][obj_id]

            self.framewise_objects[frame_number][obj_id] = deepcopy(obj)

    def _get_objects_for_ids(self, ids):
        frame_objects = {}
        for frame_number, objects in self.framewise_objects.items():
            _objects = [objects[i] for i in ids if i in objects]
            if _objects:
                frame_objects[frame_number] = OpenLABELObjects(_objects)

        return frame_objects


class OpenLABELFrames(object):
    """A collection of :class:`OpenLABELObject` framewise.

    Args:
        frame_objects: a dict mapping frame numbers to
            :class:`OpenLABELObject`
    """

    def __init__(self, frame_objects):
        self.frame_objects = frame_objects

    def to_labels(
        self, frame_size, label_types, seg_type=SegmentationType.POLYLINE
    ):
        """Converts the stored :class:`OpenLABELObject` to FiftyOne labels

        Args:
            frame_size: the size of the image frame in pixels (width, height)
            label_types: a list of label types to load
            seg_type (SegmentationType.INSTANCE): the type to use to store
                segmentations

        Returns:
            a dict mapping frame numbers to dicts mapping the specified label
            types to FiftyOne labels
        """

        frame_labels = {}
        for frame_number, objects in self.frame_objects.items():
            frame_label = {}
            if "detections" in label_types:
                frame_label["detections"] = objects._to_detections(frame_size)

            if "keypoints" in label_types:
                frame_label["keypoints"] = objects._to_keypoints(frame_size)

            if "segmentations" in label_types:
                frame_label["segmentations"] = objects._to_segmentations(
                    frame_size, seg_type=seg_type
                )
            frame_labels[frame_number] = frame_label

        return frame_labels

    def add_objects(self, new_objects):
        """Adds additional OpenLABEL frames to this collection.

        Args:
            new_objects: either a dict of framewise :class`OpenLABELObjects`
                or a different :class:`OpenLABELFrames`
        """

        if isinstance(new_objects, OpenLABELFrames):
            new_objects = new_objects.frame_objects

        for frame_number, objects in new_objects.items():
            if frame_number not in self.frame_objects:
                self.frame_objects[frame_number] = objects
            else:
                self.frame_objects[frame_number].add_objects(objects)


class OpenLABELStreams(object):
    """A collection of OpenLABEL streams."""

    def __init__(self):
        self.streams = {}
        self.uri_to_names_map = defaultdict(list)

    @property
    def uris(self):
        """The list of uris or file_ids corresponding to the streams in this
        collection
        """
        return list(self.uri_to_names_map.keys())

    def add_stream_dict(self, stream_name, stream_d):
        """Parses the given raw stream dictionary.

        Args:
            stream_name: the name of the stream being parsed
            stream_d: a dict containing stream information to parse
        """
        stream = self.streams.get(stream_name, None)
        if stream is None:
            stream = OpenLABELStream.from_anno_dict(stream_name, stream_d)
        else:
            stream.update_stream_dict(stream_d)

        if stream is not None:
            if stream.uri is not None:
                self.uri_to_names_map[stream.uri].append(stream_name)

            self.streams[stream_name] = stream

    def get_one_stream(self, uri):
        """Get the `OpenLABELStream` corresponding to a
        given uri or file_id.

        Args:
            uri: the uri or file_id for which to get the stream

        Returns:
            An `OpenLABELStream`
        """
        stream_names = self.uri_to_names_map[uri]
        if stream_names and stream_names[0] in self.streams:
            return self.streams[stream_names[0]]

        return OpenLABELStream(uri=uri)


class OpenLABELStream(object):
    """An OpenLABEL stream corresponding to one uri or file_id.

    Args:
        name (None): the name of the stream
        type (None): the type of the stream
        description (None): a string description for this stream
        uri (None): the uri or file_id of the media corresponding to this
            stream
        properties (None): a dict of properties for this stream
    """

    _HEIGHT_KEYS = ["height", "height_px"]
    _WIDTH_KEYS = ["width", "width_px"]

    def __init__(
        self,
        name=None,
        type=None,
        description=None,
        uri=None,
        properties=None,
    ):
        self.name = name
        self.type = type
        self.description = description
        self.uri = uri
        self.properties = properties
        self.height = None
        self.width = None

        if properties:
            self._parse_properties_dict(properties)

    def _parse_properties_dict(self, d):
        for k, v in d.items():
            if etau.is_numeric(v):
                self._check_height_width(k, v)
            elif isinstance(v, dict):
                self._parse_properties_dict(v)

    def _check_height_width(self, key, value):
        if key.lower() in self._HEIGHT_KEYS:
            self.height = float(value)

        if key.lower() in self._WIDTH_KEYS:
            self.width = float(value)

    def update_stream_dict(self, d):
        """Updates this stream with additional information.

        Args:
            d: a dict containing additional stream information
        """
        _type, properties, uri, description = self._parse_stream_dict(d)

        if uri:
            self.uri = uri

        if properties:
            self.properties = properties
            self._parse_properties_dict(properties)

        if description:
            self.description = description

        if _type:
            self.type = _type

    @classmethod
    def from_anno_dict(cls, stream_name, d):
        """Create an OpenLABEL stream from the stream information dictionary.

        Args:
            stream_name: the name of the stream
            d: a dict containing information about this stream

        Returns:
            An `OpenLABELStream`
        """
        _type, properties, uri, description = cls._parse_stream_dict(d)
        if _type != "camera":
            return None

        return cls(
            name=stream_name,
            type=_type,
            description=description,
            uri=uri,
            properties=properties,
        )

    @classmethod
    def _parse_stream_dict(cls, d):
        _type = d.get("type", None)
        properties = d.get("stream_properties", None)
        uri = d.get("uri", None)
        description = d.get("description", None)
        return _type, properties, uri, description


class OpenLABELMetadata(object):
    """A parser and storage for OpenLABEL metadata."""

    _POTENTIAL_FILENAME_KEYS = ["file_id", "uri", "file_id", "filepath"]

    def __init__(self, metadata_dict):
        self.metadata_dict = metadata_dict
        self._parse_seg_type()

    def _parse_seg_type(self):
        # Currently unused
        self.seg_type = SegmentationType.INSTANCE
        if "annotation_type" in self.metadata_dict:
            if (
                self.metadata_dict["annotation_type"]
                == "semantic segmentation"
            ):
                self.seg_type = SegmentationType.SEMANTIC

    def parse_potential_file_ids(self):
        """Parses metadata for any fields that may correspond to a label-wide
        media file_id.

        Returns:
            a list of potential file_id strings
        """
        file_ids = []
        for k, v in self.metadata_dict.items():
            if k.lower() in self._POTENTIAL_FILENAME_KEYS:
                file_ids.append(v)

        return file_ids


class OpenLABELObject(object):
    """An object parsed from OpenLABEL labels.

    Args:
        id (None): the OpenLABEL id string for this object
        name (None): the name string of the object
        type (None): the type string of the object
        bboxes ([]): a list of absolute bounding box coordinates for this
            object
        segmentations ([]): a list of aboslute polygon segmentations for this
            object
        keyponts ([]): a list of absolute keypoint coordinates for this object
        stream (None): the `OpenLABELStream` this object corresponds to
        attributes ({}): a dict of attributes and their values for this object
    """

    _STREAM_KEYS = ["stream", "coordinate_system"]

    def __init__(
        self,
        id=None,
        name=None,
        type=None,
        bboxes=None,
        segmentations=None,
        keypoints=None,
        stream=None,
        attributes=None,
    ):
        if bboxes is None:
            bboxes = []

        if segmentations is None:
            segmentations = []

        if keypoints is None:
            keypoints = []

        if attributes is None:
            attributes = {}

        self.id = id
        self.name = name
        self.type = type

        self.bboxes = bboxes
        self.segmentations = segmentations
        self.keypoints = keypoints
        self.stream = stream
        self.attributes = attributes

    def to_detections(self, frame_size):
        """Converts the bounding boxes in this object to
        :class:`fiftyone.core.labels.Detection` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Detection` objects for each
            bounding box in this object
        """
        if not self.bboxes:
            return []

        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size

        detections = []
        for bbox in self.bboxes:
            cx, cy, w, h = bbox
            x = cx - (w / 2)
            y = cy - (h / 2)
            bounding_box = [x / width, y / height, w / width, h / height]

            detections.append(
                fol.Detection(
                    label=label,
                    bounding_box=bounding_box,
                    **attributes,
                )
            )

        return detections

    def to_polylines(self, frame_size):
        """Converts the segmentations in this object to
        :class:`fiftyone.core.labels.Polyline` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Polyline` objects for each
            polyline in this object
        """
        if not self.segmentations:
            return []

        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size

        polylines = []
        for segmentation in self.segmentations:
            rel_points = [
                [(x / width, y / height) for x, y, in _pairwise(segmentation)]
            ]

            filled = attributes.pop("filled", None)
            if filled is None:
                filled = not attributes.get("is_hole", True)

            closed = attributes.pop("closed", True)
            attributes.pop("label", None)

            polylines.append(
                fol.Polyline(
                    label=label,
                    points=rel_points,
                    filled=filled,
                    closed=closed,
                    **attributes,
                )
            )
        return polylines

    def to_keypoints(self, frame_size):
        """Converts the keypoints in this object to
        :class:`fiftyone.core.labels.Keypoint` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Keypoint` objects for each
            keypoint in this object
        """
        if not self.keypoints:
            return []

        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size

        keypoints = []
        for kps in self.keypoints:
            rel_points = [(x / width, y / height) for x, y, in kps]
            keypoints.append(
                fol.Keypoint(label=label, points=rel_points, **attributes)
            )

        return keypoints

    @classmethod
    def from_anno_dict(cls, anno_id, d):
        """Create an :class:`OpenLABELObject` from the raw label dictionary.

        Args:
            anno_id: id of the object
            d: dict containing the information for this object

        Returns:
            a tuple containing the :class:`OpenLABELObject` and the frame
            numbers the object corresponds to, if any.
        """
        (
            bboxes,
            segmentations,
            points,
            name,
            _type,
            stream,
            attributes,
            frame_numbers,
        ) = cls._parse_object_dict(d)

        obj = cls(
            id=anno_id,
            name=name,
            type=_type,
            bboxes=bboxes,
            segmentations=segmentations,
            keypoints=points,
            stream=stream,
            attributes=attributes,
        )
        return obj, frame_numbers

    @classmethod
    def _parse_obj_type(
        cls, object_data, label_type, attributes=None, stream=None
    ):
        if attributes is None:
            attributes = {}

        obj = object_data.get(label_type, [])
        if label_type == "point2d" and obj:
            # Points are not stored in lists by default
            obj = [obj]

        obj, attrs, _stream = cls._parse_object_data(obj)
        attributes.update(attrs)
        if stream is None:
            stream = _stream

        return obj, attributes, stream

    @classmethod
    def _parse_object_dict(cls, d):
        object_data = d.get("object_data", {})

        bboxes, attributes, stream = cls._parse_obj_type(object_data, "bbox")

        polys, attributes, stream = cls._parse_obj_type(
            object_data,
            "poly2d",
            attributes=attributes,
            stream=stream,
        )

        point, attributes, stream = cls._parse_obj_type(
            object_data,
            "point2d",
            attributes=attributes,
            stream=stream,
        )
        if point:
            point = [point]

        name = d.get("name", None)
        _type = d.get("type", None)
        attrs, attr_stream = cls._parse_attributes(d)
        attributes.update(attrs)

        frame_numbers = cls._parse_frame_numbers(d)

        if stream is None:
            stream = attr_stream

        return (
            bboxes,
            polys,
            point,
            name,
            _type,
            stream,
            attributes,
            frame_numbers,
        )

    @classmethod
    def _parse_frame_numbers(cls, d):
        frame_numbers = []
        for frame_interval in d.get("frame_intervals", []):
            fs = int(frame_interval["frame_start"]) + 1
            fe = int(frame_interval["frame_end"]) + 2
            frame_numbers += list(range(fs, fe))

        return sorted(set(frame_numbers))

    @classmethod
    def _parse_object_data(cls, object_data_list):
        parsed_obj_list = []
        attributes = {}
        stream = None
        for obj_data in object_data_list:
            stream = obj_data.get(
                "stream", obj_data.get("coordinate_system", None)
            )
            attrs, attr_stream = cls._parse_attributes(obj_data)
            if stream is None:
                stream = attr_stream

            attributes.update(attrs)
            parsed_obj_list.append(obj_data["val"])

        return parsed_obj_list, attributes, stream

    @classmethod
    def _parse_attributes(cls, d):
        _ignore_keys = [
            "frame_intervals",
            "val",
            "attributes",
            "object_data",
            "object_data_pointers",
        ]
        attributes = {k: v for k, v in d.items() if k not in _ignore_keys}
        attributes_dict = d.get("attributes", {})
        stream = None
        for attr_type, attrs in attributes_dict.items():
            for attr in attrs:
                name = attr["name"]
                val = attr["val"]
                if name.lower() in cls._STREAM_KEYS:
                    stream = val

                if name.lower() not in _ignore_keys:
                    attributes[name] = val

        return attributes, stream

    def update_object_dict(self, d):
        """Updates this :class:`OpenLABELObject` given the raw label
        dictionary.

        Args:
            d: dict containing the information for this object

        Returns:
            newly parsed frame numbers the object corresponds to, if any
        """
        (
            bboxes,
            segmentations,
            points,
            name,
            _type,
            stream,
            attributes,
            frame_numbers,
        ) = self._parse_object_dict(d)

        self.bboxes.extend(bboxes)
        self.segmentations.extend(segmentations)
        self.keypoints.extend(points)

        if name and not self.name:
            self.name = name

        if stream and not self.stream:
            self.stream = stream

        self.attributes.update(attributes)

        return frame_numbers

    def _get_object_attributes(self):
        attributes = {}

        if self.name is not None:
            attributes["name"] = self.name

        if self.id is not None:
            attributes["openLABEL_id"] = self.id

        attributes.update(self.attributes)

        return attributes


def _validate_file_ids(potential_file_ids, sample_paths_map):
    file_ids = []
    for file_id in set(potential_file_ids):
        is_file = os.path.exists(file_id)
        has_file_id = _remove_ext(file_id) in sample_paths_map
        has_basename = (
            _remove_ext(os.path.basename(file_id)) in sample_paths_map
        )
        if is_file or has_file_id or has_basename:
            file_ids.append(file_id)

    return file_ids


def _parse_label_types(label_types):
    if label_types is None:
        return _SUPPORTED_LABEL_TYPES

    if etau.is_str(label_types):
        label_types = [label_types]
    else:
        label_types = list(label_types)

    bad_types = [l for l in label_types if l not in _SUPPORTED_LABEL_TYPES]

    if len(bad_types) == 1:
        raise ValueError(
            "Unsupported label type '%s'. Supported types are %s"
            % (bad_types[0], _SUPPORTED_LABEL_TYPES)
        )

    if len(bad_types) > 1:
        raise ValueError(
            "Unsupported label types %s. Supported types are %s"
            % (bad_types, _SUPPORTED_LABEL_TYPES)
        )

    return label_types


_SUPPORTED_LABEL_TYPES = [
    "detections",
    "segmentations",
    "keypoints",
]


def _pairwise(x):
    y = iter(x)
    return zip(y, y)


def _remove_ext(p):
    return os.path.splitext(p)[0]
