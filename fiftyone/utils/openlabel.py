"""
Utilities for working with datasets in
`OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f>`_.

| Copyright 2017-2025, Voxel51, Inc.
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
import fiftyone.core.metadata as fom
import fiftyone.core.storage as fos
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


class SegmentationType(enum.Enum):
    """The FiftyOne label type used to store segmentations"""

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
        skeleton (None): a :class:`fiftyone.core.odm.dataset.KeypointSkeleton`
            to reference when loading keypoints
        skeleton_key (None): the key in the OpenLABEL annotations pointing to
            the label of each keypoint matching the labels defined in the given
            ``skeleton``
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
        skeleton=None,
        skeleton_key=None,
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
        self.skeleton = skeleton
        self.skeleton_key = skeleton_key

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

        seg_type = (
            SegmentationType.POLYLINE
            if self.use_polylines
            else SegmentationType.INSTANCE
        )

        width, height = self._annotations.get_dimensions(file_id)

        if height is None or width is None:
            sample_metadata = fom.ImageMetadata.build_for(sample_path)
            height, width = sample_metadata["height"], sample_metadata["width"]
        else:
            sample_metadata = fom.ImageMetadata(width=width, height=height)

        frame_size = (width, height)
        sample_labels, frame_labels = self._annotations.get_labels(
            file_id,
            self._label_types,
            frame_size,
            seg_type,
            skeleton=self.skeleton,
            skeleton_key=self.skeleton_key,
        )

        labels = _merge_frame_labels(sample_labels, frame_labels, seg_type)

        if self._has_scalar_labels:
            labels = next(iter(labels.values())) if labels else None

        return sample_path, sample_metadata, labels

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
        return None

    def setup(self):
        image_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        file_ids = []
        annotations = OpenLABELAnnotations()

        if self.labels_path is not None:
            labels_path = fos.normpath(self.labels_path)

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
        skeleton (None): a :class:`fiftyone.core.odm.dataset.KeypointSkeleton`
            to reference when loading keypoints
        skeleton_key (None): the key in the OpenLABEL annotations pointing to
            the label of each keypoint matching the labels defined in the given
            ``skeleton``
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
        skeleton=None,
        skeleton_key=None,
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
        self.skeleton = skeleton
        self.skeleton_key = skeleton_key

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

        width, height = self._annotations.get_dimensions(file_id)

        if height is None or width is None:
            sample_metadata = fom.VideoMetadata.build_for(sample_path)
            height, width = (
                sample_metadata["frame_height"],
                sample_metadata["frame_width"],
            )
        else:
            sample_metadata = fom.VideoMetadata(
                frame_width=width, frame_height=height
            )

        frame_size = (width, height)
        seg_type = (
            SegmentationType.POLYLINE
            if self.use_polylines
            else SegmentationType.INSTANCE
        )

        frame_size = (width, height)
        sample_labels, frame_labels = self._annotations.get_labels(
            file_id,
            self._label_types,
            frame_size,
            seg_type,
            skeleton=self.skeleton,
            skeleton_key=self.skeleton_key,
        )

        sample_labels = _remove_empty_labels(sample_labels, seg_type)

        return sample_path, sample_metadata, sample_labels, frame_labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_video_metadata(self):
        return True

    @property
    def label_cls(self):
        return None

    def setup(self):
        video_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )

        file_ids = []
        annotations = OpenLABELAnnotations()

        if self.labels_path is not None:
            labels_path = fos.normpath(self.labels_path)

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
    """

    def __init__(self):
        self.objects = OpenLABELObjects()
        self.streams = OpenLABELStreams()
        self.metadata = {}

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

        streams_dict = labels.get("streams", {})
        self.streams.parse_streams_dict(streams_dict, label_file_id)

        objects_dict = labels.get("objects", {})
        self.objects.parse_objects_dict(objects_dict, label_file_id)

        frames_dict = labels.get("frames", {})
        self._parse_frames(frames_dict, label_file_id)

        potential_file_ids.extend(self.streams.uris)

        return potential_file_ids

    def _parse_frames(self, frames, label_file_id):
        for frame_ind, frame in frames.items():
            frame_number = int(frame_ind) + 1

            objects = frame.get("objects", {})
            self.objects.parse_objects_dict(
                objects, label_file_id, frame_number=frame_number
            )

            streams_dict = frame.get("frame_properties", {}).get("streams", {})
            self.streams.parse_streams_dict(
                streams_dict, label_file_id, frame_number=frame_number
            )

    def get_dimensions(self, file_id):
        """Get the width and height of a given URI or file id

        Args:
            file_id: the unique identifier to a media file

        Returns:
            (width, height) of the given file
        """
        return self.streams.get_dimensions(file_id)

    def get_labels(
        self,
        uri,
        label_types,
        frame_size,
        seg_type,
        skeleton=None,
        skeleton_key=None,
    ):
        """Get the FiftyOne labels corresponding to the annotations of a given
        URI. The results are two dictionaries, sample- and frame-level, mapping
        field names to values and label objects.

        Args:
            uri: the unique identifier to a media file
            label_types: a list of label types to load. The
                supported values are
                ``("detections", "segmentations", "keypoints")``.
            frame_size: the (width, height) tuple for the media frame
            seg_type: the :class:`SegmentationType` to use for segmentation
                annotations
            skeleton (None): a
                :class:`fiftyone.core.odm.dataset.KeypointSkeleton` to use as a
                reference when loading keypoints
            skeleton_key (None): the name of the field in the OpenLABEL
                annotations containing the labels of keypoints matching the
                labels of the given skeleton

        Returns:
            a dictionary of sample level fields and label objects and a
            dictionary of frame numbers to frame level fields and label objects
        """
        stream_infos = self.streams.get_stream_info(uri)
        sample_objects = self.objects.get_objects(stream_infos)
        return sample_objects.to_labels(
            frame_size,
            label_types,
            seg_type,
            stream_infos,
            skeleton=skeleton,
            skeleton_key=skeleton_key,
        )


