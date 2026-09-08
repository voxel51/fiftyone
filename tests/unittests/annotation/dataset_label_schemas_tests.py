"""
FiftyOne annotation unit tests.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import unittest

from exceptiongroup import ExceptionGroup

import fiftyone as fo
import fiftyone.core.labels as fol
from fiftyone.core.annotation.attributes import AttributeSpec
from fiftyone.core.ontology import AnnotationOntology, apply_ontology

from decorators import drop_datasets, drop_ontologies


class DatasetAnnotationTests(unittest.TestCase):
    @drop_datasets
    def test_empty_label_schemas(self):
        dataset = fo.Dataset()
        dataset.active_label_schemas = []
        dataset.active_label_schemas = None
        self.assertEqual(dataset.active_label_schemas, [])
        with self.assertRaises(ValueError):
            dataset.active_label_schemas = ["one"]

        self.assertEqual(dataset.label_schemas, {})
        dataset.set_label_schemas(None)
        self.assertEqual(dataset.label_schemas, {})
        dataset.set_label_schemas({})

    @drop_datasets
    def test_active_label_schemas(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)

        with self.assertRaises(ValueError):
            dataset.activate_label_schemas("test")

        with self.assertRaises(ValueError):
            dataset.deactivate_label_schemas("test")

        with self.assertRaises(ValueError):
            dataset.active_label_schemas = ["test"]

        # noop
        dataset.activate_label_schemas()

        # noop
        dataset.deactivate_label_schemas()

        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas()
        self.assertEqual(dataset.active_label_schemas, ["test"])

        dataset.deactivate_label_schemas()
        self.assertEqual(dataset.active_label_schemas, [])

        dataset.active_label_schemas = ["test"]

        dataset.add_sample_field("other", fo.StringField)
        dataset.update_label_schema(
            "other", {"type": "str", "component": "text"}
        )

        dataset.activate_label_schemas("other")
        self.assertEqual(dataset.active_label_schemas, ["test", "other"])

        dataset.deactivate_label_schemas("test")
        dataset.activate_label_schemas("test")
        self.assertEqual(dataset.active_label_schemas, ["other", "test"])

        dataset.active_label_schemas = ["test", "other"]
        self.assertEqual(dataset.active_label_schemas, ["test", "other"])

    @drop_datasets
    def test_delete_sample_field(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas("test")
        dataset.delete_sample_field("test")

        self.assertNotIn("test", dataset.active_label_schemas)
        self.assertNotIn("test", dataset.label_schemas)

        dataset.add_sample_field(
            "detections",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Detections,
        )
        dataset.add_sample_field("detections.detections.int", fo.IntField)
        dataset.set_label_schemas(
            {
                "detections": {
                    "attributes": [
                        {"name": "int", "component": "text", "type": "int"}
                    ],
                    "type": "detections",
                },
            }
        )

        dataset.delete_sample_field("detections.detections.int")
        self.assertEqual(
            {
                "detections": {
                    "attributes": [],
                    "type": "detections",
                },
            },
            dataset.label_schemas,
        )

        dataset.add_sample_field(
            "doc",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("doc.int", fo.IntField)
        dataset.set_label_schemas(
            {"doc.int": {"component": "text", "type": "int"}}
        )

        dataset.delete_sample_field("doc")
        self.assertNotIn("doc.int", dataset.label_schemas)

    @drop_datasets
    def test_update_label_schema(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("test", fo.IntField)

        dataset.update_label_schema(
            "test", {"type": "int", "component": "text"}
        )
        self.assertEqual(
            dataset.label_schemas,
            {"test": {"type": "int", "component": "text"}},
        )

        dataset.update_label_schema(
            "test", {"type": "int", "component": "text"}
        )
        self.assertEqual(
            dataset.label_schemas,
            {"test": {"type": "int", "component": "text"}},
        )

        with self.assertRaises(ExceptionGroup):
            dataset.update_label_schema(
                "missing",
                {
                    "type": "int",
                    "component": "text",
                },
            )

    @drop_datasets
    def test_rename_sample_field(self):
        dataset = fo.Dataset()

        dataset.add_sample_field("test", fo.IntField)
        dataset.set_label_schemas(
            {"test": {"type": "int", "component": "text"}}
        )
        dataset.activate_label_schemas()
        dataset.rename_sample_field("test", "renamed")
        self.assertEqual(
            dataset.label_schemas,
            {"renamed": {"type": "int", "component": "text"}},
        )
        self.assertEqual(dataset.active_label_schemas, ["renamed"])

        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        dataset.add_sample_field("test_label.test", fo.IntField)
        dataset.set_label_schemas(
            {
                "test_label": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classification",
                }
            }
        )

        dataset.rename_sample_field("test_label", "renamed_label")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_label": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classification",
                }
            },
        )

        dataset.add_sample_field(
            "test_labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classifications,
        )
        dataset.add_sample_field(
            "test_labels.classifications.test", fo.IntField
        )
        dataset.set_label_schemas(
            {
                "test_labels": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classifications",
                }
            }
        )

        dataset.rename_sample_field("test_labels", "renamed_labels")
        self.assertEqual(
            dataset.label_schemas,
            {
                "renamed_labels": {
                    "attributes": [
                        {"name": "test", "type": "int", "component": "text"}
                    ],
                    "type": "classifications",
                }
            },
        )

        dataset.rename_sample_field(
            "renamed_labels.classifications.test",
            "renamed_labels.classifications.renamed",
        )
        self.assertEqual(
            dataset.label_schemas["renamed_labels"],
            {
                "attributes": [
                    {"name": "renamed", "type": "int", "component": "text"}
                ],
                "type": "classifications",
            },
        )

        dataset.add_sample_field(
            "dynamic",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("dynamic.subfield", fo.IntField)
        dataset.update_label_schema(
            "dynamic.subfield", {"type": "int", "component": "text"}
        )
        dataset.rename_sample_field("dynamic", "dynamic_renamed")
        self.assertNotIn("dynamic.subfield", dataset.label_schemas)
        self.assertIn("dynamic_renamed.subfield", dataset.label_schemas)

    @drop_datasets
    def test_set_label_schemas(self):
        dataset = fo.Dataset()

        dataset.set_label_schemas(
            {
                "filepath": {"type": "str", "component": "text"},
            }
        )

        dataset.reload()
        self.assertEqual(
            dataset.label_schemas,
            {
                "filepath": {"type": "str", "component": "text"},
            },
        )

        # wrong 'type'
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "filepath": {"type": "int", "component": "text"},
                }
            )

        # missing field
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "no_field": {"type": "str", "component": "text"},
                }
            )

    @drop_datasets
    def test_temporal_detection_supported(self):
        # TemporalDetection(s) are valid annotation label types (the
        # video-annotation sidebar edits them); they were previously rejected
        # as globally unsupported.
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="/tmp/video.mp4"))
        self.assertEqual(dataset.media_type, "video")

        for label_type in [fol.TemporalDetection, fol.TemporalDetections]:
            type_ = label_type.__name__.lower()
            dataset.add_sample_field(
                "events",
                fo.EmbeddedDocumentField,
                embedded_doc_type=label_type,
            )
            dataset.set_label_schemas({"events": {"type": type_}})
            dataset.reload()
            self.assertEqual(dataset.label_schemas["events"]["type"], type_)
            dataset.set_label_schemas(None)
            dataset.delete_sample_field("events")

    @drop_datasets
    def test_unsupported(self):
        dataset = fo.Dataset()
        for label_type in [
            fol.GeoLocation,
            fol.GeoLocations,
        ]:
            dataset.add_sample_field(
                "unsupported",
                fo.EmbeddedDocumentField,
                embedded_doc_type=label_type,
            )
            with self.assertRaises(ExceptionGroup):
                dataset.set_label_schemas(
                    {"unsupported": {"type": label_type.__name__.lower()}}
                )
            dataset.delete_sample_field("unsupported")

        # embedded document lists are not supported
        dataset.add_sample_field(
            "unsupported",
            fo.ListField,
            subfield=fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("unsupported.subfield", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {"unsupported.subfield": {"type": "int", "component": "text"}}
            )
        dataset.delete_sample_field("unsupported")

        # too.much.nesting
        dataset.add_sample_field(
            "unsupported",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field(
            "unsupported.subfield",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.DynamicEmbeddedDocument,
        )
        dataset.add_sample_field("unsupported.subfield.nesting", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "unsupported.subfield.nesting": {
                        "type": "int",
                        "component": "text",
                    },
                }
            )
        dataset.delete_sample_field("unsupported.subfield.nesting")

        # labels are not.expanded
        dataset.add_sample_field(
            "labels",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classifications,
        )
        dataset.add_sample_field("labels.subfield", fo.IntField)
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "labels.subfield": {
                        "type": "int",
                        "component": "text",
                    },
                }
            )
        dataset.delete_sample_field("labels")

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_apply(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        schemas = apply_ontology(
            dataset.label_schemas, "detections", "my_ontology"
        )
        dataset.set_label_schemas(schemas)

        self.assertEqual(
            dataset.label_schemas["detections"].get("applied_ontology"),
            "my_ontology",
        )
        # other keys are preserved
        self.assertEqual(
            dataset.label_schemas["detections"]["type"], "detections"
        )

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_unset(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", "my_ontology")
        )
        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", None)
        )
        self.assertNotIn(
            "applied_ontology", dataset.label_schemas["detections"]
        )

        # idempotent: unsetting again is a no-op
        dataset.set_label_schemas(
            apply_ontology(dataset.label_schemas, "detections", None)
        )

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_invalid_reference_raises(self):
        dataset = _make_applied_ontology_test_dataset()
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        schemas = apply_ontology(
            dataset.label_schemas, "detections", "nonexistent_ontology_xyz"
        )
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(schemas)

    @drop_datasets
    @drop_ontologies
    def test_apply_ontology_does_not_mutate_input(self):
        original = {"detections": {"type": "detections"}}
        result = apply_ontology(original, "detections", "my_ontology")

        self.assertNotIn("applied_ontology", original["detections"])
        self.assertEqual(
            result["detections"]["applied_ontology"], "my_ontology"
        )

    @drop_datasets
    @drop_ontologies
    def test_update_label_schema_dehydrates_before_saving(self):
        AnnotationOntology(
            name="my_ontology",
            attributes=[
                AttributeSpec(name="owned", type="bool", component="checkbox"),
            ],
        ).save()

        dataset = fo.Dataset()
        dataset.add_sample(
            fo.Sample(
                filepath="image.png",
                detections=fo.Detections(
                    detections=[fo.Detection(label="one")]
                ),
            )
        )
        dataset.set_label_schemas({"detections": {"type": "detections"}})

        # simulate the frontend echoing back a hydrated schema: an
        # ontology-owned attribute with a _source marker, plus a local
        # attribute that somehow acquired a forged _source
        hydrated_payload = {
            "type": "detections",
            "applied_ontology": "my_ontology",
            "attributes": [
                {
                    "name": "owned",
                    "type": "bool",
                    "component": "checkbox",
                    "_source": "my_ontology",
                },
                {
                    "name": "local",
                    "type": "str",
                    "component": "text",
                    "_source": "forged",
                },
            ],
        }
        dataset.update_label_schema(
            "detections", hydrated_payload, allow_new_attrs=True
        )

        saved = dataset.label_schemas["detections"]
        names = [a["name"] for a in saved["attributes"]]
        self.assertEqual(names, ["local"])
        self.assertNotIn("_source", saved["attributes"][0])


class FrameLabelSchemaTests(unittest.TestCase):
    """Frame label fields are addressed by their ``frames.<field>`` path
    everywhere, but persisted under their relative name in a separate store so
    the dotted path never becomes a Mongo dict key."""

    @drop_datasets
    def test_frame_label_schema_roundtrip(self):
        dataset = _make_video_dataset()
        schema = dataset.generate_label_schemas(
            "frames.detections", scan_samples=False
        )

        dataset.set_label_schemas({"frames.detections": schema})

        self.assertEqual(list(dataset.label_schemas), ["frames.detections"])

        # the dotted path must never reach the sample-level store; it lives in
        # the frame store under its relative name
        self.assertEqual(dataset._doc.label_schemas, {})
        self.assertIn("detections", dataset._doc.frame_label_schemas)

        dataset.reload()
        self.assertEqual(list(dataset.label_schemas), ["frames.detections"])

    @drop_datasets
    def test_frame_and_sample_schemas_coexist(self):
        dataset = _make_video_dataset()
        dataset.add_sample_field("weather", fo.StringField)

        frame_schema = dataset.generate_label_schemas(
            "frames.detections", scan_samples=False
        )
        sample_schema = dataset.generate_label_schemas(
            "weather", scan_samples=False
        )

        dataset.set_label_schemas(
            {"frames.detections": frame_schema, "weather": sample_schema}
        )

        self.assertEqual(
            set(dataset.label_schemas), {"frames.detections", "weather"}
        )
        self.assertEqual(list(dataset._doc.label_schemas), ["weather"])
        self.assertEqual(
            list(dataset._doc.frame_label_schemas), ["detections"]
        )

    @drop_datasets
    def test_frame_label_schema_activation(self):
        dataset = _make_video_dataset()
        schema = dataset.generate_label_schemas(
            "frames.detections", scan_samples=False
        )
        dataset.update_label_schema("frames.detections", schema)

        dataset.activate_label_schemas("frames.detections")
        self.assertEqual(dataset.active_label_schemas, ["frames.detections"])

        dataset.deactivate_label_schemas("frames.detections")
        self.assertEqual(dataset.active_label_schemas, [])

        dataset.active_label_schemas = ["frames.detections"]
        self.assertEqual(dataset.active_label_schemas, ["frames.detections"])

        with self.assertRaises(ValueError):
            dataset.active_label_schemas = ["frames.missing"]

    @drop_datasets
    def test_update_and_delete_frame_label_schema(self):
        dataset = _make_video_dataset()
        schema = dataset.generate_label_schemas(
            "frames.detections", scan_samples=False
        )

        dataset.update_label_schema("frames.detections", schema)
        self.assertIn("frames.detections", dataset.label_schemas)
        self.assertIn("detections", dataset._doc.frame_label_schemas)

        dataset.delete_label_schemas("frames.detections")
        self.assertEqual(dataset.label_schemas, {})
        self.assertEqual(dataset._doc.frame_label_schemas, {})

    @drop_datasets
    def test_clone_preserves_frame_label_schemas(self):
        dataset = _make_video_dataset()
        schema = dataset.generate_label_schemas(
            "frames.detections", scan_samples=False
        )
        dataset.set_label_schemas({"frames.detections": schema})
        dataset.activate_label_schemas("frames.detections")

        clone = dataset.clone()
        self.addCleanup(clone.delete)

        self.assertEqual(list(clone.label_schemas), ["frames.detections"])
        self.assertEqual(list(clone._doc.label_schemas), [])
        self.assertIn("detections", clone._doc.frame_label_schemas)
        self.assertEqual(clone.active_label_schemas, ["frames.detections"])

    @drop_datasets
    def test_list_valid_annotation_fields_includes_frames(self):
        import fiftyone.core.annotation.utils as foau

        dataset = _make_video_dataset()

        without_frames = foau.list_valid_annotation_fields(
            dataset, flatten=True
        )
        self.assertNotIn("frames.detections", without_frames)

        with_frames = foau.list_valid_annotation_fields(
            dataset, flatten=True, include_frames=True
        )
        self.assertIn("frames.detections", with_frames)

    @drop_datasets
    def test_sample_level_spatial_labels_excluded_for_video(self):
        import fiftyone.core.annotation.utils as foau

        dataset = _make_video_dataset()
        dataset.add_sample_field(
            "ground_truth", fo.EmbeddedDocumentField, fo.Detections
        )
        dataset.add_sample_field("weather", fo.StringField)

        valid = foau.list_valid_annotation_fields(
            dataset, flatten=True, include_frames=True
        )

        # sample-level spatial labels belong on frames, not the clip
        self.assertNotIn("ground_truth", valid)
        # frame-level spatial labels and sample-level primitives are still valid
        self.assertIn("frames.detections", valid)
        self.assertIn("weather", valid)

    @drop_datasets
    def test_backfill_instances_from_index(self):
        import fiftyone.core.annotation.utils as foau

        dataset = _make_video_dataset()
        sample = fo.Sample(filepath="/tmp/video.mp4")
        sample.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="car", index=1, bounding_box=[0, 0, 0.1, 0.1]
                    )
                ]
            )
        )
        sample.frames[2] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="car", index=1, bounding_box=[0, 0, 0.1, 0.1]
                    ),
                    fo.Detection(
                        label="ped", index=2, bounding_box=[0.5, 0.5, 0.1, 0.1]
                    ),
                ]
            )
        )
        dataset.add_sample(sample)

        foau.backfill_instances_from_index(dataset, "frames.detections")

        sample.reload()
        car_f1 = sample.frames[1].detections.detections[0]
        f2 = sample.frames[2].detections.detections
        car_f2 = next(d for d in f2 if d.index == 1)
        ped_f2 = next(d for d in f2 if d.index == 2)

        # every indexed label gets an instance
        self.assertIsNotNone(car_f1.instance)
        self.assertIsNotNone(ped_f2.instance)
        # the same index within a sample is one track
        self.assertEqual(car_f1.instance.id, car_f2.instance.id)
        # distinct indices are distinct tracks
        self.assertNotEqual(car_f2.instance.id, ped_f2.instance.id)

    @drop_datasets
    def test_backfill_all_fields_when_field_omitted(self):
        import fiftyone.core.annotation.utils as foau

        dataset = _make_video_dataset()
        sample = fo.Sample(filepath="/tmp/video.mp4")
        sample.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="car", index=1, bounding_box=[0, 0, 0.1, 0.1]
                    )
                ]
            )
        )
        dataset.add_sample(sample)

        # the all-fields path (no explicit field) mirrors the all-fields scan
        foau.backfill_instances_from_index(dataset)

        sample.reload()
        self.assertIsNotNone(
            sample.frames[1].detections.detections[0].instance
        )

    @drop_datasets
    def test_backfill_skips_fields_with_existing_instances(self):
        import fiftyone.core.annotation.utils as foau

        dataset = _make_video_dataset()
        existing = fol.Instance()
        sample = fo.Sample(filepath="/tmp/video.mp4")
        sample.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(
                        label="car",
                        index=1,
                        instance=existing,
                        bounding_box=[0, 0, 0.1, 0.1],
                    )
                ]
            )
        )
        dataset.add_sample(sample)
        original_id = sample.frames[1].detections.detections[0].instance.id

        foau.backfill_instances_from_index(dataset, "frames.detections")

        sample.reload()
        self.assertEqual(
            sample.frames[1].detections.detections[0].instance.id, original_id
        )

    @drop_datasets
    def test_frame_attribute_dynamic_flag(self):
        dataset = _make_video_dataset()
        dataset.add_frame_field(
            "detections.detections.turn_signal", fo.StringField
        )

        dataset.set_label_schemas(
            {
                "frames.detections": {
                    "type": "detections",
                    "attributes": [
                        {
                            "name": "turn_signal",
                            "component": "text",
                            "type": "str",
                            "dynamic": True,
                        }
                    ],
                }
            }
        )

        saved = dataset.label_schemas["frames.detections"]
        self.assertTrue(saved["attributes"][0]["dynamic"])

        # a non-boolean 'dynamic' value is rejected
        with self.assertRaises(ExceptionGroup):
            dataset.set_label_schemas(
                {
                    "frames.detections": {
                        "type": "detections",
                        "attributes": [
                            {
                                "name": "turn_signal",
                                "component": "text",
                                "type": "str",
                                "dynamic": "yes",
                            }
                        ],
                    }
                }
            )

    @drop_datasets
    def test_create_and_activate_frame_field_operator(self):
        from fiftyone.operators.executor import ExecutionContext
        from plugins.operators.annotation import CreateAndActivateField

        dataset = fo.Dataset()
        dataset.media_type = "video"

        ctx = ExecutionContext(
            operator_uri="create_and_activate_field",
            request_params={
                "dataset_name": dataset.name,
                "params": {
                    "field_name": "frames.detections",
                    "field_category": "label",
                    "field_type": "detections",
                    "label_schema_config": {"classes": ["car", "person"]},
                },
            },
        )

        result = CreateAndActivateField().execute(ctx)
        self.assertNotIn("error", result)

        dataset.reload()

        # the field is added to the FRAME schema, not the sample schema
        self.assertIn("detections", dataset.get_frame_field_schema())
        self.assertNotIn("detections", dataset.get_field_schema())

        # its schema is stored and activated under the "frames." path
        self.assertIn("frames.detections", dataset.label_schemas)
        self.assertIn("frames.detections", dataset.active_label_schemas)

    @drop_datasets
    def test_create_and_activate_sample_field_operator(self):
        from fiftyone.operators.executor import ExecutionContext
        from plugins.operators.annotation import CreateAndActivateField

        dataset = fo.Dataset()
        dataset.media_type = "video"

        ctx = ExecutionContext(
            operator_uri="create_and_activate_field",
            request_params={
                "dataset_name": dataset.name,
                "params": {
                    "field_name": "events",
                    "field_category": "label",
                    "field_type": "classification",
                    "label_schema_config": {"classes": ["a", "b"]},
                },
            },
        )

        result = CreateAndActivateField().execute(ctx)
        self.assertNotIn("error", result)

        dataset.reload()

        # no "frames." prefix stays a sample-level field
        self.assertIn("events", dataset.get_field_schema())
        self.assertNotIn("events", dataset.get_frame_field_schema())
        self.assertIn("events", dataset.active_label_schemas)


def _make_video_dataset():
    dataset = fo.Dataset()
    dataset.media_type = "video"
    dataset.add_frame_field(
        "detections", fo.EmbeddedDocumentField, fo.Detections
    )
    return dataset


def _make_applied_ontology_test_dataset(ontology_name: str = "my_ontology"):
    """Dataset with a `detections` label field and a `str_field`, with a real
    `AnnotationOntology` named ``ontology_name`` persisted to the `ontologies`
    collection so the validator can resolve the reference.

    Duplicated from `validate_label_schemas_tests.py`; consolidate later.
    """
    AnnotationOntology(name=ontology_name).save()

    dataset = fo.Dataset()
    dataset.add_sample(
        fo.Sample(
            filepath="image.png",
            detections=fo.Detections(detections=[fo.Detection(label="one")]),
        )
    )
    dataset.add_sample_field("str_field", fo.StringField)

    return dataset
