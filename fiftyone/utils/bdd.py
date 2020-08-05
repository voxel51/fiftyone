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
                "attributes": {
                    "scene": "city street",
                    "timeofday": "daytime",
                    "weather": "overcast"
                },
                "labels": [
                    {
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
                        },
                        "category": "traffic sign",
                        "id": 0,
                        "manualAttributes": true,
                        "manualShape": true
                    },
                    ...
                ],
                "name": "b1c66a42-6f7d68ca.jpg",
                ...
            }

          or the path to such a JSON file on disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for more format
    details.
    """

    @property
    def label_cls(self):
        return fol.ImageLabels

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
        if etau.is_str(labels):
            labels = etas.load_json(labels)

        frame_size = etai.to_frame_size(img=img)
        return _parse_bdd_annotation(labels, frame_size)


class BDDDatasetImporter(foud.LabeledImageDatasetImporter):
    """Importer for BDD datasets stored on disk.

    See :class:`fiftyone.types.dataset_types.BDDDataset` for format details.

    Args:
        dataset_dir: the dataset directory
    """

    def __init__(self, dataset_dir):
        super().__init__(dataset_dir)
        self._data_dir = None
        self._labels_path = None
        self._anno_dict_map = None
        self._filenames = None
        self._iter_filenames = None

    def __iter__(self):
        self._iter_filenames = iter(self._filenames)
        return self

    def __len__(self):
        return len(self._filenames)

    def __next__(self):
        filename = next(self._iter_filenames)

        image_path = os.path.join(self._data_dir, filename)

        image_metadata = fom.ImageMetadata.build_for(image_path)

        frame_size = (image_metadata.width, image_metadata.height)
        anno_dict = self._anno_dict_map[filename]
        image_labels = _parse_bdd_annotation(anno_dict, frame_size)

        return image_path, image_metadata, image_labels

    @property
    def has_image_metadata(self):
        return True

    @property
    def label_cls(self):
        return fol.ImageLabels

    def setup(self):
        self._data_dir = os.path.join(self.dataset_dir, "data")
        self._labels_path = os.path.join(self.dataset_dir, "labels.json")
        self._anno_dict_map = load_bdd_annotations(self._labels_path)
        self._filenames = etau.list_files(self._data_dir, abs_paths=False)


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

    def export_sample(self, image_or_path, image_labels, metadata=None):
        out_image_path = self._export_image_or_path(
            image_or_path, self._filename_maker
        )

        if metadata is None:
            metadata = fom.ImageMetadata.build_for(out_image_path)

        filename = os.path.basename(out_image_path)
        annotation = _make_bdd_annotation(image_labels, metadata, filename)
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

    # Objects
    objects = d.get("labels", [])
    for obj in objects:
        label = obj["category"]

        bbox = obj["box2d"]
        bounding_box = etag.BoundingBox.from_abs_coords(
            bbox["x1"],
            bbox["y1"],
            bbox["x2"],
            bbox["y2"],
            frame_size=frame_size,
        )

        obj_attrs = obj.get("attributes", {})
        attrs = _make_attributes(obj_attrs)

        image_labels.add_object(
            etao.DetectedObject(
                label=label, bounding_box=bounding_box, attrs=attrs,
            )
        )

    return fol.ImageLabels(labels=image_labels)


def _make_bdd_annotation(image_labels, metadata, filename):
    # Frame attributes
    frame_attrs = {a.name: a.value for a in image_labels.labels.attrs}

    # Objects
    labels = []
    frame_size = (metadata.width, metadata.height)
    for idx, obj in enumerate(image_labels.labels.objects):
        tlx, tly, w, h = obj.bounding_box.coords_in(frame_size=frame_size)
        labels.append(
            {
                "attributes": {a.name: a.value for a in obj.attrs},
                "box2d": {"x1": tlx, "x2": tlx + w, "y1": tly, "y2": tly + h,},
                "category": obj.label,
                "id": idx,
                "manualAttributes": True,
                "manualShape": True,
            }
        )

    return {
        "attributes": frame_attrs,
        "labels": labels,
        "name": filename,
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
