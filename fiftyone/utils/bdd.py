"""
Utilities for working with datasets in
`Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os

import eta.core.data as etad
import eta.core.geometry as etag
import eta.core.image as etai
import eta.core.objects as etao
import eta.core.polylines as etap
import eta.core.utils as etau
import eta.core.serial as etas

import fiftyone as fo
import fiftyone.core.labels as fol
import fiftyone.core.metadata as fom
import fiftyone.core.utils as fou
import fiftyone.utils.data as foud


class BDDSampleParser(foud.LabeledImageTupleSampleParser):
    """Parser for samples in
    `Berkeley DeepDrive (BDD) format <https://bdd-data.berkeley.edu>`_.

    This implementation supports samples that are
    ``(image_or_path, anno_or_path)`` tuples, where:

        - ``image_or_path`` is either an image that can be converted to numpy
          format via ``np.asarray()`` or the path to an image on disk

        - ``anno_or_path`` is a dictionary in the following format::

            {
                "name": "<filename>.<ext>",
                "attributes": {
                    "scene": "city street",
                    "timeofday": "daytime",
                    "weather": "overcast"
                },
                "labels": [
                    {
                        "id": 0,
                        "category": "traffic sign",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "occluded": false,
                            "trafficLightColor": "none",
                            "truncated": false
                        },
                        "box2d": {
                            "x1": 1000.698742,
                            "x2": 1040.626872,
                            "y1": 281.992415,
                            "y2": 326.91156
                        }
                    },
                    ...
                    {
                        "id": 34,
                        "category": "drivable area",
                        "manualAttributes": true,
                        "manualShape": true,
                        "attributes": {
                            "areaType": "direct"
                        },
                        "poly2d": [
                            {
                                "types": "LLLLCCC",
                                "closed": true,
                                "vertices": [
                                    [241.143645, 697.923453],
                                    [541.525255, 380.564983],
                                    ...
                                ]
                            }
                        ]
                    },
                    ...
                    {
                        "id": 109356,
                        "category": "lane",
                        "attributes": {
                            "laneDirection": "parallel",
                            "laneStyle": "dashed",
                            "laneType": "single white"
                        },
                        "manualShape": true,
                        "manualAttributes": true,
                        "poly2d": [
                            {
                                "types": "LL",
                                "closed": false,
                                "vertices": [
                                    [492.879546, 331.939543],
                                    [0, 471.076658],
                                    ...
                                ]
                            }
                        ],
                    },
                    ...
                }
            }

          or the path to such a JSON file on disk. For unlabeled images,
          ``anno_or_path`` can be ``None``.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for more format
    details.

    Args:
        expand (True): whether to expand the image labels into a dictionary of
            :class:`fiftyone.core.labels.Label` instances
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary. Only applicable when ``expand`` is True
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them. Only
            applicable when ``expand`` is True
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance. Only
            applicable when ``expand`` is True
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False). Only applicable
            when ``expand`` is True
    """

    def __init__(
        self,
        expand=True,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
    ):
        super().__init__()
        self.expand = expand
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical

    @property
    def label_cls(self):
        return fol.ImageLabels if not self.expand else None

    def get_label(self):
        """Returns the label for the current sample.

        Args:
            sample: the sample

        Returns:
            a :class:`fiftyone.core.labels.ImageLabels` instance
        """
        labels = self.current_sample[1]

        # We must have the image to convert to relative coordinates
        img = self._current_image

        return self._parse_label(labels, img)

    def _parse_label(self, labels, img):
        if labels is None:
            return None

        if etau.is_str(labels):
            labels = etas.load_json(labels)

        frame_size = etai.to_frame_size(img=img)
        label = _parse_bdd_annotation(labels, frame_size)

        if label is not None and self.expand:
            label = label.expand(
                prefix=self.prefix,
                labels_dict=self.labels_dict,
                multilabel=self.multilabel,
                skip_non_categorical=self.skip_non_categorical,
            )

        return label


class BDDDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for BDD datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for format details.

    Args:
        dataset_dir: the dataset directory
        expand (True): whether to expand the image labels into a dictionary of
            :class:`fiftyone.core.labels.Label` instances
        prefix (None): a string prefix to prepend to each label name in the
            expanded label dictionary. Only applicable when ``expand`` is True
        labels_dict (None): a dictionary mapping names of attributes/objects
            in the image labels to field names into which to expand them. Only
            applicable when ``expand`` is True
        multilabel (False): whether to store frame attributes in a single
            :class:`fiftyone.core.labels.Classifications` instance. Only
            applicable when ``expand`` is True
        skip_non_categorical (False): whether to skip non-categorical frame
            attributes (True) or cast them to strings (False). Only applicable
            when ``expand`` is True
        skip_unlabeled (False): whether to skip unlabeled images when importing
        shuffle (False): whether to randomly shuffle the order in which the
            samples are imported
        seed (None): a random seed to use when shuffling
        max_samples (None): a maximum number of samples to import. By default,
            all samples are imported
    """

    def __init__(
        self,
        dataset_dir,
        expand=True,
        prefix=None,
        labels_dict=None,
        multilabel=False,
        skip_non_categorical=False,
        skip_unlabeled=False,
        shuffle=False,
        seed=None,
        max_samples=None,
    ):
        super().__init__(
            dataset_dir,
            skip_unlabeled=skip_unlabeled,
            shuffle=shuffle,
            seed=seed,
            max_samples=max_samples,
        )
        self.expand = expand
        self.prefix = prefix
        self.labels_dict = labels_dict
        self.multilabel = multilabel
        self.skip_non_categorical = skip_non_categorical
        self._data_dir = None
        self._labels_path = None
        self._anno_dict_map = None
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

        image_path = os.path.join(self._data_dir, filename)

        image_metadata = fom.ImageMetadata.build_for(image_path)

        anno_dict = self._anno_dict_map.get(filename, None)
        if anno_dict is not None:
            # Labeled image
            frame_size = (image_metadata.width, image_metadata.height)
            label = _parse_bdd_annotation(anno_dict, frame_size)
        else:
            # Unlabeled image
            label = None

        if label is not None and self.expand:
            label = label.expand(
                prefix=self.prefix,
                labels_dict=self.labels_dict,
                multilabel=self.multilabel,
                skip_non_categorical=self.skip_non_categorical,
            )

        return image_path, image_metadata, label

    @property
    def has_dataset_info(self):
        return False

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.ImageLabels if not self.expand else None

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")
        self._labels_path = os.path.join(self.dataset_dir, "labels.json")
        if os.path.isfile(self._labels_path):
            self._anno_dict_map = load_bdd_annotations(self._labels_path)
        else:
            self._anno_dict_map = {}

        filenames = etau.list_files(self._data_dir, abs_paths=False)

        if self.skip_unlabeled:
            filenames = [f for f in filenames if f in self._anno_dict_map]

        self._filenames = self._preprocess_list(filenames)
        self._num_samples = len(self._filenames)


