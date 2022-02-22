"""
Utilities for working with datasets in
`OpenLABEL format <https://www.asam.net/index.php?eID=dumpFile&t=f&f=3876&token=413e8c85031ae64cc35cf42d0768627514868b2f>`_.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from collections import defaultdict
from copy import deepcopy
import logging
import os

import eta.core.serial as etas
import eta.core.utils as etau

import fiftyone.core.labels as fol
import fiftyone.core.media as fom
import fiftyone.core.metadata as fomt
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


logger = logging.getLogger(__name__)


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
            -   a dict mapping filenames to absolute filepaths

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
            ``("detections", "segmentations", "keypoints", "polylines")``.
            By default, all labels are loaded
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
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_dir = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
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
        self.labels_dir = labels_dir
        self.labels_path = labels_path
        self._label_types = _label_types

        self._info = None
        self._image_paths_map = None
        self._image_dicts_map = None
        self._annotations = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.exists(filename):
            sample_path = filename
        elif _to_uuid(filename) in self._sample_paths_map:
            sample_path = self._sample_paths_map[_to_uuid(filename)]
        else:
            sample_path = self._sample_paths_map[
                _to_uuid(os.path.basename(filename))
            ]

        stream = self._annotations.get_stream(filename)
        height, width = stream.height, stream.width

        if height is None or width is None:
            sample_metadata = fomt.ImageMetadata.build_for(sample_path)
            height, width = sample_metadata["height"], sample_metadata["width"]
        else:
            sample_metadata = fomt.ImageMetadata(width=width, height=height)

        frame_size = (width, height)
        objects = self._annotations.get_objects(filename)
        label = objects.get_labels(frame_size)

        return sample_path, sample_metadata, label

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        types = {
            "detections": fol.Detections,
            "segmentations": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

        return {k: v for k, v in types.items() if k in self._label_types}

    def setup(self):
        sample_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )
        info = {}
        potential_filenames = []
        annotations = OpenLABELAnnotations(fom.IMAGE)

        if self.labels_path is not None:
            if os.path.isfile(self.labels_path):
                label_paths = [self.labels_path]
            elif os.path.isdir(self.labels_dir):
                label_paths = etau.list_files(self.labels_dir, recursive=True)
                label_paths = [l for l in label_paths if l.endswith(".json")]
            else:
                label_paths = []

            base_dir = fou.normalize_path(self.labels_dir)
            for label_path in label_paths:
                potential_filenames.extend(
                    annotations.parse_labels(base_dir, label_path)
                )

        self._annotations = annotations
        self._info = info
        self._filenames = _validate_filenames(
            potential_filenames, sample_paths_map
        )
        self._sample_paths_map = sample_paths_map

    def get_dataset_info(self):
        return self._info


class OpenLABELVideoDatasetImporter(
    foud.LabeledVideoDatasetImporter, foud.ImportPathsMixin
):
    def __init__(
        self,
        dataset_dir=None,
        data_path=None,
        labels_path=None,
        label_types=None,
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
            dataset_dir=dataset_dir, data_path=data_path, default="data/",
        )

        labels_dir = self._parse_labels_path(
            dataset_dir=dataset_dir,
            labels_path=labels_path,
            default="labels/",
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
        self.labels_dir = labels_dir
        self.labels_path = labels_path
        self._label_types = _label_types

        self._info = None
        self._video_paths_map = None
        self._video_dicts_map = None
        self._annotations = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        if os.path.exists(filename):
            sample_path = filename
        elif _to_uuid(filename) in self._sample_paths_map:
            sample_path = self._sample_paths_map[_to_uuid(filename)]
        else:
            sample_path = self._sample_paths_map[
                _to_uuid(os.path.basename(filename))
            ]

        stream = self._annotations.get_stream(filename)
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
        frames = self._annotations.get_objects(filename)
        frame_labels = frames.get_labels(frame_size)

        return sample_path, sample_metadata, None, frame_labels

    @property
    def has_dataset_info(self):
        return True

    @property
    def has_video_metadata(self):
        return True

    @property
    def label_cls(self):
        types = {
            "detections": fol.Detections,
            "segmentations": fol.Detections,
            "polylines": fol.Polylines,
            "keypoints": fol.Keypoints,
        }

        return {k: v for k, v in types.items() if k in self._label_types}

    def setup(self):
        sample_paths_map = self._load_data_map(
            self.data_path, ignore_exts=True, recursive=True
        )
        info = {}
        potential_filenames = []
        annotations = OpenLABELAnnotations(fom.VIDEO)

        if self.labels_path is not None:
            if os.path.isfile(self.labels_path):
                label_paths = [self.labels_path]
            elif os.path.isdir(self.labels_dir):
                label_paths = etau.list_files(self.labels_dir, recursive=True)
                label_paths = [l for l in label_paths if l.endswith(".json")]
            else:
                label_paths = []

            base_dir = fou.normalize_path(self.labels_dir)
            for label_path in label_paths:
                potential_filenames.extend(
                    annotations.parse_labels(base_dir, label_path)
                )

        self._annotations = annotations
        self._info = info
        self._filenames = _validate_filenames(
            potential_filenames, sample_paths_map
        )
        self._sample_paths_map = sample_paths_map

    def get_dataset_info(self):
        return self._info


def _validate_filenames(potential_filenames, sample_paths_map):
    filenames = []
    for filename in set(potential_filenames):
        is_file = os.path.exists(filename)
        has_uuid = _to_uuid(filename) in sample_paths_map
        has_basename = _to_uuid(os.path.basename(filename)) in sample_paths_map
        if is_file or has_uuid or has_basename:
            filenames.append(filename)
    return filenames


class OpenLABELAnnotations(object):
    def __init__(self, media_type):
        if media_type not in [fom.VIDEO, fom.IMAGE]:
            raise ValueError(
                "Media type must be `fiftyone.core.media.VIDEO` or "
                "`fiftyone.core.media.IMAGE`."
            )

        self.is_video = media_type == fom.VIDEO
        self.objects = {}
        self.streams = {}
        self.metadata = {}

        self.uri_to_streams = {}

    def parse_labels(self, base_dir, labels_path):
        abs_path = labels_path
        if not os.path.isabs(abs_path):
            abs_path = os.path.join(base_dir, labels_path)

        labels = etas.load_json(abs_path).get("openlabel", {})
        label_filename = _to_uuid(labels_path)
        potential_filenames = [label_filename]

        metadata = OpenLABELMetadata(labels.get("metadata", {}))
        self.metadata[label_filename] = metadata
        potential_filenames.extend(metadata.parse_potential_filenames())

        if self.is_video:
            object_parser = OpenLABELFramesParser()
        else:
            object_parser = OpenLABELObjectsParser()
        self._parse_streams(labels, label_filename)
        self._parse_objects(labels, object_parser)
        self._parse_frames(labels, label_filename, object_parser)
        self._store_objects(object_parser, label_filename, potential_filenames)

        potential_filenames.extend(self._update_stream_uris(label_filename))

        return potential_filenames

    def _update_stream_uris(self, label_filename):
        filenames = self.streams[label_filename].uris
        for uri in filenames:
            self.uri_to_streams[uri] = label_filename

        return filenames

    def _parse_streams(self, labels, label_filename):
        self.streams[label_filename] = OpenLABELStreams()
        for stream_name, stream_info in labels.get("streams", {}).items():
            self.streams[label_filename].add_stream_dict(
                stream_name, stream_info
            )

    def _parse_objects(self, labels, parser):
        for obj_id, obj_d in labels.get("objects", {}).items():
            parser.add_object_dict(obj_id, obj_d)

    def _store_objects(self, parser, label_filename, potential_filenames):
        for stream_name, objects in parser.to_stream_objects_map().items():
            _uris = []
            if stream_name is not None:
                stream = self.streams[label_filename].streams.get(
                    stream_name, None
                )
                if stream:
                    _uris.append(stream.uri)

            for uri in set(_uris + potential_filenames):
                if uri in self.objects:
                    self.objects[uri].add_objects(objects)
                else:
                    self.objects[uri] = deepcopy(objects)

    def _parse_frames(self, labels, label_filename, object_parser):
        for frame_ind, frame in labels.get("frames", {}).items():
            frame_num = int(frame_ind) + 1
            _objects = frame.get("objects", {})
            for obj_id, obj_d in _objects.items():
                if self.is_video:
                    object_parser.add_object_dict(
                        obj_id, obj_d, frame_num=frame_num
                    )
                else:
                    object_parser.add_object_dict(obj_id, obj_d)

            _streams = frame.get("frame_properties", {}).get("streams", None)
            if _streams:
                for stream_name, stream_info in _streams.items():
                    self.streams[label_filename].add_stream_dict(
                        stream_name, stream_info
                    )

    def get_objects(self, uri):
        if self.is_video:
            return self.objects.get(uri, OpenLABELFrames({}))
        else:
            return self.objects.get(uri, OpenLABELObjects([]))

    def get_stream(self, uri):
        if uri not in self.uri_to_streams:
            return OpenLABELStream(uri=uri)

        label_filename = self.uri_to_streams[uri]
        streams = self.streams[label_filename]
        return streams.get_one_stream(uri)


class OpenLABELObjectsParser(object):
    def __init__(self):
        self.objects = {}
        self.stream_to_id_map = defaultdict(list)
        self.streamless_objects = set()

    def add_object_dict(self, obj_id, obj_d):
        obj = self.objects.get(obj_id, None)
        if obj is None:
            obj, frame_nums = OpenLABELObject.from_anno_dict(obj_id, obj_d)
        else:
            frame_nums = obj.update_object_dict(obj_d)

        stream = obj.stream
        if stream is None:
            self.streamless_objects.add(obj_id)
        else:
            if obj_id in self.streamless_objects:
                self.streamless_objects.remove(obj_id)
            self.stream_to_id_map[stream].append(obj_id)

        self.objects[obj_id] = obj

    def to_stream_objects_map(self):
        stream_objects_map = {}
        for stream_name, ids in self.stream_to_id_map.items():
            objects = [self.objects[i] for i in ids]
            stream_objects_map[stream_name] = OpenLABELObjects(objects)

        objects = [self.objects[i] for i in self.streamless_objects]
        if objects:
            stream_objects_map[None] = OpenLABELObjects(objects)

        return stream_objects_map


class OpenLABELObjects(object):
    def __init__(self, objects):
        self.objects = objects

    def _to_labels(self, frame_size, labels_type, obj_to_label):
        labels = []
        for obj in self.objects:
            label = obj_to_label(obj, frame_size)
            if label is not None:
                labels.append(label)

        kwargs = {labels_type._LABEL_LIST_FIELD: labels}
        return labels_type(**kwargs)

    def to_detections(self, frame_size):
        return self._to_labels(
            frame_size, fol.Detections, OpenLABELObject.to_detection,
        )

    def to_keypoints(self, frame_size):
        return self._to_labels(
            frame_size, fol.Keypoints, OpenLABELObject.to_keypoint,
        )

    def to_polylines(self, frame_size):
        return self._to_labels(
            frame_size, fol.Polylines, OpenLABELObject.to_polyline,
        )

    def to_segmentations(self, frame_size):
        return fol.Detections()

    def add_objects(self, new_objects):
        if isinstance(new_objects, OpenLABELObjects):
            self.objects.extend(new_objects.objects)
        else:
            self.objects.extend(new_objects)

    def get_labels(self, frame_size):
        label = {}
        label["detections"] = self.to_detections(frame_size)
        label["polylines"] = self.to_polylines(frame_size)
        label["keypoints"] = self.to_keypoints(frame_size)
        label["segmentations"] = self.to_segmentations(frame_size)
        return label


class OpenLABELStreams(object):
    def __init__(self):
        self.streams = {}
        self.uri_to_names_map = defaultdict(list)

    @property
    def uris(self):
        return list(self.uri_to_names_map.keys())

    def add_stream_dict(self, stream_name, stream_d):
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
        stream_names = self.uri_to_names_map[uri]
        if stream_names and stream_names[0] in self.streams:
            return self.streams[stream_names[0]]
        else:
            return OpenLABELStream(uri=uri)


class OpenLABELStream(object):
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
            self.parse_properties_dict(properties)

    def parse_properties_dict(self, d):
        for k, v in d.items():
            if etau.is_numeric(v):
                self._check_height_width(k, v)
            elif isinstance(v, dict):
                self.parse_properties_dict(v)

    def _check_height_width(self, key, value):
        if key.lower() in self._HEIGHT_KEYS:
            self.height = float(value)

        if key.lower() in self._WIDTH_KEYS:
            self.width = float(value)

    def update_stream_dict(self, d):
        _type, properties, uri, description = self._parse_stream_dict(d)
        if uri:
            self.uri = uri

        if properties:
            self.properties = properties
            self.parse_properties_dict(properties)

        if description:
            self.description = description

        if _type:
            self.type = _type

    @classmethod
    def from_anno_dict(cls, stream_name, d):
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
    _POTENTIAL_FILENAME_KEYS = ["uuid", "uri", "filename", "filepath"]

    def __init__(self, metadata_dict):
        self.metadata_dict = metadata_dict

    def parse_potential_filenames(self):
        filenames = []
        for k, v in self.metadata_dict.items():
            if k.lower() in self._POTENTIAL_FILENAME_KEYS:
                filenames.append(v)
        return filenames


class OpenLABELObject(object):
    _STREAM_KEYS = ["stream", "coordinate_system"]

    def __init__(
        self,
        id=None,
        name=None,
        type=None,
        bbox=None,
        segmentation=None,
        keypoints=[],
        stream=None,
        **attributes,
    ):
        self.id = id
        self.name = name
        self.type = type
        self.bbox = bbox
        self.segmentation = segmentation
        self.keypoints = keypoints
        self.stream = stream
        self.attributes = attributes

    def to_detection(self, frame_size):
        if not self.bbox:
            return None

        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size
        cx, cy, w, h = self.bbox
        x = cx - (w / 2)
        y = cy - (h / 2)
        bounding_box = [x / width, y / height, w / width, h / height]

        return fol.Detection(
            label=label, bounding_box=bounding_box, **attributes,
        )

    def to_polyline(self, frame_size):
        if not self.segmentation:
            return None

        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size

        rel_points = [
            [(x / width, y / height) for x, y, in _pairwise(self.segmentation)]
        ]

        filled = not attributes.get("is_hole", True)
        closed = attributes.get("closed", True)

        return fol.Polyline(
            label=label,
            points=rel_points,
            filled=filled,
            closed=closed,
            **attributes,
        )

    def to_keypoint(self, frame_size):
        if not self.keypoints:
            return None
        label = self.type
        attributes = self._get_object_attributes()

        width, height = frame_size

        rel_points = [(x / width, y / height) for x, y, in self.keypoints]

        return fol.Keypoint(label=label, points=rel_points, **attributes,)

    @classmethod
    def from_anno_dict(cls, anno_id, d):
        (
            bbox,
            segmentation,
            point,
            name,
            _type,
            stream,
            attributes,
            frame_nums,
        ) = cls._parse_object_dict(d)

        obj = cls(
            id=anno_id,
            name=name,
            type=_type,
            bbox=bbox,
            segmentation=segmentation,
            keypoints=[point] if point else [],
            stream=stream,
            attributes=attributes,
        )
        return obj, frame_nums

    @classmethod
    def _parse_object_dict(cls, d):
        attributes = {}
        object_data = d.get("object_data", {})
        stream = None
        bbox = object_data.get("bbox", [])
        poly = object_data.get("poly2d", [])
        point = object_data.get("point2d", [])
        stream, bbox, attrs = cls._parse_object_data(bbox)
        attributes.update(attrs)

        _stream, poly, attrs = cls._parse_object_data(poly)
        attributes.update(attrs)
        if stream is None:
            stream = _stream

        _stream, point, attrs = cls._parse_object_data(point)
        attributes.update(attrs)
        if stream is None:
            stream = _stream

        name = d.get("name", None)
        _type = d.get("type", None)
        attributes, attr_stream = cls._parse_attributes(d)

        frame_nums = cls._parse_frame_nums(d)

        if stream is None:
            stream = attr_stream

        return bbox, poly, point, name, _type, stream, attributes, frame_nums

    @classmethod
    def _parse_frame_nums(cls, d):
        frame_nums = []
        for frame_interval in d.get("frame_intervals", []):
            fs = int(frame_interval["frame_start"]) + 1
            fe = int(frame_interval["frame_end"]) + 2
            frame_nums += list(range(fs, fe))

        return sorted(set(frame_nums))

    @classmethod
    def _parse_object_data(cls, object_data_list):
        for obj_data in object_data_list:
            stream = obj_data.get(
                "stream", obj_data.get("coordinate_system", None)
            )
            attributes, attr_stream = cls._parse_attributes(obj_data)
            if stream is None:
                stream = attr_stream
            return stream, obj_data["val"], attributes
        return None, None, {}

    @classmethod
    def _parse_attributes(cls, d):
        attributes = {
            k: v for k, v in d.items() if k not in ["val", "attributes"]
        }
        attributes_dict = d.get("attributes", {})
        stream = None
        for attr_type, attrs in attributes_dict.items():
            for attr in attrs:
                name = attr["name"]
                val = attr["val"]
                if name.lower() in cls._STREAM_KEYS:
                    stream = val
                attributes[name] = val

        return attributes, stream

    def update_object_dict(self, d):
        (
            bbox,
            segmentation,
            point,
            name,
            _type,
            stream,
            attributes,
            frame_nums,
        ) = self._parse_object_dict(d)
        if bbox and not self.bbox:
            self.bbox = bbox

        if segmentation and not self.segmentation:
            self.segmentation = segmentation

        if point:
            self.keypoints.append(point)

        if name and not self.name:
            self.name = name

        if stream and not self.stream:
            self.stream = stream

        return frame_nums

    def _get_object_attributes(self):
        attributes = {}

        if self.name is not None:
            attributes["name"] = self.name

        if self.id is not None:
            attributes["openLABEL_id"] = self.id

        return attributes


class OpenLABELFramesParser(object):
    def __init__(self):
        self.framewise_objects = defaultdict(dict)
        self.stream_to_id_map = defaultdict(list)
        self.streamless_objects = set()

    def add_object_dict(self, obj_id, obj_d, frame_num=None):
        obj = self.framewise_objects[frame_num].get(obj_id, None)
        if obj is None:
            obj, frame_nums = OpenLABELObject.from_anno_dict(obj_id, obj_d)
        else:
            frame_nums = obj.update_object_dict(obj_d)

        stream = obj.stream
        if stream is None:
            self.streamless_objects.add(obj_id)
        else:
            if obj_id in self.streamless_objects:
                self.streamless_objects.remove(obj_id)
            self.stream_to_id_map[stream].append(obj_id)

        if frame_nums:
            if frame_num is not None:
                frame_nums.append(frame_num)
                frame_nums = sorted(set(frame_nums))
        else:
            frame_nums = [frame_num]

        for frame_num in frame_nums:
            if frame_num is not None and self.framewise_objects[None].get(
                obj_id, False
            ):
                del self.framewise_objects[None][obj_id]
            self.framewise_objects[frame_num][obj_id] = deepcopy(obj)

    def to_stream_objects_map(self):
        stream_objects_map = {}
        for stream_name, ids in self.stream_to_id_map.items():
            frame_objects = self._get_objects_for_ids(ids)
            stream_objects_map[stream_name] = OpenLABELFrames(frame_objects)

        frame_objects = self._get_objects_for_ids(self.streamless_objects)
        if frame_objects:
            stream_objects_map[None] = OpenLABELFrames(frame_objects)

        return stream_objects_map

    def _get_objects_for_ids(self, ids):
        frame_objects = {}
        for frame_num, objects in self.framewise_objects.items():
            _objects = [objects[i] for i in ids if i in objects]
            if _objects:
                frame_objects[frame_num] = OpenLABELObjects(_objects)
        return frame_objects


class OpenLABELFrames(object):
    def __init__(self, frame_objects):
        self.frame_objects = frame_objects

    def get_labels(self, frame_size):
        frame_labels = {}
        for frame_num, objects in self.frame_objects.items():
            frame_label = {}
            frame_label["detections"] = objects.to_detections(frame_size)
            frame_label["polylines"] = objects.to_polylines(frame_size)
            frame_label["keypoints"] = objects.to_keypoints(frame_size)
            frame_label["segmentations"] = objects.to_segmentations(frame_size)
            frame_labels[frame_num] = frame_label
        return frame_labels

    def add_objects(self, new_objects):
        if isinstance(new_objects, OpenLABELFrames):
            new_objects = new_objects.frame_objects

        for frame_num, objects in new_objects.items():
            if frame_num not in self.frame_objects:
                self.frame_objects[frame_num] = objects
            else:
                self.frame_objects[frame_num].add_objects(objects)


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
    "polylines",
    "keypoints",
]


def _pairwise(x):
    y = iter(x)
    return zip(y, y)


def _to_uuid(p):
    return os.path.splitext(p)[0]
