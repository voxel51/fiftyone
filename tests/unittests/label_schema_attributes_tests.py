"""
Label schema attributes are declared on the dataset's field schema.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import datetime
import unittest
from unittest import mock

from bson import ObjectId

import fiftyone as fo
import fiftyone.core.annotation as foa
import fiftyone.core.annotation.utils as foau
import fiftyone.core.fields as fof
import fiftyone.core.label_schema_docs as fold

from decorators import drop_datasets


def _schema(dataset, field, *attributes):
    label_schema = dataset.generate_label_schemas(field)
    label_schema["attributes"] = list(label_schema.get("attributes") or [])
    label_schema["attributes"].extend(attributes)
    return label_schema


_CAMERA = {
    "name": "camera",
    "type": "str",
    "component": "radio",
    "values": ["nikon", "canon"],
}
_BRAND = {
    "name": "brand",
    "type": "str",
    "component": "radio",
    "values": ["a", "b", "c", "d"],
}
_OCCLUDED = {"name": "occluded", "type": "bool", "component": "toggle"}
_NOTES = {"name": "notes", "type": "list<str>", "component": "text"}


class DeclareLabelSchemaAttributesTests(unittest.TestCase):
    def _dataset(self):
        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/0.png",
                gt=fo.Detections(
                    detections=[
                        fo.Detection(
                            label="mango",
                            bounding_box=[0, 0, 0.1, 0.1],
                            camera="canon",
                        )
                    ]
                ),
                cls=fo.Classification(label="x"),
            )
        )
        return dataset

    @drop_datasets
    def test_update_label_schema_declares_new_attributes(self):
        dataset = self._dataset()
        dataset.update_label_schema(
            "gt",
            _schema(dataset, "gt", _CAMERA, _BRAND, _OCCLUDED, _NOTES),
            allow_new_attrs=True,
        )

        # with values: the type of the values
        self.assertIsInstance(
            dataset.get_field("gt.detections.camera"), fof.StringField
        )
        # without values: the label schema type
        self.assertIsInstance(
            dataset.get_field("gt.detections.brand"), fof.StringField
        )
        self.assertIsInstance(
            dataset.get_field("gt.detections.occluded"), fof.BooleanField
        )
        notes = dataset.get_field("gt.detections.notes")
        self.assertIsInstance(notes, fof.ListField)
        self.assertIsInstance(notes.field, fof.StringField)

        # the declared attributes are filterable
        self.assertEqual(
            dataset.count_values("gt.detections.camera"), {"canon": 1}
        )

    @drop_datasets
    def test_singular_labels(self):
        dataset = self._dataset()
        dataset.update_label_schema(
            "cls", _schema(dataset, "cls", _BRAND), allow_new_attrs=True
        )
        self.assertIsInstance(dataset.get_field("cls.brand"), fof.StringField)

    @drop_datasets
    def test_existing_fields_and_unknown_types_are_left_alone(self):
        dataset = self._dataset()
        before = dataset.get_field("gt.detections.confidence")
        declared = foa.declare_label_schema_attributes(
            dataset,
            {
                "gt": _schema(
                    dataset,
                    "gt",
                    {"name": "confidence", "type": "str"},
                    {"name": "odd", "type": "nope"},
                )
            },
        )
        self.assertEqual(declared, [])
        self.assertIs(dataset.get_field("gt.detections.confidence"), before)
        self.assertIsNone(dataset.get_field("gt.detections.odd"))

    @drop_datasets
    def test_frame_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/tmp/0.mp4")
        sample.frames[1] = fo.Frame(
            gt=fo.Detections(detections=[fo.Detection(label="a", camera="x")])
        )
        dataset.add_sample(sample)

        declared = foa.declare_label_schema_attributes(
            dataset,
            {"frames.gt": _schema(dataset, "frames.gt", _CAMERA, _BRAND)},
        )
        self.assertEqual(
            sorted(declared),
            ["frames.gt.detections.brand", "frames.gt.detections.camera"],
        )
        self.assertIsInstance(
            dataset.get_field("frames.gt.detections.brand"), fof.StringField
        )

    @drop_datasets
    def test_schema_docs_declare_on_create_and_update(self):
        dataset = self._dataset()
        content = {"gt": _schema(dataset, "gt", _CAMERA)}
        doc = fold.create(
            name="oct_1", label_schema=content, dataset_id=dataset._doc.id
        )
        self.addCleanup(fold.delete, doc["id"], dataset_id=dataset._doc.id)
        self.assertIsNotNone(dataset.get_field("gt.detections.camera"))

        content = {"gt": _schema(dataset, "gt", _CAMERA, _BRAND)}
        fold.update(
            doc["id"], label_schema=content, dataset_id=dataset._doc.id
        )
        self.assertIsNotNone(dataset.get_field("gt.detections.brand"))

    @drop_datasets
    def test_list_undeclared_reads_the_field_schema_only(self):
        dataset = self._dataset()
        label_schemas = {"gt": _schema(dataset, "gt", _CAMERA, _BRAND)}

        with mock.patch.object(
            fo.Dataset, "get_dynamic_field_schema"
        ) as full_scan, mock.patch.object(
            foau, "_scan_attribute_types"
        ) as targeted_scan:
            undeclared = foa.list_undeclared_label_schema_attributes(
                dataset, label_schemas
            )

        self.assertEqual(undeclared, {"gt": ["camera", "brand"]})
        full_scan.assert_not_called()
        targeted_scan.assert_not_called()

        foa.declare_label_schema_attributes(dataset, label_schemas)
        self.assertEqual(
            foa.list_undeclared_label_schema_attributes(
                dataset, label_schemas
            ),
            {},
        )

    @drop_datasets
    def test_scalar_values_do_not_need_the_full_scan(self):
        dataset = self._dataset()
        with mock.patch.object(
            fo.Dataset,
            "get_dynamic_field_schema",
            autospec=True,
            side_effect=fo.Dataset.get_dynamic_field_schema,
        ) as full_scan:
            foa.declare_label_schema_attributes(
                dataset, {"gt": _schema(dataset, "gt", _CAMERA, _BRAND)}
            )

        full_scan.assert_not_called()
        self.assertIsInstance(
            dataset.get_field("gt.detections.camera"), fof.StringField
        )

    @drop_datasets
    def test_many_attributes_use_the_full_scan(self):
        dataset = self._dataset()
        names = ["a%d" % i for i in range(foau._MAX_TARGETED_ATTRIBUTES + 1)]
        detection = dataset.first().gt.detections[0]
        for i, name in enumerate(names):
            detection[name] = i
        sample = dataset.first()
        sample.gt.detections[0] = detection
        sample.save()

        attributes = [{"name": n, "type": "int"} for n in names]
        with mock.patch.object(
            fo.Dataset,
            "get_dynamic_field_schema",
            autospec=True,
            side_effect=fo.Dataset.get_dynamic_field_schema,
        ) as full_scan:
            foa.declare_label_schema_attributes(
                dataset, {"gt": _schema(dataset, "gt", *attributes)}
            )

        full_scan.assert_called_once()
        for name in names:
            self.assertIsInstance(
                dataset.get_field("gt.detections." + name), fof.IntField
            )

    @drop_datasets
    def test_mixed_type_values_are_skipped_with_a_warning(self):
        dataset = self._dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/1.png",
                gt=fo.Detections(detections=[fo.Detection(camera=3)]),
            )
        )
        with self.assertLogs(foau.logger, level="WARNING") as logs:
            declared = foa.declare_label_schema_attributes(
                dataset, {"gt": _schema(dataset, "gt", _CAMERA)}
            )

        self.assertEqual(declared, [])
        self.assertIn("gt.detections.camera", logs.output[0])
        self.assertIn("mixed types", logs.output[0])


#: attribute -> (the values stored on two labels in different samples, the
#: field it is declared as, or None when it is skipped)
_TYPE_CASES = {
    "str": (["a", "b"], "StringField"),
    "bool": ([True, False], "BooleanField"),
    "int": ([1, 2], "IntField"),
    "float": ([1.5, 2.5], "FloatField"),
    "int_and_float": ([1, 2.5], "FloatField"),
    "big_int": ([2**40, 3], "IntField"),
    "datetime": (
        [datetime.datetime(2026, 1, 1, 12), datetime.datetime(2026, 2, 1)],
        "DateTimeField",
    ),
    "date": (
        [datetime.date(2026, 1, 1), datetime.date(2026, 2, 1)],
        "DateTimeField",
    ),
    "object_id": ([ObjectId(), ObjectId()], "ObjectIdField"),
    "object_id_and_null": ([ObjectId(), None], "ObjectIdField"),
    "str_and_null": (["a", None], "StringField"),
    # no values: the label schema type (str)
    "only_null": ([None, None], "StringField"),
    "list_str": ([["a", "b"], ["c"]], "ListField(StringField)"),
    "list_int": ([[1, 2], [3]], "ListField(IntField)"),
    "list_float": ([[1.5], [2.5, 3.5]], "ListField(FloatField)"),
    "list_bool": ([[True], [False]], "ListField(BooleanField)"),
    "list_int_and_float": ([[1], [2.5]], "ListField(FloatField)"),
    "list_big_int": ([[2**40], [1]], "ListField(IntField)"),
    "list_empty_and_str": ([[], ["a"]], "ListField(StringField)"),
    "list_of_dicts": ([[{"k": 1}], [{"k": 2}]], "ListField(DictField)"),
    "dict": ([{"k": 1}, {"k": 2}], "DictField"),
    "embedded_label": (
        [fo.Classification(label="x"), fo.Classification(label="y")],
        "EmbeddedDocumentField(Classification)",
    ),
    "str_and_int": (["a", 1], None),
    "bool_and_int": ([True, 1], None),
    "float_and_str": ([1.5, "a"], None),
    "str_and_list": (["a", ["b"]], None),
    "list_mixed": ([["a", 1], ["b"]], None),
    "list_empty_only": ([[], []], None),
}


def _describe(field):
    if field is None:
        return None
    name = type(field).__name__
    if isinstance(field, fof.ListField) and field.field is not None:
        name += "(%s)" % type(field.field).__name__
    if isinstance(field, fof.EmbeddedDocumentField):
        name += "(%s)" % field.document_type.__name__
    return name


def _set_case_values(label, i):
    for name, (values, _) in _TYPE_CASES.items():
        label[name] = values[i]


class AttributeTypeTests(unittest.TestCase):
    """Every kind of stored value is declared with the type the full
    dynamic schema scan picks, or skipped as it would be."""

    def _assert_declared(self, dataset, path, base):
        label_schemas = {
            path: {
                "type": "detections",
                "attributes": [
                    {"name": name, "type": "str"} for name in _TYPE_CASES
                ],
            }
        }
        with self.assertLogs(foau.logger, level="WARNING"):
            declared = foa.declare_label_schema_attributes(
                dataset, label_schemas
            )

        for name, (_, expected) in _TYPE_CASES.items():
            with self.subTest(attribute=name):
                attr_path = "%s.%s" % (base, name)
                self.assertEqual(
                    _describe(dataset.get_field(attr_path)), expected
                )
                self.assertEqual(attr_path in declared, expected is not None)

        # declared attributes are filterable
        self.assertEqual(
            dataset.count_values("%s.str" % base), {"a": 1, "b": 1}
        )

    @drop_datasets
    def test_label_list(self):
        dataset = fo.Dataset()
        for i in range(2):
            detection = fo.Detection(label="x", bounding_box=[0, 0, 1, 1])
            _set_case_values(detection, i)
            dataset.add_sample(
                fo.Sample(
                    filepath="/tmp/%d.png" % i,
                    gt=fo.Detections(detections=[detection]),
                )
            )

        self._assert_declared(dataset, "gt", "gt.detections")

    @drop_datasets
    def test_single_label(self):
        dataset = fo.Dataset()
        for i in range(2):
            classification = fo.Classification(label="x")
            _set_case_values(classification, i)
            dataset.add_sample(
                fo.Sample(filepath="/tmp/%d.png" % i, cls=classification)
            )

        self._assert_declared(dataset, "cls", "cls")

    @drop_datasets
    def test_frame_labels(self):
        dataset = fo.Dataset()
        for i in range(2):
            sample = fo.Sample(filepath="/tmp/%d.mp4" % i)
            for frame_number in (1, 2):
                detection = fo.Detection(label="x", bounding_box=[0, 0, 1, 1])
                _set_case_values(detection, i)
                sample.frames[frame_number] = fo.Frame(
                    gt=fo.Detections(detections=[detection])
                )
            dataset.add_sample(sample)

        self._assert_declared_frames(dataset)

    def _assert_declared_frames(self, dataset):
        label_schemas = {
            "frames.gt": {
                "type": "detections",
                "attributes": [
                    {"name": name, "type": "str"} for name in _TYPE_CASES
                ],
            }
        }
        with self.assertLogs(foau.logger, level="WARNING"):
            declared = foa.declare_label_schema_attributes(
                dataset, label_schemas
            )

        for name, (_, expected) in _TYPE_CASES.items():
            with self.subTest(attribute=name):
                attr_path = "frames.gt.detections." + name
                self.assertEqual(
                    _describe(dataset.get_field(attr_path)), expected
                )
                self.assertEqual(attr_path in declared, expected is not None)

        self.assertEqual(
            dataset.count_values("frames.gt.detections.str"),
            {"a": 2, "b": 2},
        )

    @drop_datasets
    def test_temporal_labels(self):
        dataset = fo.Dataset()
        for i in range(2):
            event = fo.TemporalDetection(label="e", support=[1, 2])
            _set_case_values(event, i)
            dataset.add_sample(
                fo.Sample(
                    filepath="/tmp/%d.mp4" % i,
                    events=fo.TemporalDetections(detections=[event]),
                )
            )

        self._assert_declared(dataset, "events", "events.detections")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