class BDDDatasetExporter(foud.LabeledImageDatasetExporter):
    """Exporter that writes BDD datasets to disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for format details.

    Args:
        export_dir: the directory to write the export
        image_format (None): the image format to use when writing in-memory
            images to disk. By default, ``fiftyone.config.default_image_ext``
            is used
    """

    def __init__(self, export_dir, image_format=None):
        if image_format is None:
            image_format = fo.config.default_image_ext

        super().__init__(export_dir)
        self.image_format = image_format
        self._data_dir = None
        self._labels_path = None
        self._annotations = None
        self._filename_maker = None

    @property
    def requires_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.ImageLabels

    def setup(self):
        self._data_dir = os.path.join(self.export_dir, "data")
        self._labels_path = os.path.join(self.export_dir, "labels.json")
        self._annotations = []
        self._filename_maker = fou.UniqueFilenameMaker(
            output_dir=self._data_dir, default_ext=self.image_format
        )

    def export_sample(
        self, image_or_path, image_labels_or_dict, metadata=None
    ):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(out_image_path)

        if image_labels_or_dict is not None:
            filename = os.path.basename(out_image_path)
            annotation = _make_bdd_annotation(
                image_labels_or_dict, metadata, filename
            )
            self._annotations.append(annotation)

    def close(self, *args):
        etas.write_json(self._annotations, self._labels_path)


def load_bdd_annotations(json_path):
    """Loads the BDD annotations from the given JSON file.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for more format
    details.

    Args:
        json_path: the path to the annotations JSON file

    Returns:
        a dict mapping filenames to BDD annotation dicts
    """
    annotations = etas.load_json(json_path)
    return {d["name"]: d for d in annotations}