class OpenLABELStreamInfos(object):
    """A collection of multiple :class:`OpenLABELStreamInfo` objects."""

    def __init__(self, infos=None):
        self.infos = infos if infos else []

    def get_stream_attributes(self, frame_number=None):
        """Aggregates attributes from all streams in this collection.

        Args:
            frame_number (None): a specific frame number for which to get
                stream attributes

        Returns:
            a dictionary of attributes from all streams in this collection
        """
        attributes = {}
        for info in self.infos:
            is_sample = frame_number is None and info.is_sample_level
            has_frame_number = (
                info.frame_numbers and frame_number in info.frame_numbers
            )
            if is_sample or has_frame_number:
                attributes.update(info.get_stream_attributes())

        return attributes

    @property
    def frame_numbers(self):
        """All frame numbers existing in the :class:`OpenLABELStreamInfo`
        objects in this collection.
        """
        frame_numbers = []
        for info in self.infos:
            if info.frame_numbers:
                frame_numbers.extend(info.frame_numbers)
        return sorted(set(frame_numbers))


class OpenLABELStreamInfo(object):
    """Information about a stream used to gather specific objects for a media
    file.

    Args:
        frame_numbers (None): frame numbers related to this stream info
        stream (None): an :class:`OpenLABELStream`
        label_file_id (None): a label file id related to this stream info
        is_sample_level (None): whether this stream info corresponds to
            sample-level or frame-level
    """

    def __init__(
        self,
        frame_numbers=None,
        stream=None,
        label_file_id=None,
        is_sample_level=None,
    ):
        self.frame_numbers = frame_numbers
        self.stream = stream
        self.label_file_id = label_file_id
        self.is_sample_level = is_sample_level

    @property
    def is_streamless(self):
        """Whether there exists a stream corresponding to this info."""
        return self.stream is None

    def get_stream_attributes(self):
        """Get a dictionary of attributes for the stream in this object.

        Returns:
            a dictionary of attributes from the corresponding stream
        """
        attributes = {}
        if self.stream:
            attributes.update(self.stream.other_attrs)

        return attributes


class OpenLABELGroup(object):
    """A utility for parsing groups of OpenLABEL elements"""

    def __init__(self):
        self._element_id_to_element = {}
        self._keys_by_label_file_id = defaultdict(set)

    def _parse_group_dict(self, group_dict, label_file_id, frame_number=None):
        # Streams are unique by name and label file id
        for key, element_dict in group_dict.items():
            self._add_element_dict(
                label_file_id,
                key,
                element_dict,
                frame_number=frame_number,
            )

    @property
    def _element_type(self):
        raise NotImplementedError("Subclass must implement '_element_type'")

    @classmethod
    def _get_element_id(cls, label_file_id, name):
        return "%s_%s" % (label_file_id, name)

    @classmethod
    def _get_label_file_id(cls, element_id, element_name):
        return element_id[: -len(element_name) - 1]

    def _add_element_dict(self, label_file_id, key, info_d, frame_number=None):
        """Parses the given raw stream dictionary.

        Args:
            stream_name: the name of the stream being parsed
            stream_d: a dict containing stream information to parse
            frame_number (None): the frame number from which this stream
                information dict was parsed, 'None' if from the top-level
                streams
        """
        element_id = self._get_element_id(label_file_id, key)
        element = self._element_id_to_element.get(element_id, None)
        if element is None:
            element = self._element_type.from_anno_dict(
                key, info_d, frame_number=frame_number
            )
        else:
            element.update_dict(info_d, frame_number=frame_number)

        if element:
            self._element_id_to_element[element_id] = element
            self._keys_by_label_file_id[label_file_id].add(key)

        return element


