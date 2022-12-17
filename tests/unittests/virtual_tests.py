"""
FiftyOne virtual field unit tests.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import fiftyone as fo
from fiftyone import ViewField as F

from decorators import drop_datasets


class VirtualFieldTests(unittest.TestCase):
    def _make_dataset(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            metadata=fo.ImageMetadata(width=10, height=10),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )

        sample2 = fo.Sample(
            filepath="image2.jpg",
            metadata=fo.ImageMetadata(width=10, height=10),
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="rabbit",
                        bounding_box=[0.1, 0.1, 0.8, 0.8],
                    ),
                ]
            ),
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.add_sample_field(
            "num_objects",
            fo.IntField,
            expr=F("ground_truth.detections").length(),
        )

        bbox_area = (
            F("$metadata.width")
            * F("bounding_box")[2]
            * F("$metadata.height")
            * F("bounding_box")[3]
        )

        dataset.add_sample_field(
            "ground_truth.detections.area",
            fo.FloatField,
            expr=bbox_area,
        )

        return dataset

    @drop_datasets
    def test_schema(self):
        dataset = self._make_dataset()

        field = dataset.get_field("num_objects")
        self.assertTrue(field.is_virtual)

        field = dataset.get_field("filepath")
        self.assertFalse(field.is_virtual)

        schema = dataset.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        schema = dataset.get_field_schema()
        self.assertIn("num_objects", schema)

        schema = dataset.get_field_schema(virtual=False)
        self.assertNotIn("num_objects", schema)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_field_schema(flat=True, virtual=True)
        self.assertIn("num_objects", schema)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_field_schema(flat=True, virtual=False)
        self.assertNotIn("num_objects", schema)
        self.assertNotIn("ground_truth.detections.area", schema)

        dataset.rename_sample_field("num_objects", "num_objs")

        schema = dataset.get_field_schema()
        self.assertNotIn("num_objects", schema)
        self.assertIn("num_objs", schema)

        field = dataset.get_field("num_objs")
        self.assertTrue(field.is_virtual)

        sample = dataset.first()

        self.assertTrue(sample.num_objs, 2)

        with self.assertRaises(AttributeError):
            sample.num_objects

        with self.assertRaises(ValueError):
            sample.num_objs = 12

        # Virtual fields cannot be cleared
        with self.assertRaises(ValueError):
            dataset.clear_sample_field("num_objs")

        dataset.clone_sample_field("num_objs", "still_num_objs")

        schema = dataset.get_field_schema()
        self.assertIn("num_objs", schema)
        self.assertIn("still_num_objs", schema)

        field = dataset.get_field("num_objs")
        self.assertTrue(field.is_virtual)

        field = dataset.get_field("still_num_objs")
        self.assertTrue(field.is_virtual)

        sample = dataset.first()

        self.assertTrue(sample.num_objs, 2)
        self.assertTrue(sample.still_num_objs, 2)

        with self.assertRaises(ValueError):
            sample.num_objs = 12

        with self.assertRaises(ValueError):
            sample.still_num_objs = 12

        dataset.delete_sample_field("still_num_objs")

        schema = dataset.get_field_schema()
        self.assertNotIn("still_num_objs", schema)

        sample = dataset.first()

        with self.assertRaises(AttributeError):
            sample.still_num_objs

        dataset.rename_sample_field("ground_truth", "gt")

        field = dataset.get_field("num_objs")
        field.expr = F("gt.detections").length()
        field.save()

        values = dataset.values("num_objs")
        self.assertListEqual(values, [2, 1])

        field = dataset.get_field("filepath")

        # Cannot transform regular field into a virtual one
        with self.assertRaises(ValueError):
            field.expr = F("gt.detections").length()

    @drop_datasets
    def test_samples(self):
        dataset = self._make_dataset()

        sample = dataset.first()

        self.assertEqual(sample.num_objects, 2)
        self.assertIsNotNone(sample.ground_truth.detections[0].area)

        sample["int_field"] = 1
        sample.save()

        d = dataset._sample_collection.find_one({"_id": sample._id})
        self.assertNotIn("num_objects", d)
        self.assertNotIn("area", d["ground_truth"]["detections"][0])

        # Virtual fields cannot be edited

        with self.assertRaises(ValueError):
            sample.num_objects = 100

        with self.assertRaises(ValueError):
            dataset.set_values("num_objects", dataset.values("num_objects"))

        with self.assertRaises(ValueError):
            dataset.set_values(
                "ground_truth.detections.area",
                dataset.values("ground_truth.detections.area"),
            )

    @drop_datasets
    def test_aggregations(self):
        dataset = self._make_dataset()

        bounds = dataset.bounds("num_objects")
        self.assertEqual(bounds, (1, 2))

        values = dataset.values("num_objects")
        self.assertListEqual(values, [2, 1])

        bounds = dataset.bounds("ground_truth.detections.area")
        self.assertIsNotNone(bounds[0])
        self.assertIsNotNone(bounds[1])

        values = dataset.values("ground_truth.detections.area", unwind=True)
        self.assertEqual(len(values), 3)
        self.assertIsNotNone(values[0])
        self.assertIsNotNone(values[1])
        self.assertIsNotNone(values[2])

    @drop_datasets
    def test_views(self):
        dataset = self._make_dataset()

        view = dataset.exclude_fields("num_objects")

        schema = view.get_field_schema()
        self.assertNotIn("num_objects", schema)

        sample = view.first()

        with self.assertRaises(AttributeError):
            sample.num_objects

        view = dataset.exclude_fields("ground_truth")

        schema = view.get_virtual_field_schema()
        self.assertNotIn("ground_truth.detections.area", schema)

        sample = view.first()

        with self.assertRaises(AttributeError):
            sample.ground_truth

        view = dataset.exclude_fields("ground_truth.detections.area")

        schema = view.get_virtual_field_schema()
        self.assertNotIn("ground_truth.detections.area", schema)

        sample = view.first()

        with self.assertRaises(AttributeError):
            sample.ground_truth.detections[0].area

        view = dataset.select_fields()

        schema = view.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

        sample = view.first()

        with self.assertRaises(AttributeError):
            sample.num_objects

        view = dataset.filter_labels(
            "ground_truth", F("label") == "cat", only_matches=False
        )

        bounds = view.bounds("num_objects")
        self.assertEqual(bounds, (0, 1))

        values = view.values("num_objects")
        self.assertListEqual(values, [1, 0])

        bounds = view.bounds("ground_truth.detections.area")
        self.assertIsNotNone(bounds[0])
        self.assertIsNotNone(bounds[1])

        values = view.values("ground_truth.detections.area", unwind=True)
        self.assertEqual(len(values), 1)
        self.assertIsNotNone(values[0])

        view2 = view.materialize().match(F("num_objects") == 1)

        self.assertEqual(len(view2), 1)

        sample = view2.first()
        self.assertEqual(sample.num_objects, 1)

        view3 = view2.filter_labels(
            "ground_truth", F("label") != "cat", only_matches=False
        )

        self.assertEqual(len(view3), 1)
        self.assertEqual(view3.count("ground_truth.detections"), 0)

        sample = view3.first()
        self.assertEqual(sample.num_objects, 0)

    @drop_datasets
    def test_save(self):
        dataset = self._make_dataset()

        dataset.save()

        schema = dataset.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        dataset.save(fields="num_objects")

        schema = dataset.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        dataset.save(fields="num_objects", materialize=True)

        schema = dataset.get_virtual_field_schema()
        self.assertNotIn("num_objects", schema)

        field = dataset.get_field("num_objects")
        self.assertFalse(field.is_virtual)

        values = dataset.values("num_objects")
        self.assertListEqual(values, [2, 1])

        dataset.save(materialize=True)

        schema = dataset.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

        field = dataset.get_field("ground_truth.detections.area")
        self.assertFalse(field.is_virtual)

        values = dataset.values("ground_truth.detections.area", unwind=True)
        self.assertEqual(len(values), 3)
        self.assertIsNotNone(values[0])
        self.assertIsNotNone(values[1])
        self.assertIsNotNone(values[2])

    @drop_datasets
    def test_keep_fields(self):
        dataset = self._make_dataset()

        dataset1 = dataset.clone()

        dataset1.select_fields().keep_fields()

        schema = dataset1.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

        dataset2 = dataset.clone()

        schema = dataset2.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        view = dataset2.exclude_fields(
            ["num_objects", "ground_truth.detections.area"]
        ).keep_fields()

        schema = dataset2.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

    @drop_datasets
    def test_clone(self):
        dataset = self._make_dataset()

        dataset2 = dataset.clone()

        schema = dataset2.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        sample = dataset2.first()
        self.assertEqual(sample.num_objects, 2)
        self.assertIsNotNone(sample.ground_truth.detections[0].area)

        for d in dataset2._sample_collection.find({}):
            self.assertNotIn("num_objects", d)

        view = dataset.filter_labels("ground_truth", F("label") == "cat")

        dataset3 = view.clone()

        schema = dataset3.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        self.assertEqual(len(dataset3), 1)
        self.assertEqual(dataset3.count("ground_truth.detections"), 1)

        sample = dataset3.first()
        self.assertEqual(sample.num_objects, 1)
        self.assertIsNotNone(sample.ground_truth.detections[0].area)

        for d in dataset3._sample_collection.find({}):
            self.assertNotIn("num_objects", d)

        view = dataset.exclude_fields(
            ["num_objects", "ground_truth.detections.area"]
        )

        dataset4 = view.clone()

        schema = dataset4.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

        sample = dataset4.first()

        with self.assertRaises(AttributeError):
            sample.num_objects

        for d in dataset4._sample_collection.find({}):
            self.assertNotIn("num_objects", d)

    @drop_datasets
    def test_merge_samples(self):
        dataset = self._make_dataset()

        dataset2 = dataset[:1].clone()
        dataset2.merge_samples(dataset[1:])

        schema = dataset2.get_virtual_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        sample = dataset2.first()
        self.assertEqual(sample.num_objects, 2)
        self.assertIsNotNone(sample.ground_truth.detections[0].area)

        for d in dataset2._sample_collection.find({}):
            self.assertNotIn("num_objects", d)


class VirtualFrameFieldTests(unittest.TestCase):
    def _make_dataset(self):
        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(frame_width=10, frame_height=10),
        )
        sample1.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="cat",
                        bounding_box=[0.1, 0.1, 0.4, 0.4],
                    ),
                    fo.Detection(
                        label="dog",
                        bounding_box=[0.5, 0.5, 0.4, 0.4],
                    ),
                ]
            ),
        )
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="rabbit",
                        bounding_box=[0.1, 0.1, 0.8, 0.8],
                    ),
                ]
            )
        )

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(frame_width=10, frame_height=10),
        )
        sample2.frames[1] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(
                        label="squirrel",
                        bounding_box=[0.3, 0.3, 0.4, 0.4],
                    ),
                ]
            ),
        )
        sample2.frames[2] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        dataset.add_frame_field(
            "num_objects",
            fo.IntField,
            expr=F("ground_truth.detections").length(),
        )

        bbox_area = (
            F("$metadata.frame_width")
            * F("bounding_box")[2]
            * F("$metadata.frame_height")
            * F("bounding_box")[3]
        )

        dataset.add_frame_field(
            "ground_truth.detections.area",
            fo.FloatField,
            expr=bbox_area,
        )

        return dataset

    @drop_datasets
    def test_schema(self):
        dataset = self._make_dataset()

        field = dataset.get_field("frames.num_objects")
        self.assertTrue(field.is_virtual)

        field = dataset.get_field("frames.frame_number")
        self.assertFalse(field.is_virtual)

        schema = dataset.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        schema = dataset.get_frame_field_schema()
        self.assertIn("num_objects", schema)

        schema = dataset.get_frame_field_schema(virtual=False)
        self.assertNotIn("num_objects", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_frame_field_schema(flat=True)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_frame_field_schema(flat=True, virtual=True)
        self.assertIn("num_objects", schema)
        self.assertIn("ground_truth.detections.area", schema)

        schema = dataset.get_frame_field_schema(flat=True, virtual=False)
        self.assertNotIn("num_objects", schema)
        self.assertNotIn("ground_truth.detections.area", schema)

        dataset.rename_frame_field("num_objects", "num_objs")

        schema = dataset.get_frame_field_schema()
        self.assertNotIn("num_objects", schema)
        self.assertIn("num_objs", schema)

        field = dataset.get_field("frames.num_objs")
        self.assertTrue(field.is_virtual)

        sample = dataset.first()
        frame = sample.frames.first()

        self.assertTrue(frame.num_objs, 2)

        with self.assertRaises(AttributeError):
            frame.num_objects

        with self.assertRaises(ValueError):
            frame.num_objs = 12

        # Virtual fields cannot be cleared
        with self.assertRaises(ValueError):
            dataset.clear_frame_field("num_objs")

        dataset.clone_frame_field("num_objs", "still_num_objs")

        schema = dataset.get_frame_field_schema()
        self.assertIn("num_objs", schema)
        self.assertIn("still_num_objs", schema)

        field = dataset.get_field("frames.num_objs")
        self.assertTrue(field.is_virtual)

        field = dataset.get_field("frames.still_num_objs")
        self.assertTrue(field.is_virtual)

        sample = dataset.first()
        frame = sample.frames.first()

        self.assertTrue(frame.num_objs, 2)
        self.assertTrue(frame.still_num_objs, 2)

        with self.assertRaises(ValueError):
            frame.num_objs = 12

        with self.assertRaises(ValueError):
            frame.still_num_objs = 12

        dataset.delete_frame_field("still_num_objs")

        schema = dataset.get_frame_field_schema()
        self.assertNotIn("still_num_objs", schema)

        sample = dataset.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.still_num_objs

        dataset.rename_frame_field("ground_truth", "gt")

        field = dataset.get_field("frames.num_objs")
        field.expr = F("gt.detections").length()
        field.save()

        values = dataset.values("frames.num_objs", unwind=True)
        self.assertListEqual(values, [2, 1, 1, 0])

        field = dataset.get_field("frames.frame_number")

        # Cannot transform regular field into a virtual one
        with self.assertRaises(ValueError):
            field.expr = F("gt.detections").length()

    @drop_datasets
    def test_frames(self):
        dataset = self._make_dataset()

        sample = dataset.first()
        frame = sample.frames.first()

        self.assertEqual(frame.num_objects, 2)
        self.assertIsNotNone(frame.ground_truth.detections[0].area)

        frame["int_field"] = 1
        frame.save()

        d = dataset._frame_collection.find_one({"_id": frame._id})
        self.assertNotIn("num_objects", d)
        self.assertNotIn("area", d["ground_truth"]["detections"][0])

        # Virtual fields cannot be edited

        with self.assertRaises(ValueError):
            frame.num_objects = 100

        with self.assertRaises(ValueError):
            dataset.set_values(
                "frames.num_objects", dataset.values("frames.num_objects")
            )

        with self.assertRaises(ValueError):
            dataset.set_values(
                "frames.ground_truth.detections.area",
                dataset.values("frames.ground_truth.detections.area"),
            )

    @drop_datasets
    def test_aggregations(self):
        dataset = self._make_dataset()

        bounds = dataset.bounds("frames.num_objects")
        self.assertEqual(bounds, (0, 2))

        values = dataset.values("frames.num_objects", unwind=True)
        self.assertListEqual(values, [2, 1, 1, 0])

        bounds = dataset.bounds("frames.ground_truth.detections.area")
        self.assertIsNotNone(bounds[0])
        self.assertIsNotNone(bounds[1])

        values = dataset.values(
            "frames.ground_truth.detections.area", unwind=True
        )
        self.assertEqual(len(values), 4)
        self.assertIsNotNone(values[0])
        self.assertIsNotNone(values[1])
        self.assertIsNotNone(values[2])
        self.assertIsNotNone(values[3])

    @drop_datasets
    def test_views(self):
        dataset = self._make_dataset()

        view = dataset.exclude_fields("frames.num_objects")

        schema = view.get_frame_field_schema()
        self.assertNotIn("num_objects", schema)

        sample = view.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.num_objects

        view = dataset.exclude_fields("frames.ground_truth")

        schema = view.get_virtual_frame_field_schema()
        self.assertNotIn("ground_truth.detections.area", schema)

        sample = view.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.ground_truth

        view = dataset.exclude_fields("frames.ground_truth.detections.area")

        schema = view.get_virtual_frame_field_schema()
        self.assertNotIn("ground_truth.detections.area", schema)

        sample = view.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.ground_truth.detections[0].area

        view = dataset.select_fields()

        schema = view.get_virtual_frame_field_schema()
        self.assertEqual(len(schema), 0)

        sample = view.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.num_objects

        view = dataset.filter_labels(
            "frames.ground_truth", F("label") == "cat", only_matches=False
        )

        bounds = view.bounds("frames.num_objects")
        self.assertEqual(bounds, (0, 1))

        values = view.values("frames.num_objects", unwind=True)
        self.assertListEqual(values, [1, 0, 0, 0])

        bounds = view.bounds("frames.ground_truth.detections.area")
        self.assertIsNotNone(bounds[0])
        self.assertIsNotNone(bounds[1])

        values = view.values(
            "frames.ground_truth.detections.area", unwind=True
        )
        self.assertEqual(len(values), 1)
        self.assertIsNotNone(values[0])

        view2 = view.materialize().match_frames(F("num_objects") == 1)

        self.assertEqual(view2.count("frames"), 1)

        sample = view2.first()
        frame = sample.frames.first()
        self.assertEqual(frame.num_objects, 1)

        view3 = view2.filter_labels(
            "frames.ground_truth", F("label") != "cat", only_matches=False
        )

        self.assertEqual(view3.count("frames.ground_truth.detections"), 0)

        sample = view3.first()
        frame = sample.frames.first()
        self.assertEqual(frame.num_objects, 0)

    @drop_datasets
    def test_save(self):
        dataset = self._make_dataset()

        dataset.save()

        schema = dataset.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        dataset.save(fields="frames.num_objects")

        schema = dataset.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        dataset.save(fields="frames.num_objects", materialize=True)

        schema = dataset.get_virtual_frame_field_schema()
        self.assertNotIn("num_objects", schema)

        field = dataset.get_field("frames.num_objects")
        self.assertFalse(field.is_virtual)

        values = dataset.values("frames.num_objects", unwind=True)
        self.assertListEqual(values, [2, 1, 1, 0])

        dataset.save(materialize=True)

        schema = dataset.get_virtual_frame_field_schema()
        self.assertEqual(len(schema), 0)

        field = dataset.get_field("frames.ground_truth.detections.area")
        self.assertFalse(field.is_virtual)

        values = dataset.values(
            "frames.ground_truth.detections.area", unwind=True
        )
        self.assertEqual(len(values), 4)
        self.assertIsNotNone(values[0])
        self.assertIsNotNone(values[1])
        self.assertIsNotNone(values[2])
        self.assertIsNotNone(values[3])

    @drop_datasets
    def test_keep_fields(self):
        dataset = self._make_dataset()

        dataset1 = dataset.clone()

        dataset1.select_fields().keep_fields()

        schema = dataset1.get_virtual_frame_field_schema()
        self.assertEqual(len(schema), 0)

        dataset2 = dataset.clone()

        schema = dataset2.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        view = dataset2.exclude_fields(
            ["frames.num_objects", "frames.ground_truth.detections.area"]
        ).keep_fields()

        schema = dataset2.get_virtual_field_schema()
        self.assertEqual(len(schema), 0)

    @drop_datasets
    def test_clone(self):
        dataset = self._make_dataset()

        dataset2 = dataset.clone()

        schema = dataset2.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        sample = dataset2.first()
        frame = sample.frames.first()
        self.assertEqual(frame.num_objects, 2)
        self.assertIsNotNone(frame.ground_truth.detections[0].area)

        for d in dataset2._frame_collection.find({}):
            self.assertNotIn("num_objects", d)

        view = dataset.filter_labels(
            "frames.ground_truth", F("label") == "cat"
        )

        dataset3 = view.clone()

        schema = dataset3.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        self.assertEqual(len(dataset3), 1)
        self.assertEqual(dataset3.count("frames.ground_truth.detections"), 1)

        sample = dataset3.first()
        frame = sample.frames.first()
        self.assertEqual(frame.num_objects, 1)
        self.assertIsNotNone(frame.ground_truth.detections[0].area)

        for d in dataset3._frame_collection.find({}):
            self.assertNotIn("num_objects", d)

        view = dataset.exclude_fields(
            ["frames.num_objects", "frames.ground_truth.detections.area"]
        )

        dataset4 = view.clone()

        schema = dataset4.get_virtual_frame_field_schema()
        self.assertEqual(len(schema), 0)

        sample = dataset4.first()
        frame = sample.frames.first()

        with self.assertRaises(AttributeError):
            frame.num_objects

        for d in dataset4._frame_collection.find({}):
            self.assertNotIn("num_objects", d)

    @drop_datasets
    def test_merge_samples(self):
        dataset = self._make_dataset()

        dataset2 = dataset[:1].clone()
        dataset2.merge_samples(dataset[1:])

        schema = dataset2.get_virtual_frame_field_schema()
        self.assertSetEqual(
            set(schema.keys()),
            {"num_objects", "ground_truth.detections.area"},
        )

        sample = dataset2.first()
        frame = sample.frames.first()
        self.assertEqual(frame.num_objects, 2)
        self.assertIsNotNone(frame.ground_truth.detections[0].area)

        for d in dataset2._frame_collection.find({}):
            self.assertNotIn("num_objects", d)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
