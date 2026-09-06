"""
Filepath compatibility tests for media-reference-aware code paths.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import asyncio
from functools import partial
import json
import os
import tempfile
import unittest
from unittest import mock

from bson import ObjectId
from decorators import drop_datasets
from mongoengine.errors import ValidationError

import fiftyone as fo
import fiftyone.core.collections as foc
import fiftyone.core.dataset as fod
import fiftyone.core.media as fom
import fiftyone.core.media_assets as foma
import fiftyone.core.utils as fou
from fiftyone.server.samples import (
    ImageSample,
    PointCloudSample,
    ThreeDSample,
    VideoSample,
    _create_sample_item,
)
import fiftyone.types as fot


class FilepathMediaReferenceRegressionTests(unittest.TestCase):
    @drop_datasets
    def test_filepath_identity_avoids_reference_collection_scans(self):
        dataset = fo.Dataset()
        dataset.add_sample(fo.Sample(filepath="image.jpg"))

        collection = dataset._sample_collection
        with mock.patch.object(
            fo.Dataset,
            "_get_sample_collection",
            return_value=collection,
        ), mock.patch.object(
            collection,
            "distinct",
            side_effect=AssertionError("filepath datasets must not scan"),
        ), mock.patch.object(
            collection,
            "find_one",
            side_effect=AssertionError("filepath datasets must not probe"),
        ), mock.patch.object(
            collection,
            "aggregate",
            side_effect=AssertionError("filepath datasets must not aggregate"),
        ):
            self.assertIsNone(dataset.media_reference_kind)
            self.assertFalse(dataset._contains_media_references())
            self.assertEqual(
                dataset._get_default_indexes(),
                ["id", "filepath", "created_at", "last_modified_at"],
            )
            self.assertIn(
                "filepath", dataset._sample_doc_cls._get_default_fields()
            )
            self.assertNotIn(
                "media_reference",
                dataset._sample_doc_cls._get_default_fields(),
            )
            self.assertNotIn("media_reference", dataset.get_field_schema())

        raw = dataset._sample_collection.find_one()
        self.assertIn("filepath", raw)
        self.assertNotIn("media_reference", raw)

        serialized = dataset.first().to_dict()
        self.assertEqual(
            dataset.first().get_media_key(), dataset.first().filepath
        )
        self.assertIn("filepath", serialized)
        self.assertNotIn("media_reference", serialized)

        indexes = dataset.get_index_information()
        self.assertIn("filepath", indexes)
        self.assertNotIn("media_reference.key", indexes)

    @drop_datasets
    def test_add_samples_streams_and_preserves_completed_batches(self):
        dataset = fo.Dataset()
        consumed = []

        def samples():
            for index in range(4):
                consumed.append(index)
                yield fo.Sample(filepath="image-%d.jpg" % index)

        batches = dataset.add_samples(
            samples(),
            batcher=partial(fou.StaticBatcher, batch_size=2),
            generator=True,
        )
        self.assertEqual(consumed, [])

        first_ids = next(batches)
        self.assertEqual(len(first_ids), 2)
        self.assertEqual(consumed, [0, 1])

        batches.close()
        self.assertEqual(len(dataset), 2)
        self.assertEqual(consumed, [0, 1])

        partial_dataset = fo.Dataset()

        def failing_samples():
            yield fo.Sample(filepath="partial-0.jpg")
            yield fo.Sample(filepath="partial-1.jpg")
            raise RuntimeError("source failed")

        with self.assertRaisesRegex(RuntimeError, "source failed"):
            partial_dataset.add_samples(
                failing_samples(),
                batcher=partial(fou.StaticBatcher, batch_size=2),
            )

        self.assertEqual(len(partial_dataset), 2)

    @drop_datasets
    def test_large_add_and_merge_iterables_are_consumed_by_batch(self):
        total = 10000

        def assert_first_batch(operation):
            consumed = 0

            def samples():
                nonlocal consumed
                for index in range(total):
                    consumed += 1
                    yield fo.Sample(filepath="image-%d.jpg" % index)

            def stop_after_first_batch(dataset, batch):
                raise RuntimeError("first batch seen")

            def static_batcher(iterable, **kwargs):
                return fou.StaticBatcher(
                    iterable,
                    batch_size=8,
                    transform_fn=kwargs.get("transform_fn"),
                    progress=kwargs.get("progress"),
                    total=kwargs.get("total"),
                )

            with mock.patch.object(
                fo.Dataset,
                "_add_samples_batch",
                new=stop_after_first_batch,
            ), mock.patch(
                "fiftyone.core.utils.get_default_batcher",
                side_effect=static_batcher,
            ), self.assertRaisesRegex(
                RuntimeError, "first batch seen"
            ):
                operation(samples())

            self.assertEqual(consumed, 8)

        add_dataset = fo.Dataset()
        assert_first_batch(add_dataset.add_samples)

        merge_dataset = fo.Dataset()
        assert_first_batch(merge_dataset.merge_samples)

    @drop_datasets
    def test_media_reference_is_reserved_on_filepath_datasets(self):
        sample = fo.Sample(filepath="image.jpg")
        self.assertIsNone(sample.media_reference)
        self.assertIn("filepath", sample.field_names)
        self.assertNotIn("media_reference", sample.field_names)
        self.assertIn("filepath", sample.to_dict())
        self.assertNotIn("media_reference", sample.to_dict())

        with self.assertRaises(TypeError):
            fo.Sample(filepath="image.jpg", media_reference="constructed")

        with self.assertRaises(ValueError):
            sample.media_reference = "assigned"

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        self.assertNotIn("media_reference", dataset.get_field_schema())
        self.assertNotIn(
            "media_reference", dataset.select_fields().get_field_schema()
        )
        self.assertFalse(
            any(
                path.startswith("media_reference")
                for path in dataset.get_field_schema(flat=True)
            )
        )

        with self.assertRaises(fo.UnsupportedMediaReferenceOperation):
            dataset.set_values("media_reference", [None])

        self.assertNotIn(
            "media_reference",
            {field.name for field in dataset._doc.sample_fields},
        )

    @drop_datasets
    def test_filepath_exception_types_remain_compatible(self):
        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
            fo.Sample()

        with self.assertRaises(TypeError):
            fo.Sample(filepath=None)

        with self.assertRaises(TypeError):
            # pylint: disable-next=no-value-for-parameter
            fo.Sample(media_reference={})

        sample = fo.Sample(filepath="image.jpg")
        sample.filepath = "replacement.jpg"
        self.assertTrue(sample.filepath.endswith("replacement.jpg"))

        with self.assertRaises(fom.MediaTypeError):
            sample.filepath = "video.mp4"

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        filepath = sample.filepath
        try:
            for invalid_filepath in (None, ""):
                sample._doc.filepath = invalid_filepath
                with self.assertRaises(ValidationError):
                    sample.save()
        finally:
            sample._doc.filepath = filepath

    @drop_datasets
    def test_native_max_samples_progress_total(self):
        source = fo.Dataset()
        source.add_samples(
            [fo.Sample(filepath="image-%d.jpg" % i) for i in range(5)]
        )

        with tempfile.TemporaryDirectory() as tmp_dir:
            export_dir = os.path.join(tmp_dir, "export")
            with mock.patch.object(
                foma,
                "_ReferenceAssetPlanBuilder",
                side_effect=AssertionError(
                    "filepath exports must not construct reference plans"
                ),
            ), mock.patch.object(
                foma,
                "_export_media_reference_bindings",
                side_effect=AssertionError(
                    "filepath exports must not query reference bindings"
                ),
            ), mock.patch.object(
                foma,
                "_hydrate_media_reference_binding",
                side_effect=AssertionError(
                    "filepath exports must not hydrate references"
                ),
            ):
                source.export(
                    export_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                    export_media=False,
                )

            with open(os.path.join(export_dir, "samples.json")) as file:
                exported_samples = json.load(file)["samples"]

            self.assertTrue(
                all("media_reference" not in s for s in exported_samples)
            )
            self.assertTrue(all("filepath" in s for s in exported_samples))

            events = []

            def progress(pb):
                events.append((pb.total, pb.iteration, pb.complete))

            with mock.patch(
                "fiftyone.utils.data.importers.fomi.migrate_dataset_if_necessary"
            ):
                imported = fo.Dataset.from_dir(
                    dataset_dir=export_dir,
                    dataset_type=fot.FiftyOneDataset,
                    max_samples=2,
                    progress=progress,
                )

        self.assertEqual(len(imported), 2)
        self.assertTrue(events)
        self.assertTrue(all(total == 2 for total, _, _ in events))
        self.assertEqual(events[-1], (2, 2, True))

    def test_filepath_grid_media_type_uses_filepath(self):
        async def get_metadata(
            dataset,
            sample,
            media_type,
            metadata_cache,
            url_cache,
            **kwargs,
        ):
            metadata = {"urls": [], "aspect_ratio": 1.0}
            if media_type == fom.VIDEO:
                metadata["frame_rate"] = 30.0

            return metadata

        cases = (
            ("image.jpg", fom.VIDEO, ImageSample),
            ("video.mp4", fom.IMAGE, VideoSample),
            ("point-cloud.pcd", fom.VIDEO, PointCloudSample),
            ("scene.fo3d", fom.VIDEO, ThreeDSample),
            ("grouped.jpg", fom.VIDEO, ImageSample),
        )
        with mock.patch(
            "fiftyone.server.samples.fosm.get_metadata",
            side_effect=get_metadata,
        ):
            for filepath, stored_media_type, expected_type in cases:
                with self.subTest(filepath=filepath):
                    sample = {
                        "_id": ObjectId(),
                        "filepath": filepath,
                        "_media_type": stored_media_type,
                    }
                    if filepath == "grouped.jpg":
                        sample["group"] = {
                            "_id": ObjectId(),
                            "name": "left",
                        }

                    item = asyncio.run(
                        _create_sample_item(
                            mock.Mock(),
                            sample,
                            {},
                            {},
                            True,
                            additional_media_fields=(None, (), ()),
                        )
                    )
                    self.assertIsInstance(item, expected_type)
                    self.assertEqual(item.sample["filepath"], filepath)
                    self.assertNotIn("media_reference", item.sample)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