class OpenLABELObjects(OpenLABELGroup):
    """A collection of :class:`OpenLABELObject` and corresponding utility
    methods.
    """

    @property
    def streams(self):
        """Get streams corresponding to any object in this collection."""
        _streams = []
        for obj in self.all_objects:
            _streams.extend(obj.streams)
        return list(set(_streams))

    @property
    def all_objects(self):
        """A list of :class:`OpenLABELObject` instances in this collection."""
        return list(self._element_id_to_element.values())

    def parse_objects_dict(
        self, objects_dict, label_file_id, frame_number=None
    ):
        """Parses the OpenLABEL annotations corresponding to a specific
        dictionary of objects.

        Args:
            objects_dict: the dict of OpenLABEL object annotations
            label_file_id: the name of the annotations file containing these
                objects
            frame_number (None): an optional frame that this ``objects_dict``
                is in
        """
        self._parse_group_dict(
            objects_dict, label_file_id, frame_number=frame_number
        )

    @property
    def _element_type(self):
        return OpenLABELObject

    def add_object(self, obj_key, label_file_id, obj):
        """Adds an :class:`OpenLABELObject` to this collection.

        Args:
            obj_key: the name of the object in the OpenLABEL annotations
            label_file_id: the filename of the annotations file containing this
                label
            obj: the :class:`OpenLABELObject` to add
        """
        obj_id = self._get_element_id(obj_key, label_file_id)
        self._element_id_to_element[obj_id] = obj

    def _get_filtered_object(self, obj_id, stream_info):
        # Get object that contains exactly the information needed, either with
        # frames filtered, removed, or merged
        if obj_id not in self._element_id_to_element:
            return None

        obj = self._element_id_to_element[obj_id]
        return obj.filter_stream(stream_info)

    def get_objects(self, stream_infos):
        """Gets any objects that correspond to an info in the given stream
        infos.

        Args:
            stream_infos: a :class:`OpenLABELStreamInfos` used to get
                corresponding objects

        Returns:
            an :class:`OpenLABELObjects` with objects that correspond to any of
            the given stream infos
        """
        stream_objects = OpenLABELObjects()
        for stream_info in stream_infos.infos:
            label_file_id = stream_info.label_file_id
            obj_keys = self._keys_by_label_file_id.get(label_file_id, [])
            for obj_key in obj_keys:
                obj_id = self._get_element_id(label_file_id, obj_key)
                obj = self._get_filtered_object(obj_id, stream_info)
                if obj:
                    stream_objects.add_object(obj_key, label_file_id, obj)

        return stream_objects

    def to_labels(
        self,
        frame_size,
        label_types,
        seg_type,
        stream_infos,
        skeleton=None,
        skeleton_key=None,
    ):
        """Converts the stored :class:`OpenLABELObject` to FiftyOne labels.

        Args:
            frame_size: the size of the image frame in pixels (width, height)
            label_types: a list of label types to load
            seg_type: the :class:`SegmentationType` to use to store
                segmentations
            stream_infos: the :class:`OpenLABELStreamInfos` containing
                sample-level attributes to parse into labels
            skeleton (None): a
                :class:`fiftyone.core.odm.dataset.KeypointSkeleton` to use when
                loading keypoint annotations
            skeleton_key (None): the name of the field in the OpenLABEL
                annotations containing the labels of keypoints matching the
                labels of the given skeleton

        Returns:
            a dictionary of sample level fields and label objects and a
            dictionary of frame numbers to frame level fields and label objects
        """
        frame_dets = defaultdict(list)
        frame_kps = defaultdict(list)
        frame_segs = defaultdict(list)
        for obj in self.all_objects:
            if "detections" in label_types:
                for frame_number, dets in obj.to_detections(
                    frame_size
                ).items():
                    frame_dets[frame_number].extend(dets)

            if "keypoints" in label_types:
                for frame_number, kps in obj.to_keypoints(
                    frame_size, skeleton=skeleton, skeleton_key=skeleton_key
                ).items():
                    frame_kps[frame_number].extend(kps)

            if "segmentations" in label_types:
                for frame_number, segs in obj.to_polylines(frame_size).items():
                    if seg_type == SegmentationType.POLYLINE:
                        _segs = segs
                    elif seg_type == SegmentationType.INSTANCE:
                        _segs = []
                        for seg in segs:
                            _segs.append(
                                seg.to_detection(frame_size=frame_size)
                            )
                    else:
                        raise NotImplementedError(
                            "Loading semantic segmentations is not yet "
                            "supported"
                        )
                    frame_segs[frame_number].extend(_segs)

        sample_labels = stream_infos.get_stream_attributes()

        frame_labels = defaultdict(dict)
        for frame_number in stream_infos.frame_numbers:
            frame_labels[frame_number] = stream_infos.get_stream_attributes(
                frame_number=frame_number
            )

        for frame_number, dets in frame_dets.items():
            frame_labels[frame_number]["detections"] = fol.Detections(
                detections=dets
            )

        for frame_number, kps in frame_kps.items():
            frame_labels[frame_number]["keypoints"] = fol.Keypoints(
                keypoints=kps
            )

        for frame_number, segs in frame_segs.items():
            if seg_type == SegmentationType.POLYLINE:
                frame_labels[frame_number]["segmentations"] = fol.Polylines(
                    polylines=segs
                )
            elif seg_type == SegmentationType.INSTANCE:
                frame_labels[frame_number]["segmentations"] = fol.Detections(
                    detections=segs
                )
            else:
                raise NotImplementedError(
                    "Loading semantic segmentations is not yet supported"
                )

        sample_labels.update(frame_labels.pop(None, {}))

        return sample_labels, dict(frame_labels)


