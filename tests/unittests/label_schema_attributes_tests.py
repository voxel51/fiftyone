"""
Label schema attributes are declared on the dataset's field schema.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest
from unittest import mock

import fiftyone as fo
import fiftyone.core.annotation as foa
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
    def test_mixed_type_values_are_skipped(self):
        dataset = self._dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="/tmp/1.png",
                gt=fo.Detections(detections=[fo.Detection(camera=3)]),
            )
        )
        declared = foa.declare_label_schema_attributes(
            dataset, {"gt": _schema(dataset, "gt", _CAMERA)}
        )
        self.assertEqual(declared, [])
        self.assertIsNone(dataset.get_field("gt.detections.camera"))

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
    def test_backfill_declares_existing_schemas(self):
        dataset = self._dataset()
        # saved before attributes were declared on write
        dataset._doc.set_stored_label_schema(
            "gt", _schema(dataset, "gt", _CAMERA, _BRAND)
        )
        dataset.save()
        self.assertIsNone(dataset.get_field("gt.detections.brand"))

        fold.declare_schema_attributes(dataset_id=dataset._doc.id)

        self.assertIsNotNone(dataset.get_field("gt.detections.camera"))
        self.assertIsNotNone(dataset.get_field("gt.detections.brand"))

    @drop_datasets
    def test_backfill_scans_each_field_once_and_does_not_retry(self):
        dataset = self._dataset()
        # brand holds values of mixed types, so it can never be declared
        for i, brand in enumerate(["a", 1]):
            dataset.add_sample(
                fo.Sample(
                    filepath="/tmp/brand%d.png" % i,
                    gt=fo.Detections(
                        detections=[fo.Detection(label="x", brand=brand)]
                    ),
                )
            )

        # the dataset's stored schema and a schema doc both define gt
        dataset._doc.set_stored_label_schema(
            "gt", _schema(dataset, "gt", _CAMERA, _BRAND)
        )
        dataset.save()
        doc = fold.create(
            name="mixed",
            label_schema={"gt": _schema(dataset, "gt", _BRAND)},
            dataset_id=dataset._doc.id,
        )
        self.addCleanup(fold.delete, doc["id"], dataset_id=dataset._doc.id)

        with mock.patch.object(
            fo.Dataset,
            "get_dynamic_field_schema",
            autospec=True,
            side_effect=fo.Dataset.get_dynamic_field_schema,
        ) as scan:
            fold.declare_schema_attributes(dataset_id=dataset._doc.id)
            self.assertEqual(scan.call_count, 1)

            fold.declare_schema_attributes(dataset_id=dataset._doc.id)
            self.assertEqual(scan.call_count, 1)

        self.assertIsNone(dataset.get_field("gt.detections.brand"))

    @drop_datasets
    def test_backfill_retries_after_a_failed_declaration(self):
        dataset = self._dataset()
        dataset._doc.set_stored_label_schema(
            "gt", _schema(dataset, "gt", _BRAND)
        )
        dataset.save()

        with mock.patch.object(
            foa,
            "declare_label_schema_attributes",
            side_effect=RuntimeError("boom"),
        ):
            fold.declare_schema_attributes(dataset_id=dataset._doc.id)

        self.assertIsNone(dataset.get_field("gt.detections.brand"))

        fold.declare_schema_attributes(dataset_id=dataset._doc.id)

        self.assertIsNotNone(dataset.get_field("gt.detections.brand"))


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