def _parse_bdd_annotation(d, frame_size):
    image_labels = etai.ImageLabels()

    # Frame attributes
    frame_attrs = d.get("attributes", {})
    image_labels.attrs = _make_attributes(frame_attrs)

    # Objects and polylines
    labels = d.get("labels", [])
    for label in labels:
        if "box2d" in label:
            dobj = _parse_bdd_object(label, frame_size)
            image_labels.add_object(dobj)

        if "poly2d" in label:
            polylines = _parse_bdd_polylines(label, frame_size)
            image_labels.add_polylines(polylines)

    return fol.ImageLabels(labels=image_labels)


def _parse_bdd_object(d, frame_size):
    label = d["category"]

    box2d = d["box2d"]
    bounding_box = etag.BoundingBox.from_abs_coords(
        box2d["x1"],
        box2d["y1"],
        box2d["x2"],
        box2d["y2"],
        frame_size=frame_size,
        clamp=False,
    )

    obj_attrs = d.get("attributes", {})
    attrs = _make_attributes(obj_attrs)

    return etao.DetectedObject(
        label=label, bounding_box=bounding_box, attrs=attrs,
    )


def _parse_bdd_polylines(d, frame_size):
    label = d["category"]

    attributes = d.get("attributes", {})
    attrs = _make_attributes(attributes)
    polylines = etap.PolylineContainer()
    for poly2d in d.get("poly2d", []):
        points = poly2d.get("vertices", [])
        closed = poly2d.get("closed", False)
        filled = closed  # assume that closed figures should be filled

        _attrs = attrs.copy()

        types = poly2d.get("types", None)
        if types is not None:
            _attrs.add(_make_attribute("types", types))

        polylines.add(
            etap.Polyline.from_abs_coords(
                points,
                label=label,
                closed=closed,
                filled=filled,
                attrs=_attrs,
                frame_size=frame_size,
                clamp=False,
            )
        )

    return polylines


def _make_bdd_annotation(image_labels_or_dict, metadata, filename):
    # Convert to `eta.core.image.ImageLabels` format
    if isinstance(image_labels_or_dict, dict):
        image_labels = etai.ImageLabels()
        for name, label in image_labels_or_dict.items():
            if label is not None:
                image_labels.merge_labels(label.to_image_labels(name=name))
    else:
        image_labels = image_labels_or_dict.labels

    labels = []
    frame_size = (metadata.width, metadata.height)
    uuid = -1

    # Frame attributes
    frame_attrs = {a.name: a.value for a in image_labels.attrs}

    # Objects
    for obj in image_labels.objects:
        uuid += 1
        tlx, tly, w, h = obj.bounding_box.coords_in(frame_size=frame_size)
        labels.append(
            {
                "id": uuid,
                "category": obj.label,
                "manualAttributes": True,
                "manualShape": True,
                "attributes": {a.name: a.value for a in obj.attrs},
                "box2d": {"x1": tlx, "x2": tlx + w, "y1": tly, "y2": tly + h},
            }
        )

    # Polylines
    for polyline in image_labels.polylines:
        uuid += 1
        vertices = polyline.coords_in(frame_size=frame_size)
        types = polyline.attrs.get_attr_value_with_name("types", None)
        labels.append(
            {
                "id": uuid,
                "category": polyline.label,
                "manualAttributes": True,
                "manualShape": True,
                "attributes": {
                    a.name: a.value
                    for a in polyline.attrs
                    if a.name != "types"
                },
                "poly2d": {
                    "types": types,
                    "closed": polyline.closed,
                    "vertices": vertices,
                },
            }
        )

    return {
        "name": filename,
        "attributes": frame_attrs,
        "labels": labels,
    }


def _make_attributes(d):
    attrs = etad.AttributeContainer()
    for name, value in d.items():
        attr = _make_attribute(name, value)
        attrs.add(attr)

    return attrs


def _make_attribute(name, value):
    if isinstance(value, bool):
        return etad.BooleanAttribute(name, value)

    if etau.is_numeric(value):
        return etad.NumericAttribute(name, value)

    return etad.CategoricalAttribute(name, value)