class OpenLABELStreams(OpenLABELGroup):
    """A collection of OpenLABEL streams."""

    def __init__(self):
        super().__init__()
        self._uri_to_stream_ids = defaultdict(set)

    @property
    def uris(self):
        """All unique media file identifiers corresponding to streams in this
        collection.
        """
        _uris = []
        for stream in self._element_id_to_element.values():
            _uris.extend(stream.uris)
        return list(set(_uris))

    def parse_streams_dict(
        self, streams_dict, label_file_id, frame_number=None
    ):
        """Parses the OpenLABEL annotations corresponding to a specific
        dictionary of streams.

        Args:
            streams_dict: the dict of OpenLABEL stream annotations
            label_file_id: the name of the annotations file containing these
                streams
            frame_number (None): an optional frame that this ``streams_dict``
                is in
        """

        for key, element_dict in streams_dict.items():
            self._add_stream_dict(
                label_file_id,
                key,
                element_dict,
                frame_number=frame_number,
            )

    def get_dimensions(self, uri):
        """Get the width and height of a given URI or file id.

        Args:
            file_id: the unique identifier to a media file

        Returns:
            the ``(width, height)`` of the given file
        """
        stream_ids = list(self._uri_to_stream_ids.get(uri, []))
        # All streams pointing to this URI should be the same media
        if stream_ids:
            stream_id = stream_ids[0]
            stream = self._element_id_to_element.get(stream_id, None)
            if stream:
                return stream.width, stream.height

        return None, None

    @property
    def _element_type(self):
        return OpenLABELStream

    def _add_stream_dict(
        self, label_file_id, stream_name, stream_d, frame_number=None
    ):
        """Parses the given raw stream dictionary.

        Args:
            label_file_id: the filename of the annotations file from which
                these labels are parsed
            stream_name: the name of the stream being parsed
            stream_d: a dict containing stream information to parse
            frame_number (None): the frame number from which this stream
                information dict was parsed, 'None' if from the top-level
                streams
        """
        stream = self._add_element_dict(
            label_file_id, stream_name, stream_d, frame_number=frame_number
        )
        stream_id = self._get_element_id(label_file_id, stream_name)

        if stream is not None:
            for uri in stream.uris:
                self._uri_to_stream_ids[uri].add(stream_id)

    def get_stream_info(self, uri):
        """Get all stream infos, including stream and relevant frame numbers,
        for a given media file identifier.

        Args:
            uri: the unique media file identifier for which to get all stream
                infos

        Returns:
            the :class:`OpenLABELStreamInfos` corresponding to the given uri
        """
        infos = []
        if uri in self._uri_to_stream_ids:
            # Matches at least one stream at sample/frame level
            stream_ids = self._uri_to_stream_ids[uri]
            for stream_id in stream_ids:
                stream = self._element_id_to_element[stream_id]
                label_file_id = self._get_label_file_id(
                    stream_id,
                    stream.name,
                )
                frame_numbers, is_sample_level = stream.get_frame_numbers(uri)
                info = OpenLABELStreamInfo(
                    frame_numbers=frame_numbers,
                    stream=stream,
                    label_file_id=label_file_id,
                    is_sample_level=is_sample_level,
                )
                infos.append(info)
        else:
            # Does not match any stream, create info with only label file id,
            # must be sample level
            info = OpenLABELStreamInfo(label_file_id=uri, is_sample_level=True)
            infos.append(info)

        return OpenLABELStreamInfos(infos=infos)


class AttributeParser(object):
    """Methods used to parse attributes from OpenLABEL annotations."""

    _STREAM_KEYS = ["stream", "coordinate_system"]
    _IGNORE_KEYS = [
        "frame_intervals",
        "val",
        "attributes",
        "object_data",
        "object_data_pointers",
        "bbox",
        "point2d",
        "poly2d",
    ]

    @classmethod
    def _parse_attributes(cls, d):
        attributes = {k: v for k, v in d.items() if k not in cls._IGNORE_KEYS}
        attributes_dict = d.get("attributes", {})
        stream = None
        for k in cls._STREAM_KEYS:
            if k in d:
                stream = d[k]

        _attrs, _stream = cls._parse_name_val_attributes(attributes_dict)
        attributes.update(_attrs)
        if _stream:
            stream = _stream

        return attributes, stream

    @classmethod
    def _parse_name_val_attributes(cls, d):
        attributes = {}
        stream = None
        for attr_type, attrs in d.items():
            for attr in attrs:
                name = attr["name"]
                val = attr["val"]
                if name.lower() in cls._STREAM_KEYS:
                    stream = val

                if name.lower() not in cls._IGNORE_KEYS:
                    attributes[name] = val
        return attributes, stream


class OpenLABELShape(AttributeParser):
    """A single OpenLABEL shape like a bounding box or polygon."""

    def __init__(self, coords, attributes=None, stream=None):
        self.coords = coords
        self.attributes = attributes if attributes else {}
        self.stream = stream

    @classmethod
    def from_shape_dict(cls, d):
        """Constructs a shape from a dictionary of information.

        Args:
            d: a dictionary containing information about a shape
        Returns:
            an :class:`OpenLABELShape`
        """
        coords = d.pop("val", None)
        attributes, stream = cls._parse_attributes(d)
        return cls(coords, attributes=attributes, stream=stream)


class OpenLABELBBox(OpenLABELShape):
    """An OpenLABEL bounding box."""

    def to_label(self, label, attributes, width, height):
        """Convert this shape to a FiftyOne label.

        Args:
            label: the class label for this shape
            attributes: a dictionary of attributes for this shape
            width: the width of the frame in pixels
            height: the height of the frame in pixels

        Return:
            an :class:`fiftyone.core.labels.Detection`
        """
        num_coords = len(self.coords)
        if num_coords != 4:
            raise ValueError(
                "Expected bounding box to have 4 coordinates, found %d"
                % num_coords
            )

        cx, cy, w, h = self.coords
        x = cx - (w / 2)
        y = cy - (h / 2)
        bounding_box = [x / width, y / height, w / width, h / height]

        _attrs = deepcopy(attributes)
        _attrs.update(self.attributes)

        return fol.Detection(
            label=label,
            bounding_box=bounding_box,
            **_attrs,
        )


class OpenLABELPoly2D(OpenLABELShape):
    """An OpenLABEL polyline."""

    def to_label(self, label, attributes, width, height):
        """Convert this shape to a FiftyOne label.

        Args:
            label: the class label for this shape
            attributes: a dictionary of attributes for this shape
            width: the width of the frame in pixels
            height: the height of the frame in pixels

        Return:
            an :class:`fiftyone.core.labels.Polyline`
        """
        rel_points = [
            [(x / width, y / height) for x, y, in _pairwise(self.coords)]
        ]
        _attrs = deepcopy(attributes)
        _attrs.update(self.attributes)

        filled = _attrs.pop("filled", None)
        if filled is None:
            filled = not _attrs.get("is_hole", True)

        closed = _attrs.pop("closed", True)
        _attrs.pop("label", None)

        return fol.Polyline(
            label=label,
            points=rel_points,
            filled=filled,
            closed=closed,
            **_attrs,
        )


class OpenLABELPoint(OpenLABELShape):
    """An OpenLABEL keypoint."""

    @classmethod
    def _get_empty_value_for_type(cls, example_type):
        return example_type()

    @classmethod
    def _sort_by_skeleton(cls, points, attrs, label_order, skeleton_order):
        if len(points) != len(label_order):
            return points, attrs

        if not isinstance(skeleton_order, list):
            skeleton_order = skeleton_order.labels

        sorted_points = []
        sorted_attrs = {}
        attrs_to_sort = {}
        for k, v in attrs.items():
            if isinstance(v, list) and len(v) == len(points):
                attrs_to_sort[k] = v
                sorted_attrs[k] = []
            elif isinstance(v, list) and len(v) == 0:
                continue
            else:
                sorted_attrs[k] = v

        for label in skeleton_order:
            if label not in label_order:
                sorted_points.append([float("nan"), float("nan")])
                for k in attrs_to_sort:
                    example_type = type(attrs_to_sort[k][0])
                    empty_value = cls._get_empty_value_for_type(example_type)
                    sorted_attrs[k].append(empty_value)
            else:
                ind = label_order.index(label)
                sorted_points.append(points[ind])
                for k, v in attrs_to_sort.items():
                    sorted_attrs[k].append(v[ind])

        return sorted_points, sorted_attrs

    def to_label(
        self,
        label,
        attributes,
        width,
        height,
        skeleton=None,
        skeleton_key=None,
    ):
        """Convert this shape to a FiftyOne label.

        Args:
            label: the class label for this shape
            attributes: a dictionary of attributes for this shape
            width: the width of the frame in pixels
            height: the height of the frame in pixels
            skeleton (None): a
                :class:`fiftyone.core.odm.dataset.KeypointSkeleton` used to
                sort list attributes based on the labels in the skeleton. Used
                only if ``skeleton_key`` is provided
            skeleton_key (None): the string key into the attributes dictionary
                containing the label of each point, used to sort list attribute
                fields based on the labels in the skeleton. Used only if
                ``skeleton`` is provided

        Return:
            an :class:`fiftyone.core.labels.Keypoint`
        """
        rel_points = [(x / width, y / height) for x, y, in self.coords]
        _attrs = deepcopy(attributes)
        _attrs.update(self.attributes)
        if skeleton and skeleton_key and skeleton_key in _attrs:
            label_order = _attrs.pop(skeleton_key)
            rel_points, _attrs = self._sort_by_skeleton(
                rel_points, _attrs, label_order, skeleton
            )

        return fol.Keypoint(label=label, points=rel_points, **_attrs)


class OpenLABELShapes(AttributeParser):
    """A collection of OpenLABEL shapes."""

    def __init__(self, shapes=None, attributes=None, stream=None):
        self.shapes = shapes if shapes else []
        self.attributes = attributes if attributes else {}
        self.stream = stream

    @property
    def streams(self):
        """A list of streams corresponding to any object in this collection."""
        streams = []
        if self.stream:
            streams.append(self.stream)

        for shape in self.shapes:
            stream = shape.stream
            if stream:
                streams.append(stream)

        return streams

    @classmethod
    def from_object_data_list(cls, shape_type, l, attributes=None):
        """Construct an :class:`OpenLABELShapes` from a list of shape
        dictionaries.

        Args:
            shape_type: the type of the shape being loaded. Options are
                (:class:`OpenLABELBBox`, :class:`OpenLABELPoly2D`,
                :class:`OpenLABELPoint`)
            l: a list of shape dictionaries parsed from OpenLABEL object
                annotations
            attributes (None): a dictionary of attributes corresponding to all
                shapes in this collection

        Returns:
            a :class:`OpenLABELShapes`
        """
        shapes = []
        for shape_d in l:
            shapes.append(shape_type.from_shape_dict(shape_d))

        stream = None
        if attributes:
            attributes, stream = cls._parse_name_val_attributes(attributes)

        return cls(shapes=shapes, attributes=attributes, stream=stream)

    def merge_shapes(self, shapes):
        """Merges another :class:`OpenLABELShapes` into this one.

        Args:
            shapes: another :class:`OpenLABELShapes` to merge into this
                object
        """
        if shapes:
            self.shapes.extend(shapes.shapes)
            self.attributes.update(shapes.attributes)

    def to_labels(
        self,
        label,
        attributes,
        width,
        height,
        is_points=False,
        skeleton=None,
        skeleton_key=None,
    ):
        """Convert this shape to a FiftyOne label.

        Args:
            label: the class label for this shape
            attributes: a dictionary of attributes for this shape
            width: the width of the frame in pixels
            height: the height of the frame in pixels
            is_points (False): whether the labels being converted are keypoints
            skeleton (None): a
                :class:`fiftyone.core.odm.dataset.KeypointSkeleton` used to
                sort list attributes based on the labels in the skeleton. Used
                only if ``is_points`` and ``skeleton_key`` is provided
            skeleton_key (None): the string key into the attributes dictionary
                containing the label of each point, used to sort list attribute
                fields based on the labels in the skeleton. Used only if
                ``is_points`` and ``skeleton`` is provided

        Return:
            an :class:`fiftyone.core.labels.Keypoint`
        """
        if is_points:
            return self._to_point_labels(
                label,
                attributes,
                width,
                height,
                skeleton=skeleton,
                skeleton_key=skeleton_key,
            )

        return self._to_individual_labels(label, attributes, width, height)

    @property
    def _homogenous_shape_types(self):
        types = [type(s) for s in self.shapes]

        if len(set(types)) > 1:
            return False

        return True

    def _to_point_labels(
        self,
        label,
        attributes,
        width,
        height,
        skeleton=None,
        skeleton_key=None,
    ):
        labels = []

        if not self.shapes:
            return labels

        if not self._homogenous_shape_types or not isinstance(
            self.shapes[0], OpenLABELPoint
        ):
            raise ValueError(
                "Found non-point shapes when attempting to convert to "
                "Keypoint labels."
            )

        # Convert keypoints to list of points
        coords = []
        _attrs = defaultdict(list)
        stream = None
        for shape in self.shapes:
            coords.append(shape.coords)
            for k, v in shape.attributes.items():
                _attrs[k].append(v)

            if shape.stream:
                stream = shape.stream

        if coords:
            _attrs = dict(_attrs)
            _attrs.update(self.attributes)
            shape = type(self.shapes[0])(
                coords, attributes=dict(_attrs), stream=stream
            )
            labels.append(
                shape.to_label(
                    label,
                    attributes,
                    width,
                    height,
                    skeleton=skeleton,
                    skeleton_key=skeleton_key,
                )
            )

        return labels

    def _to_individual_labels(self, label, attributes, width, height):
        labels = []
        _attrs = deepcopy(attributes)
        _attrs.update(self.attributes)
        for shape in self.shapes:
            labels.append(shape.to_label(label, _attrs, width, height))

        return labels


class OpenLABELStream(object):
    """An OpenLABEL stream corresponding to one uri or file_id.

    Args:
        name (None): the name of the stream
        type (None): the type of the stream
        description (None): a string description for this stream
        properties (None): a dict of properties for this stream
        uri (None): the uri or file_id of the media corresponding to this
            stream
        other_attrs (None): a dictionary of other attributes corresponding to
            this stream
    """

    _HEIGHT_KEYS = ["height", "height_px"]
    _WIDTH_KEYS = ["width", "width_px"]
    _URI_KEYS = ["uri"]

    def __init__(
        self,
        name,
        type=None,
        properties=None,
        uris=None,
        other_attrs=None,
    ):
        self.name = name
        self.type = type
        self.properties = properties
        self.height = None
        self.width = None
        self.other_attrs = other_attrs if other_attrs else {}

        self._uris = uris if uris else []

        self.frame_streams = {}

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

    def update_dict(self, d, frame_number=None):
        """Updates this stream with additional information.

        Args:
            d: a dict containing additional stream information
            frame_number (None): the frame number from which this stream
                information dict was parsed, 'None' if from the top-level
                streams
        """
        if frame_number:
            frame_stream = self.frame_streams.get(
                frame_number, OpenLABELStream(self.name)
            )
            frame_stream.update_dict(d)
            self.frame_streams[frame_number] = frame_stream

        else:
            _type, properties, uris, other_attrs = self._parse_stream_dict(d)

            if _type:
                if _type != "camera":
                    return

                self.type = _type

            if properties:
                self.properties = properties
                self._parse_properties_dict(properties)

            if uris:
                self._uris = sorted(set(self._uris + uris))

            if other_attrs:
                self.other_attrs.update(other_attrs)

    @property
    def uris(self):
        """Get uris corresponding to any stream in this collection."""
        _uris = deepcopy(self._uris)
        for _stream in self.frame_streams.values():
            _uris.extend(_stream.uris)

        return sorted(set(_uris))

    def get_frame_numbers(self, uri):
        """Get frame numbers corresponding to the given uri."""
        is_sample_level = False
        if uri in self._uris:
            # URI corresponds to all frames in this stream
            # Likely a video annotation
            # For an image, that sample will just contain annotations from all
            # frames
            is_sample_level = True
            return list(self.frame_streams.keys()), is_sample_level

        frame_numbers = []
        for frame_number, frame_stream in self.frame_streams.items():
            # URI exists in one or more frames in this stream
            # Likely an image annotation
            if uri in frame_stream.uris:
                frame_numbers.append(frame_number)

        return frame_numbers, is_sample_level

    @classmethod
    def from_anno_dict(cls, stream_name, d, frame_number):
        """Create an OpenLABEL stream from the stream information dictionary.

        Args:
            stream_name: the name of the stream
            d: a dict containing information about this stream
            frame_number: the frame number from which this stream
                information dict was parsed, 'None' if from the top-level
                streams

        Returns:
            An :class:`OpenLABELStream`
        """
        if frame_number is not None:
            stream = cls(stream_name)
            stream.update_dict(d, frame_number=frame_number)
        else:
            _type, properties, uris, other_attrs = cls._parse_stream_dict(d)
            if _type and _type != "camera":
                return None

            stream = cls(
                stream_name,
                type=_type,
                properties=properties,
                uris=uris,
                other_attrs=other_attrs,
            )

        return stream

    @classmethod
    def _parse_stream_dict(cls, d):
        _type = d.pop("type", None)
        properties = d.pop("stream_properties", None)

        uris = []
        for uri_key in cls._URI_KEYS:
            uri_val = d.pop(uri_key, None)
            if uri_val and uri_val not in uris:
                uris.append(uri_val)

        return _type, properties, uris, d


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


class OpenLABELObject(AttributeParser):
    """An object parsed from OpenLABEL labels.

    Args:
        key: the OpenLABEL key string for this object
        name (None): the name string of the object
        type (None): the type string of the object
        bboxes (None): an :class`OpenLABELShapes` of bounding boxes for this
            object
        segmentations (None): an :class`OpenLABELShapes` of polygon
            segmentations for this object
        keyponts (None): an :class:`OpenLABELShapes` of keypoints for this
            object
        stream (None): the :class:`OpenLABELStream` this object corresponds to
        other_attrs (None): a dict of attributes and their values for this
            object
        is_frame_level (False): whether this object is sample-level or
            frame-level
    """

    _STREAM_KEYS = ["stream", "coordinate_system"]

    def __init__(
        self,
        key,
        name=None,
        type=None,
        bboxes=None,
        segmentations=None,
        keypoints=None,
        stream=None,
        other_attrs=None,
        is_frame_level=False,
    ):

        self.shapes = {
            "bboxes": OpenLABELShapes(),
            "segmentations": OpenLABELShapes(),
            "keypoints": OpenLABELShapes(),
        }
        if bboxes:
            self.shapes["bboxes"] = bboxes

        if segmentations:
            self.shapes["segmentations"] = segmentations

        if keypoints:
            self.shapes["keypoints"] = keypoints

        self.key = key
        self.name = name
        self.type = type

        self.stream = stream
        self.other_attrs = other_attrs if other_attrs else {}
        self.frame_objects = {}
        self.is_frame_level = is_frame_level

    @property
    def _sample_level_streams(self):
        _streams = []
        if self.stream:
            _streams.append(self.stream)

        for _shapes in self.shapes.values():
            _streams.extend(_shapes.streams)

        return list(set(_streams))

    @property
    def streams(self):
        """Get streams corresponding to this object."""
        _streams = deepcopy(self._sample_level_streams)

        for _object in self.frame_objects.values():
            _streams.extend(_object.streams)

        return list(set(_streams))

    @property
    def is_streamless(self):
        """Whether any streams are connected to this object or corresponding
        frame-level objects.
        """
        return not bool(self._sample_level_streams)

    def filter_stream(self, stream_info):
        """Filters this object to contain only frame labels specified in the
        given stream info

        Args:
            stream_info: the :class:`OpenLABELStreamInfo` to use to filter this
                object

        Returns:
            an :class:`OpenLABELObject` containing only frames related to the
            given stream info
        """
        # if obj is top level and stream info is sample level
        if stream_info.is_streamless:
            if self.is_frame_level or not self.is_streamless:
                return None

            # This object is sample-level and streamless
            return self

        if stream_info.is_sample_level:
            return self

        return self._keep_frames(stream_info.frame_numbers)

    def _keep_frames(self, frame_numbers):
        _obj = deepcopy(self)
        numbers_to_remove = set(_obj.frame_objects.keys()) - set(frame_numbers)
        for frame_number in numbers_to_remove:
            _obj.frame_objects.pop(frame_number, None)
        return _obj

    def _to_labels(
        self,
        frame_size,
        shape_type,
        parent=None,
        is_points=False,
        skeleton=None,
        skeleton_key=None,
    ):
        label, attributes, width, height = self._get_label_attrs(
            frame_size, parent=parent
        )

        frame_labels = defaultdict(list)
        shapes = self.shapes[shape_type]
        frame_labels[None] = shapes.to_labels(
            label,
            attributes,
            width,
            height,
            is_points=is_points,
            skeleton=skeleton,
            skeleton_key=skeleton_key,
        )

        for frame_number, frame_object in self.frame_objects.items():
            frame_labels[frame_number].extend(
                frame_object._to_labels(
                    frame_size,
                    shape_type,
                    parent=self,
                    is_points=is_points,
                    skeleton=skeleton,
                    skeleton_key=skeleton_key,
                )[None]
            )

        return frame_labels

    def to_detections(self, frame_size):
        """Converts the bounding boxes in this object to
        :class:`fiftyone.core.labels.Detection` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Detection` objects for each
            bounding box in this object
        """
        return self._to_labels(frame_size, "bboxes")

    def _get_label_attrs(self, frame_size, parent=None):
        label = self.type
        if label is None and parent:
            label = parent.type

        attributes = self._get_object_attributes(parent=parent)

        width, height = frame_size
        return label, attributes, width, height

    def to_polylines(self, frame_size):
        """Converts the segmentations in this object to
        :class:`fiftyone.core.labels.Polyline` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Polyline` objects for each
            polyline in this object
        """
        return self._to_labels(frame_size, "segmentations")

    def to_keypoints(self, frame_size, skeleton=None, skeleton_key=None):
        """Converts the keypoints in this object to
        :class:`fiftyone.core.labels.Keypoint` objects.

        Args:
            frame_size: the size of the frame in pixels (width, height)

        Returns:
            a list of :class:`fiftyone.core.labels.Keypoint` objects for each
            keypoint in this object
        """
        return self._to_labels(
            frame_size,
            "keypoints",
            is_points=True,
            skeleton=skeleton,
            skeleton_key=skeleton_key,
        )

    @classmethod
    def from_anno_dict(cls, obj_key, d, frame_number=None):
        """Create an :class:`OpenLABELObject` from the raw label dictionary.

        Args:
            anno_id: id of the object
            d: dict containing the information for this object

        Returns:
            a tuple containing the :class:`OpenLABELObject` and the frame
            numbers the object corresponds to, if any.
        """
        if frame_number is not None:
            obj = cls(obj_key, is_frame_level=False)
            obj.update_dict(d, frame_number=frame_number)
        else:
            (
                bboxes,
                segmentations,
                points,
                name,
                _type,
                stream,
                other_attrs,
            ) = cls._parse_object_dict(d)

            obj = cls(
                obj_key,
                name=name,
                type=_type,
                bboxes=bboxes,
                segmentations=segmentations,
                keypoints=points,
                stream=stream,
                other_attrs=other_attrs,
                is_frame_level=False,
            )
        return obj

    @classmethod
    def _get_shape_list(cls, object_data, key):
        l = object_data.pop(key, [])
        if isinstance(l, dict):
            l = [l]
        return l

    @classmethod
    def _parse_object_dict(cls, d):
        object_data = d.pop("object_data", {})

        bbox_l = cls._get_shape_list(object_data, "bbox")
        poly2d_l = cls._get_shape_list(object_data, "poly2d")
        point2d_l = cls._get_shape_list(object_data, "point2d")

        name = d.pop("name", None)
        _type = d.pop("type", None)
        attributes, stream = cls._parse_attributes(d)

        bboxes = OpenLABELShapes.from_object_data_list(
            OpenLABELBBox, bbox_l, attributes=object_data
        )
        segmentations = OpenLABELShapes.from_object_data_list(
            OpenLABELPoly2D, poly2d_l, attributes=object_data
        )
        points = OpenLABELShapes.from_object_data_list(
            OpenLABELPoint, point2d_l, attributes=object_data
        )

        return (
            bboxes,
            segmentations,
            points,
            name,
            _type,
            stream,
            attributes,
        )

    def update_dict(self, d, frame_number=None):
        """Updates this :class:`OpenLABELObject` given the raw label
        dictionary.

        Args:
            d: dict containing the information for this object

        Returns:
            newly parsed frame numbers the object corresponds to, if any
        """
        if frame_number:
            frame_object = self.frame_objects.get(
                frame_number, OpenLABELObject(self.key, is_frame_level=True)
            )
            frame_object.update_dict(d)
            self.frame_objects[frame_number] = frame_object
        else:
            (
                bboxes,
                segmentations,
                points,
                name,
                _type,
                stream,
                other_attrs,
            ) = self._parse_object_dict(d)

            self.shapes["bboxes"].merge_shapes(bboxes)
            self.shapes["segmentations"].merge_shapes(segmentations)
            self.shapes["keypoints"].merge_shapes(points)

            if name and not self.name:
                self.name = name

            if stream and not self.stream:
                self.stream = stream

            self.other_attrs.update(other_attrs)

    def _get_object_attributes(self, parent=None):
        attributes = {}

        if parent:
            attributes.update(parent._get_object_attributes())

        if self.name is not None:
            attributes["name"] = self.name

        if self.key is not None:
            attributes["OpenLABEL_id"] = self.key

        attributes.update(self.other_attrs)

        return attributes


def _validate_file_ids(potential_file_ids, sample_paths_map):
    file_ids = []
    potential_file_ids = set(potential_file_ids)
    if None in potential_file_ids:
        potential_file_ids.remove(None)

    for file_id in potential_file_ids:
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


def _merge_frame_labels(sample_labels, frame_labels, seg_type):
    # Add frame labels to sample labels, if there is a key collision, merge the
    # labels if they are a list field otherwise skip
    for labels in frame_labels.values():
        for name, value in labels.items():
            if name == "detections":
                _extend_labels(
                    sample_labels, value, name, fol.Detections, "detections"
                )

            elif name == "keypoints":
                _extend_labels(
                    sample_labels, value, name, fol.Keypoints, "keypoints"
                )

            elif name == "segmentations":
                if seg_type == SegmentationType.POLYLINE:
                    _extend_labels(
                        sample_labels, value, name, fol.Polylines, "polylines"
                    )
                elif seg_type == SegmentationType.INSTANCE:
                    _extend_labels(
                        sample_labels,
                        value,
                        name,
                        fol.Detections,
                        "detections",
                    )
                else:
                    raise NotImplementedError(
                        "Loading semantic segmentations is not yet supported"
                    )

            elif name in sample_labels:
                if isinstance(sample_labels[name], list):
                    if not isinstance(value, list):
                        value = [value]

                    sample_labels[name].extend(value)

            else:
                sample_labels[name] = value

    return sample_labels


def _extend_labels(sample_labels, value, name, labels_type, label_kwarg):
    if name not in sample_labels:
        sample_labels[name] = labels_type(**{label_kwarg: []})
    else:
        sample_labels[name][label_kwarg].extend(value[label_kwarg])


def _remove_empty_labels(sample_labels, seg_type):
    _remove_empty_label_type(sample_labels, "detections", "detections")
    _remove_empty_label_type(sample_labels, "keypoints", "keypoints")
    if seg_type == SegmentationType.POLYLINE:
        _remove_empty_label_type(sample_labels, "segmentations", "polylines")
    elif seg_type == SegmentationType.INSTANCE:
        _remove_empty_label_type(sample_labels, "segmentations", "detections")
    else:
        raise NotImplementedError(
            "Loading semantic segmentations is not yet supported"
        )

    return sample_labels


def _remove_empty_label_type(sample_labels, key, label_type):
    if key in sample_labels and not sample_labels[key][label_type]:
        sample_labels.pop(key, None)
