"""
FiftyOne video-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
from copy import deepcopy
from datetime import date, datetime

from bson import ObjectId
import numpy as np
import unittest

import fiftyone as fo
import fiftyone.core.clips as foc
import fiftyone.core.odm as foo
import fiftyone.core.video as fov
from fiftyone import ViewField as F

from decorators import drop_datasets


class VideoTests(unittest.TestCase):
    @drop_datasets
    def test_video_sample(self):
        sample = fo.Sample(filepath="video.mp4")
        frames = sample.frames

        self.assertEqual(len(frames), 0)
        self.assertFalse(1 in frames, False)

        frame1 = fo.Frame(frame_number=1)
        frame5 = fo.Frame()
        frame3 = fo.Frame(hello="world")

        self.assertIsNone(frame1.sample_id)
        self.assertIsNone(frame1._sample_id)

        # Intentionally out of order to test sorting
        frames[1] = frame1
        frames[5] = frame5
        frames[3] = frame3

        self.assertEqual(len(frames), 3)
        self.assertTrue(1 in frames)
        self.assertFalse(2 in frames)
        self.assertTrue(3 in frames)
        self.assertFalse(4 in frames)
        self.assertTrue(5 in frames)

        self.assertTrue(list(frames.keys()), [1, 3, 5])

        frame_numbers = []
        for frame_number, frame in frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertTrue(frame_numbers, [1, 3, 5])

        del frames[3]

        self.assertFalse(3 in frames)
        self.assertTrue(list(frames.keys()), [1, 5])

        frame_numbers = []
        for frame_number, frame in frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertTrue(frame_numbers, [1, 5])

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertIsNotNone(sample.id)
        self.assertIsNotNone(frame1.id)
        self.assertIsNone(frame3.id)
        self.assertIsNotNone(frame5.id)

        self.assertIsInstance(frame1.sample_id, str)
        self.assertIsInstance(frame1._sample_id, ObjectId)

        self.assertTrue(len(sample.frames), 2)

        self.assertTrue(1 in sample.frames)
        self.assertFalse(2 in sample.frames)
        self.assertFalse(3 in sample.frames)
        self.assertFalse(4 in sample.frames)
        self.assertTrue(5 in sample.frames)

        frame_numbers = []
        for frame_number, frame in sample.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertTrue(frame_numbers, [1, 5])

    @drop_datasets
    def test_video_dataset_frames_init(self):
        dataset = fo.Dataset()
        conn = foo.get_db_conn()

        collections = conn.list_collection_names()
        self.assertIn(dataset._sample_collection_name, collections)

        self.assertIsNone(dataset._frame_collection)
        self.assertIsNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) == 0)

        dataset.media_type = "video"

        self.assertIsNotNone(dataset._frame_collection)
        self.assertIsNotNone(dataset._frame_collection_name)
        self.assertTrue(len(dataset._doc.frame_fields) > 0)

        collections = conn.list_collection_names()
        self.assertIn(dataset._frame_collection_name, collections)

    @drop_datasets
    def test_video_indexes(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4", field="hi")
        sample.frames[1] = fo.Frame(
            field="hi", cls=fo.Classification(label="cat")
        )

        dataset.add_sample(sample)

        info = dataset.get_index_information()
        indexes = dataset.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "frames.id",
            "frames.created_at",
            "frames.last_modified_at",
            "frames._sample_id_1_frame_number_1",
        }

        self.assertSetEqual(set(info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        dataset.create_index("frames.id", unique=True)  # already exists
        dataset.create_index("frames.id")  # sufficient index exists
        with self.assertRaises(ValueError):
            dataset.drop_index("frames.id")  # can't drop default

        name = dataset.create_index("frames.field")
        self.assertEqual(name, "frames.field")
        self.assertIn("frames.field", dataset.list_indexes())

        dataset.drop_index("frames.field")
        self.assertNotIn("frames.field", dataset.list_indexes())

        name = dataset.create_index("frames.cls.label")
        self.assertEqual(name, "frames.cls.label")
        self.assertIn("frames.cls.label", dataset.list_indexes())

        dataset.drop_index("frames.cls.label")
        self.assertNotIn("frames.cls.label", dataset.list_indexes())

        compound_index_name = dataset.create_index(
            [("frames.id", 1), ("frames.field", 1)]
        )
        self.assertIn(compound_index_name, dataset.list_indexes())

        dataset.drop_index(compound_index_name)
        self.assertNotIn(compound_index_name, dataset.list_indexes())

        with self.assertRaises(ValueError):
            dataset.create_index("frames.non_existent_field")

    @drop_datasets
    def test_frames_order(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(frame_number=1)
        sample1.frames[5] = fo.Frame()
        sample1.frames[3] = fo.Frame(hello="world")

        sample2 = fo.Sample(filepath="video2.mp4")

        dataset.add_samples([sample1, sample2])

        sample2.frames[4]["hello"] = "there"
        sample2.save()

        sample2.frames[2]["hello"] = "world"
        sample2.save()

        values = dataset.values("frames.hello")
        self.assertListEqual(
            values, [[None, "world", None], ["world", "there"]]
        )

        frame_numbers1 = []
        for frame_number, frame in sample1.frames.items():
            frame_numbers1.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers1, [1, 3, 5])

        frame_numbers2 = []
        for frame_number, frame in sample2.frames.items():
            frame_numbers2.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers2, [2, 4])

    @drop_datasets
    def test_expand_schema(self):
        # None-valued new frame fields are ignored for schema expansion

        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(ground_truth=None)
        dataset.add_sample(sample)

        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        # None-valued new frame fields are allowed when a later frame
        # determines the appropriate field type

        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(ground_truth=None)
        sample.frames[2] = fo.Frame(ground_truth=fo.Classification())

        dataset.add_sample(sample)

        self.assertIn("ground_truth", dataset.get_frame_field_schema())

        # Test implied frame field types

        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(
            bool_field=True,
            int_field=1,
            str_field="hi",
            float_field=1.0,
            date_field=date.today(),
            datetime_field=datetime.utcnow(),
            list_field=[1, 2, 3],
            dict_field={"hello": "world"},
            vector_field=np.arange(5),
            array_field=np.random.randn(3, 4),
        )

        dataset.add_sample(sample)
        schema = dataset.get_frame_field_schema()

        self.assertIsInstance(schema["bool_field"], fo.BooleanField)
        self.assertIsInstance(schema["int_field"], fo.IntField)
        self.assertIsInstance(schema["str_field"], fo.StringField)
        self.assertIsInstance(schema["float_field"], fo.FloatField)
        self.assertIsInstance(schema["date_field"], fo.DateField)
        self.assertIsInstance(schema["datetime_field"], fo.DateTimeField)
        self.assertIsInstance(schema["list_field"], fo.ListField)
        self.assertIsInstance(schema["dict_field"], fo.DictField)
        self.assertIsInstance(schema["vector_field"], fo.VectorField)
        self.assertIsInstance(schema["array_field"], fo.ArrayField)

    @drop_datasets
    def test_reload(self):
        sample = fo.Sample(filepath="video.mp4", hello="world")
        frame = fo.Frame(hi="there")

        sample.frames[1] = frame

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertTrue(sample._in_db)
        self.assertTrue(frame._in_db)

        dataset.reload()

        self.assertTrue(sample._in_db)
        self.assertTrue(frame._in_db)

        self.assertEqual(sample.hello, "world")
        self.assertEqual(frame.hi, "there")

    @drop_datasets
    def test_iter_samples(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="video%d.mp4" % i) for i in range(50)]
        )

        first_sample = dataset.first()
        first_frame = first_sample.frames[1]
        first_sample.save()

        for idx, sample in enumerate(dataset):
            sample["int"] = idx + 1
            sample.frames[1]["int"] = idx + 1
            sample.save()

        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))
        self.assertTupleEqual(dataset.bounds("frames.int"), (1, 50))
        self.assertEqual(first_sample.int, 1)
        self.assertEqual(first_frame.int, 1)

        for idx, sample in enumerate(dataset.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.frames[1]["int"] = idx + 2
            sample.save()

        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))
        self.assertTupleEqual(dataset.bounds("frames.int"), (2, 51))
        self.assertEqual(first_sample.int, 2)
        self.assertEqual(first_frame.int, 2)
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

        for idx, sample in enumerate(dataset.iter_samples(autosave=True)):
            sample["int"] = idx + 3
            sample.frames[1]["int"] = idx + 3

        last_modified_at3 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))
        self.assertTupleEqual(dataset.bounds("frames.int"), (3, 52))
        self.assertEqual(first_sample.int, 3)
        self.assertEqual(first_frame.int, 3)
        self.assertTrue(
            all(
                m2 < m3 for m2, m3 in zip(last_modified_at2, last_modified_at3)
            )
        )

        with dataset.save_context() as context:
            for idx, sample in enumerate(dataset):
                sample["int"] = idx + 4
                sample.frames[1]["int"] = idx + 4
                context.save(sample)

        last_modified_at4 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))
        self.assertTupleEqual(dataset.bounds("frames.int"), (4, 53))
        self.assertEqual(first_sample.int, 4)
        self.assertEqual(first_frame.int, 4)
        self.assertTrue(
            all(
                m3 < m4 for m3, m4 in zip(last_modified_at3, last_modified_at4)
            )
        )

    @drop_datasets
    def test_iter_samples_view(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [fo.Sample(filepath="video%d.mp4" % i) for i in range(51)]
        )

        first_sample = dataset.first()
        first_frame = first_sample.frames[1]
        first_sample.save()

        view = dataset.limit(50)

        for idx, sample in enumerate(view):
            sample["int"] = idx + 1
            sample.frames[1]["int"] = idx + 1
            sample.save()

        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (1, 50))
        self.assertTupleEqual(dataset.bounds("frames.int"), (1, 50))
        self.assertEqual(first_sample.int, 1)
        self.assertEqual(first_frame.int, 1)

        for idx, sample in enumerate(view.iter_samples(progress=True)):
            sample["int"] = idx + 2
            sample.frames[1]["int"] = idx + 2
            sample.save()

        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (2, 51))
        self.assertTupleEqual(dataset.bounds("frames.int"), (2, 51))
        self.assertEqual(first_sample.int, 2)
        self.assertEqual(first_frame.int, 2)
        self.assertTrue(
            all(
                m1 < m2 for m1, m2 in zip(last_modified_at1, last_modified_at2)
            )
        )

        for idx, sample in enumerate(view.iter_samples(autosave=True)):
            sample["int"] = idx + 3
            sample.frames[1]["int"] = idx + 3

        last_modified_at3 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (3, 52))
        self.assertTupleEqual(dataset.bounds("frames.int"), (3, 52))
        self.assertEqual(first_sample.int, 3)
        self.assertEqual(first_frame.int, 3)
        self.assertTrue(
            all(
                m2 < m3 for m2, m3 in zip(last_modified_at2, last_modified_at3)
            )
        )

        with view.save_context() as context:
            for idx, sample in enumerate(view):
                sample["int"] = idx + 4
                sample.frames[1]["int"] = idx + 4
                context.save(sample)

        last_modified_at4 = dataset.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTupleEqual(dataset.bounds("int"), (4, 53))
        self.assertTupleEqual(dataset.bounds("frames.int"), (4, 53))
        self.assertEqual(first_sample.int, 4)
        self.assertEqual(first_frame.int, 4)
        self.assertTrue(
            all(
                m3 < m4 for m3, m4 in zip(last_modified_at3, last_modified_at4)
            )
        )

    @drop_datasets
    def test_modify_video_sample(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        dataset.add_sample(sample)

        # Intentionally out of order to test sorting
        sample.frames[1] = fo.Frame(frame_number=1)
        sample.frames[5] = fo.Frame()
        sample.frames[3] = fo.Frame(hello="world")

        self.assertEqual(len(sample.frames), 3)
        self.assertIsNone(sample.frames[1].id)
        self.assertIsNone(sample.frames[3].id)
        self.assertIsNone(sample.frames[5].id)

        sample.save()

        self.assertEqual(len(sample.frames), 3)
        self.assertIsNotNone(sample.frames[1].id)
        self.assertIsNotNone(sample.frames[3].id)
        self.assertIsNotNone(sample.frames[5].id)
        self.assertTrue(dataset.has_frame_field("hello"))

        frame2 = sample.frames[2]

        self.assertIsNone(frame2.id)
        self.assertEqual(len(sample.frames), 4)
        self.assertListEqual(list(sample.frames.keys()), [1, 2, 3, 5])

        sample.save()

        self.assertIsNotNone(frame2.id)
        self.assertEqual(len(sample.frames), 4)
        self.assertListEqual(list(sample.frames.keys()), [1, 2, 3, 5])

        del sample.frames[3]

        self.assertEqual(len(sample.frames), 3)
        self.assertListEqual(list(sample.frames.keys()), [1, 2, 5])

        sample.save()

        self.assertEqual(len(sample.frames), 3)
        self.assertListEqual(list(sample.frames.keys()), [1, 2, 5])

        sample.frames.clear()

        self.assertEqual(len(sample.frames), 0)
        self.assertListEqual(list(sample.frames.keys()), [])

        sample.save()

        self.assertEqual(len(sample.frames), 0)
        self.assertListEqual(list(sample.frames.keys()), [])

        sample.frames[1] = fo.Frame(goodbye="world")

        self.assertTrue(dataset.has_frame_field("goodbye"))

        with self.assertRaises(ValueError):
            sample.frames.add_frame(
                2, fo.Frame(foo="bar"), expand_schema=False
            )

    @drop_datasets
    def test_frame_overwrite(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(hello="world")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        self.assertEqual(sample.frames[1].hello, "world")

        # Overwriting an existing frame is allowed
        sample.frames[1] = fo.Frame(goodbye="world")
        sample.save()

        self.assertEqual(dataset.first().frames[1].goodbye, "world")

        view = dataset.exclude_fields("frames.goodbye")
        sample = view.first()
        sample.frames[1] = fo.Frame(new="field")
        sample.save()

        frame = dataset.first().frames[1]

        self.assertEqual(frame.hello, None)
        self.assertEqual(frame.goodbye, None)
        self.assertEqual(frame.new, "field")

    @drop_datasets
    def test_save_frames(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        dataset.add_sample(sample)

        frame = fo.Frame()
        sample.frames[1] = frame

        self.assertIsNone(frame.id)
        self.assertFalse(frame._in_db)
        self.assertEqual(len(sample.frames), 1)
        self.assertEqual(dataset.count("frames"), 0)

        sample.save()

        self.assertIsNotNone(frame.id)
        self.assertTrue(frame._in_db)
        self.assertEqual(len(sample.frames), 1)
        self.assertEqual(dataset.count("frames"), 1)

    @drop_datasets
    def test_delete_video_sample(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")
        frame = fo.Frame(hello="world")
        sample.frames[1] = frame
        dataset.add_sample(sample)

        dataset.delete_samples(sample)

        self.assertIsNone(sample.id)
        self.assertIsNone(frame.id)

        dataset.add_sample(sample)

        view = dataset.limit(1)

        dataset.delete_samples(view.first())

        self.assertIsNone(sample.id)
        self.assertIsNone(frame.id)

    @drop_datasets
    def test_video_sample_view(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")

        frame1 = fo.Frame(frame_number=1)
        frame3 = fo.Frame(hello="world")
        frame5 = fo.Frame()

        sample.frames[1] = frame1
        sample.frames[3] = frame3
        sample.frames[5] = frame5

        dataset.add_sample(sample)

        view = dataset.view()

        sample_view = view.first()

        frame_view1 = sample_view.frames[1]
        frame_view3 = sample_view.frames[3]
        frame_view5 = sample_view.frames[5]

        self.assertEqual(len(sample_view.frames), 3)
        self.assertEqual(frame_view1.id, frame1.id)
        self.assertEqual(frame_view3.id, frame3.id)
        self.assertEqual(frame_view5.id, frame5.id)

        sample_view.frames[2] = fo.Frame(foo="bar")

        self.assertEqual(len(sample_view.frames), 4)
        self.assertListEqual(list(sample_view.frames.keys()), [1, 2, 3, 5])

        self.assertTrue(dataset.has_frame_field("foo"))
        self.assertEqual(len(sample.frames), 3)
        self.assertListEqual(list(sample.frames.keys()), [1, 3, 5])

        sample_view.save()

        self.assertEqual(len(sample.frames), 4)
        self.assertListEqual(list(sample.frames.keys()), [1, 2, 3, 5])

        sample_view.frames[1]["hello"] = "goodbye"
        sample_view.frames[3]["hello"] = "goodbye"
        sample_view.save()

        self.assertEqual(sample_view.frames[1]["hello"], "goodbye")
        self.assertEqual(sample_view.frames[3]["hello"], "goodbye")
        self.assertEqual(sample_view.frames[5]["hello"], None)

        self.assertEqual(frame1.hello, "goodbye")
        self.assertEqual(frame3.hello, "goodbye")
        self.assertEqual(frame5.hello, None)

        frame1.hello = "there"
        frame3.hello = "there"

        sample.save()

        self.assertEqual(sample.frames[1].hello, "there")
        self.assertEqual(sample.frames[3].hello, "there")

        # sample view objects are not singletones
        self.assertEqual(sample_view.frames[1].hello, "goodbye")
        self.assertEqual(sample_view.frames[3].hello, "goodbye")

        # but reloading from the view does work
        self.assertEqual(view.first().frames[1].hello, "there")
        self.assertEqual(view.first().frames[3].hello, "there")

        del sample_view.frames[2]
        del sample_view.frames[3]

        self.assertEqual(len(sample_view.frames), 2)
        self.assertEqual(list(sample_view.frames.keys()), [1, 5])

        frame_numbers = []
        for frame_number, frame in sample_view.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers, [1, 5])

        self.assertEqual(len(sample.frames), 4)
        self.assertEqual(list(sample.frames.keys()), [1, 2, 3, 5])

        sample_view.save()

        self.assertEqual(len(sample.frames), 2)
        self.assertEqual(list(sample.frames.keys()), [1, 5])

    @drop_datasets
    def test_add_video_samples(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(frame_number=1)
        sample.frames[3] = fo.Frame(hello="world")
        sample.frames[5] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        sample_id = sample.id
        frame_id = sample.frames.first().id

        dataset2 = fo.Dataset()
        dataset2.add_sample(sample)

        sample2 = dataset2.first()
        frame2 = sample2.frames.first()

        self.assertEqual(len(sample2.frames), 3)
        self.assertNotEqual(sample2.id, sample_id)
        self.assertNotEqual(frame2.id, frame_id)

        sample2_copy = sample2.copy()
        frame2_copy = sample2_copy.frames.first()

        self.assertEqual(len(sample2_copy.frames), 3)
        self.assertIsNone(sample2_copy.id)
        self.assertIsNone(frame2_copy.id)

        view = dataset.match_frames(F("hello") == "world")

        sample_view = view.first()

        self.assertEqual(len(sample_view.frames), 1)

        sample_view_copy = sample_view.copy()
        frame_view_copy = sample_view_copy.frames.first()

        self.assertEqual(len(sample_view_copy.frames), 1)
        self.assertIsNone(sample_view_copy.id)
        self.assertIsNone(frame_view_copy.id)

        dataset3 = fo.Dataset()
        dataset3.add_samples(view)

        self.assertEqual(len(dataset3), 1)

        sample3 = dataset3.first()
        frame3 = sample3.frames.first()

        self.assertEqual(len(sample3.frames), 1)
        self.assertNotEqual(sample3.id, sample_id)
        self.assertNotEqual(frame3.id, frame_id)

    @drop_datasets
    def test_save_frame_view(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="video.mp4")

        frame = fo.Frame()
        sample.frames[1] = frame

        dataset.add_sample(sample)

        view = dataset.limit(1)

        frame_view = view.first().frames.first()

        frame_view["hello"] = "world"
        frame_view.save()

        self.assertEqual(frame_view.hello, "world")
        self.assertEqual(frame.hello, "world")
        self.assertEqual(view.first().frames.first().hello, "world")

    @drop_datasets
    def test_frames_view_order(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(frame_number=1)
        sample1.frames[5] = fo.Frame()
        sample1.frames[3] = fo.Frame(hello="world")

        sample2 = fo.Sample(filepath="video2.mp4")

        dataset.add_samples([sample1, sample2])

        sample2.frames[4]["hello"] = "there"
        sample2.save()

        sample2.frames[2]["hello"] = "world"
        sample2.save()

        view = dataset.select_fields("frames.hello")

        values = view.values("frames.hello")
        self.assertListEqual(
            values, [[None, "world", None], ["world", "there"]]
        )

        sample_view1 = view.first()
        sample_view2 = view.last()

        frame_numbers1 = []
        for frame_number, frame in sample_view1.frames.items():
            frame_numbers1.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers1, [1, 3, 5])

        frame_numbers2 = []
        for frame_number, frame in sample_view2.frames.items():
            frame_numbers2.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers2, [2, 4])

    @drop_datasets
    def test_video_dataset_view_simple(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[2] = fo.Frame()
        sample2.frames[3] = fo.Frame()

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        view = dataset.skip(1)

        sample2_view = view.last()

        self.assertEqual(sample2.id, sample2_view.id)
        self.assertEqual(len(sample2_view.frames), 2)
        self.assertFalse(1 in sample2_view.frames)
        self.assertTrue(2 in sample2_view.frames)
        self.assertTrue(3 in sample2_view.frames)
        self.assertListEqual(list(sample2_view.frames.keys()), [2, 3])

        frame_numbers = []
        for frame_number, frame in sample2_view.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers, [2, 3])

        sample2_view.frames[1] = fo.Frame()
        sample2_view.frames[4] = fo.Frame()
        del sample2_view.frames[2]

        self.assertListEqual(list(sample2_view.frames.keys()), [1, 3, 4])

        frame_numbers = []
        for frame_number, frame in sample2_view.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers, [1, 3, 4])

        sample2_view.save()

        self.assertListEqual(list(sample2.frames.keys()), [1, 3, 4])

        frame_numbers = []
        for frame_number, frame in sample2.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers, [1, 3, 4])

    @drop_datasets
    def test_video_frames_filtered(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(
            gt=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[2] = fo.Frame(
            gt=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            )
        )

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[2] = fo.Frame(
            gt=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample2.frames[3] = fo.Frame(
            gt=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            )
        )

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        view = dataset.filter_labels("frames.gt", F("label") == "cat")

        sample1_view = view.first()

        self.assertTrue(len(sample1_view.frames), 2)
        self.assertTrue(list(sample1_view.frames.keys()), [1, 2])

        frame_numbers = []
        for frame_number, frame in sample1_view.frames.items():
            frame_numbers.append(frame_number)
            self.assertEqual(frame_number, frame.frame_number)

        self.assertListEqual(frame_numbers, [1, 2])

        self.assertEqual(len(sample1_view.frames[1].gt.detections), 1)
        self.assertEqual(len(sample1_view.frames[2].gt.detections), 0)

    @drop_datasets
    def test_video_frames_merge(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(field1="a", field2="b")

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame(field1="c", field2="d")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2])

        view1 = dataset.select_fields("frames.field1")
        view2 = dataset.select_fields("frames.field2")

        self.assertTrue(dataset.has_frame_field("field1"))
        self.assertTrue(dataset.has_frame_field("field2"))
        self.assertTrue(view1.has_frame_field("field1"))
        self.assertFalse(view1.has_frame_field("field2"))
        self.assertFalse(view2.has_frame_field("field1"))
        self.assertTrue(view2.has_frame_field("field2"))

        frame_view1 = view1.first().frames.first()

        self.assertTrue(frame_view1.has_field("field1"))
        self.assertFalse(frame_view1.has_field("field2"))

        self.assertEqual(frame_view1.field1, "a")
        self.assertEqual(frame_view1["field1"], "a")

        with self.assertRaises(AttributeError):
            _ = frame_view1.field2

        with self.assertRaises(KeyError):
            _ = frame_view1["field2"]

        dataset1 = view1.clone()
        dataset2 = view2.clone()

        self.assertTrue(dataset1.has_frame_field("field1"))
        self.assertFalse(dataset1.has_frame_field("field2"))
        self.assertFalse(dataset2.has_frame_field("field1"))
        self.assertTrue(dataset2.has_frame_field("field2"))

        dataset3 = fo.Dataset()
        dataset3.merge_samples(dataset1)
        dataset3.merge_samples(dataset2)
        frame3 = dataset3.first().frames.first()

        self.assertTrue(dataset3.has_frame_field("field1"))
        self.assertTrue(dataset3.has_frame_field("field2"))
        self.assertEqual(frame3["field1"], "a")
        self.assertEqual(frame3["field2"], "b")

        dataset4 = fo.Dataset()
        dataset4.merge_samples(view1)
        dataset4.merge_samples(view2)
        frame4 = dataset4.first().frames.first()

        self.assertTrue(dataset4.has_frame_field("field1"))
        self.assertTrue(dataset4.has_frame_field("field2"))
        self.assertEqual(frame4["field1"], "a")
        self.assertEqual(frame4["field2"], "b")

    @drop_datasets
    def test_video_frames_view_merge(self):
        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(field1="a", field2="b")
        sample1.frames[2] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")
        sample2.frames[1] = fo.Frame(field1="c", field2="d")

        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(field1="e", field2="f")
        sample3.frames[2] = fo.Frame()
        sample3.frames[3] = fo.Frame()

        dataset1 = fo.Dataset()
        dataset1.add_samples([sample1, sample2, sample3])

        dataset2 = fo.Dataset()
        dataset2.media_type = "video"

        dataset2.merge_samples(dataset1[:1])
        dataset2.merge_samples(dataset1[1:])

        self.assertEqual(dataset2.count(), 3)
        self.assertEqual(dataset2.count("frames"), 6)

    @drop_datasets
    def test_merge_video_samples_and_labels(self):
        sample11 = fo.Sample(filepath="video1.mp4")

        sample12 = fo.Sample(filepath="video2.mp4")
        sample12.frames[1] = fo.Frame()
        sample12.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hello"),
                    fo.Detection(label="world"),
                ]
            ),
            predictions1=fo.Detections(
                detections=[
                    fo.Detection(label="hello", confidence=0.99),
                    fo.Detection(label="world", confidence=0.99),
                ]
            ),
            hello="world",
        )
        sample12.frames[3] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hello"),
                    fo.Detection(label="world"),
                    fo.Detection(label="common"),
                ]
            ),
            predictions1=fo.Detections(
                detections=[
                    fo.Detection(label="hello", confidence=0.99),
                    fo.Detection(label="world", confidence=0.99),
                ]
            ),
            hello="world",
        )
        sample12.frames[4] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="hi"),
                    fo.Detection(label="there"),
                ]
            ),
            hello="world",
        )
        sample12.frames[5] = fo.Frame(ground_truth=None, hello=None)

        dataset1 = fo.Dataset()
        dataset1.add_samples([sample11, sample12])

        ref = sample12.frames[3].ground_truth.detections[2]
        common = ref.copy()
        common.id = ref.id
        common.label = "COMMON"

        sample22 = fo.Sample(filepath="video2.mp4")

        sample22.frames[2] = fo.Frame()
        sample22.frames[3] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    common,
                    fo.Detection(label="foo"),
                    fo.Detection(label="bar"),
                ]
            ),
            predictions2=fo.Detections(
                detections=[
                    fo.Detection(label="foo", confidence=0.99),
                    fo.Detection(label="bar", confidence=0.99),
                ]
            ),
            hello="bar",
        )
        sample22.frames[4] = fo.Frame(ground_truth=None, hello=None)
        sample22.frames[5] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="foo"),
                    fo.Detection(label="bar"),
                ]
            ),
            predictions2=fo.Detections(
                detections=[
                    fo.Detection(label="foo", confidence=0.99),
                    fo.Detection(label="bar", confidence=0.99),
                ]
            ),
            hello="bar",
        )
        sample23 = fo.Sample(filepath="video3.mp4")

        dataset2 = fo.Dataset()
        dataset2.add_samples([sample22, sample23])

        filepath_fcn = lambda sample: sample.filepath

        for key_fcn in (None, filepath_fcn):
            d1 = dataset1.clone()
            d1.merge_samples(dataset2, skip_existing=True, key_fcn=key_fcn)

            dt_fields = {"created_at", "last_modified_at"}
            fields1 = set(dataset1.get_frame_field_schema().keys()) - dt_fields
            fields2 = set(d1.get_frame_field_schema().keys()) - dt_fields
            new_fields = fields2 - fields1

            self.assertEqual(len(d1), 3)
            for s1, s2 in zip(dataset1, d1):
                for f1, f2 in zip(s1.frames.values(), s2.frames.values()):
                    for field in dt_fields:
                        self.assertTrue(f1[field] < f2[field])

                    for field in fields1:
                        self.assertEqual(f1[field], f2[field])

                    for field in new_fields:
                        self.assertIsNone(f2[field])

        for key_fcn in (None, filepath_fcn):
            d2 = dataset1.clone()
            d2.merge_samples(dataset2, insert_new=False, key_fcn=key_fcn)

            self.assertEqual(len(d2), len(dataset1))

        for key_fcn in (None, filepath_fcn):
            with self.assertRaises(ValueError):
                d3 = dataset1.clone()
                d3.merge_samples(
                    dataset2, expand_schema=False, key_fcn=key_fcn
                )

        for key_fcn in (None, filepath_fcn):
            d3 = dataset1.clone()
            d3.merge_samples(
                dataset2, merge_lists=False, overwrite=True, key_fcn=key_fcn
            )

            self.assertListEqual(
                d3.values("frames.hello"),
                [[], [None, "world", "bar", "world", "bar"], []],
            )
            self.assertListEqual(
                d3.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["COMMON", "foo", "bar"],
                        ["hi", "there"],
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )
            self.assertListEqual(
                d3.values("frames.predictions1.detections.label"),
                [
                    [],
                    [None, ["hello", "world"], ["hello", "world"], None, None],
                    [],
                ],
            )
            self.assertListEqual(
                d3.values("frames.predictions2.detections.label"),
                [[], [None, None, ["foo", "bar"], None, ["foo", "bar"]], []],
            )

        for key_fcn in (None, filepath_fcn):
            d4 = dataset1.clone()
            d4.merge_samples(
                dataset2, merge_lists=False, overwrite=False, key_fcn=key_fcn
            )

            self.assertListEqual(
                d4.values("frames.hello"),
                [[], [None, "world", "world", "world", "bar"], []],
            )
            self.assertListEqual(
                d4.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "common"],
                        ["hi", "there"],
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )
            self.assertListEqual(
                d4.values("frames.predictions1.detections.label"),
                [
                    [],
                    [None, ["hello", "world"], ["hello", "world"], None, None],
                    [],
                ],
            )
            self.assertListEqual(
                d4.values("frames.predictions2.detections.label"),
                [[], [None, None, ["foo", "bar"], None, ["foo", "bar"]], []],
            )

        for key_fcn in (None, filepath_fcn):
            d5 = dataset1.clone()
            d5.merge_samples(dataset2, fields="frames.hello", key_fcn=key_fcn)

            # ensures documents are valid
            for sample in d5:
                self.assertIsNotNone(sample.id)
                for frame in sample.frames.values():
                    self.assertIsNotNone(frame.id)

            self.assertNotIn("predictions2", d5.get_frame_field_schema())
            self.assertListEqual(
                d5.values("frames.hello"),
                [[], [None, "world", "bar", "world", "bar"], []],
            )
            self.assertListEqual(
                d5.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "common"],
                        ["hi", "there"],
                        None,
                    ],
                    [],
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d6 = dataset1.clone()
            d6.merge_samples(
                dataset2,
                omit_fields=["frames.ground_truth", "frames.predictions2"],
                key_fcn=key_fcn,
            )

            # ensures documents are valid
            for sample in d6:
                self.assertIsNotNone(sample.id)
                for frame in sample.frames.values():
                    self.assertIsNotNone(frame.id)

            self.assertNotIn("predictions2", d6.get_frame_field_schema())
            self.assertListEqual(
                d6.values("frames.hello"),
                [[], [None, "world", "bar", "world", "bar"], []],
            )
            self.assertListEqual(
                d6.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "common"],
                        ["hi", "there"],
                        None,
                    ],
                    [],
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d7 = dataset1.clone()
            d7.merge_samples(
                dataset2, merge_lists=False, overwrite=True, key_fcn=key_fcn
            )

            self.assertListEqual(
                d7.values("frames.hello"),
                [[], [None, "world", "bar", "world", "bar"], []],
            )
            self.assertListEqual(
                d7.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["COMMON", "foo", "bar"],
                        ["hi", "there"],
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )

        for key_fcn in (None, filepath_fcn):
            d8 = dataset1.clone()
            d8.merge_samples(dataset2, key_fcn=key_fcn)

            self.assertListEqual(
                d8.values("frames.hello"),
                [[], [None, "world", "bar", "world", "bar"], []],
            )
            self.assertListEqual(
                d8.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "COMMON", "foo", "bar"],
                        ["hi", "there"],
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )
            self.assertListEqual(
                d8.values("frames.predictions1.detections.label"),
                [
                    [],
                    [None, ["hello", "world"], ["hello", "world"], None, None],
                    [],
                ],
            )
            self.assertListEqual(
                d8.values("frames.predictions2.detections.label"),
                [[], [None, None, ["foo", "bar"], None, ["foo", "bar"]], []],
            )

        for key_fcn in (None, filepath_fcn):
            d9 = dataset1.clone()
            d9.merge_samples(dataset2, overwrite=False, key_fcn=key_fcn)

            self.assertListEqual(
                d9.values("frames.hello"),
                [[], [None, "world", "world", "world", "bar"], []],
            )
            self.assertListEqual(
                d9.values("frames.ground_truth.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "common", "foo", "bar"],
                        ["hi", "there"],
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )
            self.assertListEqual(
                d9.values("frames.predictions1.detections.label"),
                [
                    [],
                    [None, ["hello", "world"], ["hello", "world"], None, None],
                    [],
                ],
            )
            self.assertListEqual(
                d9.values("frames.predictions2.detections.label"),
                [[], [None, None, ["foo", "bar"], None, ["foo", "bar"]], []],
            )

        for key_fcn in (None, filepath_fcn):
            d10 = dataset1.clone()
            d10.merge_samples(
                dataset2,
                fields={
                    "frames.hello": "frames.hello2",
                    "frames.predictions2": "frames.predictions1",
                },
                key_fcn=key_fcn,
            )

            d10_frame_schema = d10.get_frame_field_schema()
            self.assertIn("hello", d10_frame_schema)
            self.assertIn("hello2", d10_frame_schema)
            self.assertIn("predictions1", d10_frame_schema)
            self.assertNotIn("predictions2", d10_frame_schema)

            self.assertListEqual(
                d10.values("frames.hello"),
                [[], [None, "world", "world", "world", None], []],
            )
            self.assertListEqual(
                d10.values("frames.hello2"),
                [[], [None, None, "bar", None, "bar"], []],
            )
            self.assertListEqual(
                d10.values("frames.predictions1.detections.label"),
                [
                    [],
                    [
                        None,
                        ["hello", "world"],
                        ["hello", "world", "foo", "bar"],
                        None,
                        ["foo", "bar"],
                    ],
                    [],
                ],
            )

    @drop_datasets
    def test_add_collection(self):
        sample1 = fo.Sample(filepath="video.mp4", foo="bar")
        sample1.frames[1] = fo.Frame(foo="bar")
        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1)

        sample2 = fo.Sample(filepath="video.mp4", spam="eggs")
        sample2.frames[1] = fo.Frame(spam="eggs")
        dataset2 = fo.Dataset()
        dataset2.add_sample(sample2)

        # Merge dataset
        dataset = dataset1.clone()
        dataset.add_collection(dataset2)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertTrue("spam" in dataset.get_field_schema())
        self.assertTrue("spam" in dataset.get_frame_field_schema())
        self.assertIsNone(dataset.first()["spam"])
        self.assertIsNone(dataset.first().frames.first()["spam"])
        self.assertEqual(dataset.last()["spam"], "eggs")
        self.assertEqual(dataset.last().frames.last()["spam"], "eggs")

        # Merge view
        dataset = dataset1.clone()
        dataset.add_collection(
            dataset2.exclude_fields(["spam", "frames.spam"])
        )

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertTrue("spam" not in dataset.get_field_schema())
        self.assertTrue("spam" not in dataset.get_frame_field_schema())
        self.assertIsNone(dataset.last()["foo"])
        self.assertIsNone(dataset.last().frames.last()["foo"])

    @drop_datasets
    def test_add_collection_new_ids(self):
        sample1 = fo.Sample(filepath="video.mp4", foo="bar")
        sample1.frames[1] = fo.Frame(foo="bar")
        dataset1 = fo.Dataset()
        dataset1.add_sample(sample1)

        # Merge dataset
        dataset = dataset1.clone()
        dataset.add_collection(dataset, new_ids=True)

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(len(set(dataset.values("frames.id", unwind=True))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertEqual(dataset.first().frames.first()["foo"], "bar")
        self.assertEqual(dataset.last()["foo"], "bar")
        self.assertEqual(dataset.last().frames.last()["foo"], "bar")

        # Merge view
        dataset = dataset1.clone()
        dataset.add_collection(
            dataset.exclude_fields(["foo", "frames.foo"]),
            new_ids=True,
        )

        self.assertEqual(len(dataset), 2)
        self.assertEqual(dataset.count("frames"), 2)
        self.assertEqual(len(set(dataset.values("id"))), 2)
        self.assertEqual(len(set(dataset.values("frames.id", unwind=True))), 2)
        self.assertEqual(dataset.first()["foo"], "bar")
        self.assertEqual(dataset.first().frames.first()["foo"], "bar")
        self.assertIsNone(dataset.last()["foo"])
        self.assertIsNone(dataset.last().frames.last()["foo"])

    @drop_datasets
    def test_to_clips(self):
        dataset = fo.Dataset()
        dataset.add_sample_field("support", fo.FrameSupportField)
        dataset.add_sample_field(
            "supports", fo.ListField, subfield=fo.FrameSupportField
        )

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                    fo.TemporalDetection(label="party", support=[2, 4]),
                ]
            ),
            support=[1, 2],
            supports=[[1, 1], [2, 3]],
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="party", support=[3, 5]),
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                ]
            ),
            support=[1, 4],
            supports=[[1, 3], [4, 5]],
        )
        sample2.frames[1] = fo.Frame(hello="goodbye")
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])
        self.assertEqual(dataset.to_clips("support").count("frames"), 3)
        self.assertEqual(dataset.to_clips("supports").count("frames"), 5)

        view = dataset.to_clips("events")

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "sample_id",
                "filepath",
                "support",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "events",
            },
        )

        self.assertEqual(
            view.get_field("metadata").document_type,
            fo.VideoMetadata,
        )

        self.assertListEqual(
            view.distinct("dataset_id"),
            [str(view._dataset._doc.id)],
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {
                "id",
                "sample_id",
                "filepath",
                "support",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
            },
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        with self.assertRaises(ValueError):
            view.exclude_fields("support")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
            "frames.id",
            "frames.created_at",
            "frames.last_modified_at",
            "frames._sample_id_1_frame_number_1",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("sample_id")  # can't drop default index

        self.assertEqual(len(view), 4)

        clip = view.first()
        self.assertIsInstance(clip.id, str)
        self.assertIsInstance(clip._id, ObjectId)
        self.assertIsInstance(clip.sample_id, str)
        self.assertIsInstance(clip._sample_id, ObjectId)
        self.assertIsInstance(clip.support, list)
        self.assertEqual(len(clip.support), 2)

        frames = []
        for clip in view:
            frames.append(list(clip.frames.keys()))

        self.assertListEqual(frames, [[1, 3], [3], [3, 5], [1, 3]])

        clip = view.first()
        clip.frames[1].hello = "there"
        clip.frames[2].hello = "there"
        clip.frames[3].hello = "there"
        clip.save()

        sample1.reload()
        for frame_number in [1, 2, 3]:
            frame = sample1.frames[frame_number]
            self.assertEqual(frame.hello, "there")

        clip = view.last()
        clip.frames[2]["world"] = "leader"
        clip.save()

        self.assertIn("world", view.get_frame_field_schema())
        self.assertIn("world", dataset.get_frame_field_schema())

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 2})
        self.assertDictEqual(view.count_sample_tags(), {"test": 4})

        view.tag_samples("foo")

        self.assertEqual(view.count_sample_tags()["foo"], 4)
        self.assertNotIn("foo", dataset.count_sample_tags())

        view.untag_samples("foo")

        self.assertNotIn("foo", view.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 4})
        self.assertDictEqual(dataset.count_label_tags(), {"test": 4})

        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = view.skip(2).set_field("events.label", F("label").upper())

        self.assertDictEqual(
            view2.count_values("events.label"), {"PARTY": 1, "MEETING": 1}
        )
        self.assertDictEqual(
            view.count_values("events.label"), {"party": 2, "meeting": 2}
        )
        self.assertDictEqual(
            dataset.count_values("events.detections.label"),
            {"meeting": 2, "party": 2},
        )

        values = {
            _id: v
            for _id, v in zip(*view2.values(["events.id", "events.label"]))
        }
        view.set_label_values("events.also_label", values)

        self.assertEqual(view.count("events.also_label"), 2)
        self.assertEqual(dataset.count("events.detections.also_label"), 2)
        self.assertDictEqual(
            view.count_values("events.also_label"),
            dataset.count_values("events.detections.also_label"),
        )

        view2.save()

        self.assertEqual(len(view), 4)
        self.assertEqual(dataset.count("events.detections"), 4)
        self.assertIn("MEETING", view.count_values("events.label"))
        self.assertIn("PARTY", view.count_values("events.label"))
        self.assertIn(
            "MEETING", dataset.count_values("events.detections.label")
        )
        self.assertIn("PARTY", dataset.count_values("events.detections.label"))
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().id)

        view2.keep()

        self.assertEqual(len(view), 2)
        self.assertEqual(dataset.count("events.detections"), 2)
        self.assertDictEqual(
            view.count_values("events.label"), {"MEETING": 1, "PARTY": 1}
        )
        self.assertDictEqual(
            dataset.count_values("events.detections.label"),
            {"MEETING": 1, "PARTY": 1},
        )
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().id)

        sample = view.first()

        sample["foo"] = "bar"
        sample["events"].label = "party"
        sample.save()

        self.assertIn("foo", view.get_field_schema())
        self.assertNotIn("foo", dataset.get_frame_field_schema())
        self.assertDictEqual(
            view.count_values("events.label"), {"party": 1, "MEETING": 1}
        )
        self.assertDictEqual(
            dataset.count_values("events.detections.label"),
            {"party": 1, "MEETING": 1},
        )

        dataset.untag_samples("test")
        view.reload()

        self.assertEqual(dataset.count_sample_tags(), {})
        self.assertEqual(view.count_sample_tags(), {})

        view.exclude_fields("frames.hello").keep_fields()

        self.assertNotIn("hello", view.get_frame_field_schema())
        self.assertNotIn("hello", dataset.get_frame_field_schema())

        frame_view = view.first().frames.first()
        with self.assertRaises(KeyError):
            frame_view["hello"]

        frame = dataset.first().frames.first()
        with self.assertRaises(KeyError):
            frame["hello"]

        view.select_fields().keep_fields()

        self.assertNotIn("events", view.get_field_schema())
        self.assertNotIn("events", dataset.get_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["events"]

        sample = dataset.first()
        with self.assertRaises(KeyError):
            sample["events"]

        # Test saving a clips view

        self.assertIsNone(view.name)

        view_name = "test"
        dataset.save_view(view_name, view)
        self.assertEqual(view.name, view_name)
        self.assertTrue(view.is_saved)

        also_view = dataset.load_saved_view(view_name)
        self.assertEqual(view, also_view)
        self.assertEqual(also_view.name, view_name)
        self.assertTrue(also_view.is_saved)

        still_view = deepcopy(view)
        self.assertEqual(still_view.name, view_name)
        self.assertTrue(still_view.is_saved)
        self.assertEqual(still_view, view)

    @drop_datasets
    def test_to_clips_expr(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            hello="world",
        )
        sample1.frames[1] = fo.Frame(
            detections=fo.Detections(detections=[fo.Detection(label="cat")])
        )
        sample1.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[4] = fo.Frame(
            detections=fo.Detections(detections=[fo.Detection(label="dog")])
        )

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            hello="there",
        )
        sample2.frames[2] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample2.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample2.frames[5] = fo.Frame(
            detections=fo.Detections(detections=[fo.Detection(label="dog")])
        )

        dataset.add_samples([sample1, sample2])

        view = dataset.to_clips("frames.detections")
        self.assertListEqual(
            view.values("support"), [[1, 1], [3, 4], [2, 3], [5, 5]]
        )

        view = dataset.to_clips("frames.detections", tol=1)
        self.assertListEqual(view.values("support"), [[1, 4], [2, 5]])

        view = dataset.filter_labels(
            "frames.detections", F("label") == "cat"
        ).to_clips("frames.detections")
        self.assertListEqual(view.values("support"), [[1, 1], [3, 3], [2, 3]])

        view = dataset.filter_labels(
            "frames.detections", F("label") == "cat"
        ).to_clips("frames.detections", tol=1, min_len=3)
        self.assertListEqual(view.values("support"), [[1, 3]])

        view = dataset.to_clips(
            F("detections.detections").length() >= 2, min_len=2
        )
        self.assertListEqual(view.values("support"), [[2, 3]])
        self.assertListEqual(
            view.distinct("dataset_id"),
            [str(view._dataset._doc.id)],
        )

        view = dataset.to_clips("frames.detections", other_fields=["hello"])
        view.select_fields().keep_fields()

        self.assertNotIn("detections", view.get_frame_field_schema())
        self.assertNotIn("detections", dataset.get_frame_field_schema())

        self.assertNotIn("hello", view.get_field_schema())
        self.assertIn("hello", dataset.get_field_schema())

        sample_view = view.first()
        with self.assertRaises(KeyError):
            sample_view["hello"]

        frame_view = sample_view.frames.first()
        with self.assertRaises(KeyError):
            frame_view["detections"]

        sample = dataset.first()
        frame = sample.frames.first()
        self.assertEqual(sample["hello"], "world")
        with self.assertRaises(KeyError):
            frame["detections"]

    @drop_datasets
    def test_to_clips_datetimes(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
        )
        sample2.frames[1] = fo.Frame(hello="goodbye")
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])

        field = dataset.get_field("frames.hello")
        field.read_only = True
        field.save()

        clips = dataset.to_clips([[(2, 3)], [(2, 4)]])

        field = clips.get_field("frames.hello")
        self.assertTrue(field.read_only)

        clip = clips.first()

        with self.assertRaises(ValueError):
            clip.created_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            clip.last_modified_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            clip.frames[2].hello = "no"

        clip.reload()

        # ClipFrame.save()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1c = clips.values("frames.created_at", unwind=True)
        last_modified_at1c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        for clip in clips.iter_samples():
            for frame in clip.frames.values():
                frame["foo"] = "bar"
                frame.save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2c = clips.values("frames.created_at", unwind=True)
        last_modified_at2c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(max(last_modified_at1) < max(last_modified_at2))
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1c, created_at2c))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1c, last_modified_at2c)
            )
        )

        # ClipFrameView.save()

        view = clips.select_fields("frames.hello")

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1c = view.values("frames.created_at", unwind=True)
        last_modified_at1c = view.values(
            "frames.last_modified_at", unwind=True
        )

        for clip in view.iter_samples():
            for frame in clip.frames.values():
                frame["spam"] = "eggs"

            clip.save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2c = view.values("frames.created_at", unwind=True)
        last_modified_at2c = view.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(max(last_modified_at1) < max(last_modified_at2))
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1c, created_at2c))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1c, last_modified_at2c)
            )
        )

        # ClipsView.set_values()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1c = clips.values("frames.created_at", unwind=True)
        last_modified_at1c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        clips.set_values("frames.foo", [["baz", "baz"], ["baz"]])

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2c = clips.values("frames.created_at", unwind=True)
        last_modified_at2c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(max(last_modified_at1) < max(last_modified_at2))
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1c, created_at2c))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1c, last_modified_at2c)
            )
        )

        # ClipsView.save()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1c = clips.values("frames.created_at", unwind=True)
        last_modified_at1c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        clips.set_field("frames.spam", "eggz").save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2c = clips.values("frames.created_at", unwind=True)
        last_modified_at2c = clips.values(
            "frames.last_modified_at", unwind=True
        )

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(max(last_modified_at1) < max(last_modified_at2))
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1c, created_at2c))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1c, last_modified_at2c)
            )
        )

    @drop_datasets
    def test_to_frames(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
        )
        sample1.frames[1] = fo.Frame(filepath="frame11.jpg", hello="world")
        sample1.frames[2] = fo.Frame(
            filepath="frame12.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )
        sample1.frames[3] = fo.Frame(filepath="frame13.jpg", hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
        )
        sample2.frames[1] = fo.Frame(
            filepath="frame21.jpg",
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame(filepath="frame23.jpg")
        sample2.frames[5] = fo.Frame(filepath="frame25.jpg", hello="there")

        dataset.add_samples([sample1, sample2])

        view = dataset.to_frames()

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_number",
                "hello",
                "ground_truth",
            },
        )

        self.assertEqual(
            view.get_field("metadata").document_type,
            fo.ImageMetadata,
        )

        self.assertListEqual(
            view.distinct("dataset_id"),
            [str(view._dataset._doc.id)],
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_number",
            },
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        with self.assertRaises(ValueError):
            view.exclude_fields("frame_number")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
            "_sample_id_1_frame_number_1",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("sample_id")  # can't drop default index

        self.assertEqual(len(view), 6)

        frame = view.first()
        self.assertIsInstance(frame.id, str)
        self.assertIsInstance(frame._id, ObjectId)
        self.assertIsInstance(frame.sample_id, str)
        self.assertIsInstance(frame._sample_id, ObjectId)

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 2})
        self.assertDictEqual(view.count_sample_tags(), {"test": 6})

        view.tag_samples("foo")

        self.assertEqual(view.count_sample_tags()["foo"], 6)
        self.assertNotIn("foo", dataset.count_sample_tags())
        self.assertNotIn("tags", dataset.get_frame_field_schema())

        view.untag_samples("foo")

        self.assertNotIn("foo", view.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 4})
        self.assertDictEqual(dataset.count_label_tags(), {"test": 4})

        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = view.skip(3).set_field(
            "ground_truth.detections.label", F("label").upper()
        )

        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )
        self.assertDictEqual(
            view2.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )

        values = {
            _id: v
            for _id, v in zip(
                *view2.values(
                    [
                        "ground_truth.detections.id",
                        "ground_truth.detections.label",
                    ],
                    unwind=True,
                )
            )
        }
        view.set_label_values("ground_truth.detections.also_label", values)

        self.assertEqual(view.count("ground_truth.detections.also_label"), 2)
        self.assertEqual(
            dataset.count("frames.ground_truth.detections.also_label"), 2
        )
        self.assertDictEqual(
            view.count_values("ground_truth.detections.also_label"),
            dataset.count_values("frames.ground_truth.detections.also_label"),
        )

        view2.save()

        self.assertEqual(len(view), 6)
        self.assertEqual(dataset.values(F("frames").length()), [3, 3])
        self.assertIn(
            "DOG", view.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "RABBIT", view.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "DOG", dataset.count_values("frames.ground_truth.detections.label")
        )
        self.assertIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().frames.first().id)

        view2.keep()

        self.assertEqual(len(view), 3)
        self.assertEqual(dataset.values(F("frames").length()), [0, 3])
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().frames.first().id)

        sample = view.exclude_fields("ground_truth").first()

        sample["foo"] = "bar"
        sample.save()

        self.assertIn("foo", view.get_field_schema())
        self.assertIn("foo", dataset.get_frame_field_schema())
        self.assertIn("ground_truth", view.get_field_schema())
        self.assertIn("ground_truth", dataset.get_frame_field_schema())
        self.assertEqual(view.count_values("foo")["bar"], 1)
        self.assertEqual(dataset.count_values("frames.foo")["bar"], 1)
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )

        dataset.untag_samples("test")
        view.reload()

        self.assertEqual(dataset.count_sample_tags(), {})
        self.assertEqual(view.count_sample_tags(), {})

        view.select_fields().keep_fields()

        self.assertNotIn("hello", view.get_field_schema())
        self.assertNotIn("ground_truth", view.get_field_schema())
        self.assertNotIn("hello", dataset.get_frame_field_schema())
        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        sample_view = view.last()
        with self.assertRaises(KeyError):
            sample_view["hello"]

        with self.assertRaises(KeyError):
            sample_view["ground_truth"]

        sample = dataset.last()
        frame = sample.frames.last()
        with self.assertRaises(KeyError):
            frame["hello"]

        with self.assertRaises(KeyError):
            frame["ground_truth"]

        # Test saving a frame view

        self.assertIsNone(view.name)

        view_name = "test"
        dataset.save_view(view_name, view)
        self.assertEqual(view.name, view_name)
        self.assertTrue(view.is_saved)

        also_view = dataset.load_saved_view(view_name)
        self.assertEqual(view, also_view)
        self.assertEqual(also_view.name, view_name)
        self.assertTrue(also_view.is_saved)

        still_view = deepcopy(view)
        self.assertEqual(still_view.name, view_name)
        self.assertTrue(still_view.is_saved)
        self.assertEqual(still_view, view)

    @drop_datasets
    def test_to_frames_schema(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(filepath="image.jpg")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        frames = dataset.to_frames()
        view = frames.select_fields()

        sample = view.first()
        sample["foo"] = "bar"
        sample.save()

        self.assertNotIn("foo", view.get_field_schema())
        self.assertIn("foo", frames.get_field_schema())
        self.assertIn("foo", dataset.get_frame_field_schema())

        frame = frames.first()
        self.assertEqual(frame["foo"], "bar")

        frame = dataset.first().frames.first()
        self.assertEqual(frame["foo"], "bar")

    @drop_datasets
    def test_to_frames_sparse(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
        )
        sample1.frames[1] = fo.Frame(filepath="image11.jpg")
        sample1.frames[2] = fo.Frame(
            filepath="image12.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )
        sample1.frames[3] = fo.Frame(filepath="image13.jpg", hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
        )
        sample2.frames[1] = fo.Frame(
            filepath="image21.jpg",
            ground_truth=fo.Detections(
                detections=[fo.Detection(label="rabbit")]
            ),
        )
        sample2.frames[3] = fo.Frame(filepath="image23.jpg")
        sample2.frames[5] = fo.Frame(filepath="image25.jpg", hello="there")

        dataset.add_samples([sample1, sample2])

        # `sparse=True` would only be needed here if `sample_frames=True`
        frames = dataset.to_frames()
        self.assertEqual(len(frames), 6)

        # `sparse=True` would only be needed here if `sample_frames=True`
        view = dataset.match_frames(F("ground_truth.detections").length() > 1)
        frames = view.to_frames()
        self.assertEqual(len(frames), 1)

    @drop_datasets
    def test_to_frames_filepaths(self):
        sample = fo.Sample(filepath="video.mp4")
        sample.frames[1] = fo.Frame(filepath="image.jpg")

        dataset = fo.Dataset()
        dataset.add_sample(sample)

        frames = dataset.to_frames()

        sample = frames.first()
        sample.filepath = "foo.jpg"
        sample.save()

        self.assertEqual(frames.first().filepath, "foo.jpg")
        self.assertEqual(dataset.first().frames.first().filepath, "foo.jpg")

        frames.set_values("filepath", ["bar.jpg"])

        self.assertEqual(frames.first().filepath, "bar.jpg")
        self.assertEqual(dataset.first().frames.first().filepath, "bar.jpg")

        frames.set_field("filepath", F("filepath").upper()).save()

        self.assertEqual(frames.first().filepath, "BAR.JPG")
        self.assertEqual(dataset.first().frames.first().filepath, "BAR.JPG")

    @drop_datasets
    def test_make_frames_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
        )
        sample1.frames[1] = fo.Frame(filepath="frame11.jpg", hello="world")
        sample1.frames[2] = fo.Frame(
            filepath="frame12.jpg",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            ),
        )
        sample1.frames[3] = fo.Frame(filepath="frame13.jpg", hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
        )
        sample2.frames[1] = fo.Frame(
            filepath="frame21.jpg",
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame(filepath="frame23.jpg")
        sample2.frames[5] = fo.Frame(filepath="frame25.jpg", hello="there")

        dataset.add_samples([sample1, sample2])

        frames_view = dataset.to_frames()
        frames_dataset = fov.make_frames_dataset(dataset)

        self.assertNotEqual(
            frames_dataset._sample_collection_name,
            dataset._sample_collection_name,
        )
        self.assertIsNone(frames_dataset._frame_collection_name)
        self.assertTrue(frames_view._is_generated)
        self.assertFalse(frames_dataset._is_generated)
        self.assertEqual(len(frames_dataset), dataset.count("frames"))
        self.assertEqual(len(frames_dataset), len(frames_view))

    @drop_datasets
    def test_frames_save_context(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(filepath="video1.mp4")
        sample1.frames[1] = fo.Frame(filepath="frame11.jpg")
        sample1.frames[2] = fo.Frame(filepath="frame12.jpg")
        sample1.frames[3] = fo.Frame(filepath="frame13.jpg")

        sample2 = fo.Sample(filepath="video2.mp4")

        sample3 = fo.Sample(filepath="video3.mp4")
        sample3.frames[1] = fo.Frame(filepath="frame31.jpg")

        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.to_frames()

        for sample in view.iter_samples(autosave=True):
            sample["foo"] = "bar"

        self.assertEqual(view.count("foo"), 4)
        self.assertEqual(dataset.count("frames.foo"), 4)

    @drop_datasets
    def test_to_frames_datetimes(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
        )
        sample1.frames[1] = fo.Frame(
            filepath="frame11.jpg",
            ground_truth=fo.Classification(label="cat"),
            predictions=fo.Detections(detections=[fo.Detection(label="cat")]),
        )
        sample1.frames[2] = fo.Frame(filepath="frame12.jpg")
        sample1.frames[3] = fo.Frame(filepath="frame13.jpg")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
        )
        sample2.frames[1] = fo.Frame(filepath="frame21.jpg")
        sample2.frames[3] = fo.Frame(filepath="frame23.jpg")
        sample2.frames[5] = fo.Frame(filepath="frame25.jpg")

        dataset.add_samples([sample1, sample2])

        field = dataset.get_field("frames.filepath")
        field.read_only = True
        field.save()

        field = dataset.get_field("frames.predictions.detections.label")
        field.read_only = True
        field.save()

        frames = dataset.to_frames()

        field = frames.get_field("filepath")
        self.assertTrue(field.read_only)

        field = frames.get_field("predictions.detections.label")
        self.assertTrue(field.read_only)

        frame = frames.first()

        with self.assertRaises(ValueError):
            frame.created_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            frame.last_modified_at = datetime.utcnow()

        with self.assertRaises(ValueError):
            frame.filepath = "no.jpg"

        frame.reload()

        frame.predictions.detections[0].label = "dog"
        with self.assertRaises(ValueError):
            frame.save()

        frame.reload()

        # Frame.save()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1f = frames.values("created_at")
        last_modified_at1f = frames.values("last_modified_at")

        for frame in frames.iter_samples():
            frame["foo"] = "bar"
            frame.save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2f = frames.values("created_at")
        last_modified_at2f = frames.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            )
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1f, created_at2f))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1f, last_modified_at2f)
            )
        )

        # FrameView.save()

        view = frames.select_fields()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1f = view.values("created_at")
        last_modified_at1f = view.values("last_modified_at")

        for frame in view.iter_samples():
            frame["spam"] = "eggs"
            frame.save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2f = view.values("created_at")
        last_modified_at2f = view.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            )
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1f, created_at2f))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1f, last_modified_at2f)
            )
        )

        # FramesView.set_values()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1f = frames.values("created_at")
        last_modified_at1f = frames.values("last_modified_at")

        frames.set_values("foo", ["baz"] * len(frames))

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2f = frames.values("created_at")
        last_modified_at2f = frames.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            )
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1f, created_at2f))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1f, last_modified_at2f)
            )
        )

        # FramesView.save()

        created_at1 = dataset.values("frames.created_at", unwind=True)
        last_modified_at1 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at1f = frames.values("created_at")
        last_modified_at1f = frames.values("last_modified_at")

        frames.set_field("spam", "eggz").save()

        created_at2 = dataset.values("frames.created_at", unwind=True)
        last_modified_at2 = dataset.values(
            "frames.last_modified_at", unwind=True
        )
        created_at2f = frames.values("created_at")
        last_modified_at2f = frames.values("last_modified_at")

        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1, created_at2))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1, last_modified_at2)
            )
        )
        self.assertTrue(
            all(dt1 == dt2 for dt1, dt2 in zip(created_at1f, created_at2f))
        )
        self.assertTrue(
            all(
                dt1 < dt2
                for dt1, dt2 in zip(last_modified_at1f, last_modified_at2f)
            )
        )

    @drop_datasets
    def test_to_clip_frames(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                    fo.TemporalDetection(label="party", support=[2, 4]),
                ]
            ),
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="party", support=[3, 5]),
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                ]
            ),
        )
        sample2.frames[1] = fo.Frame(
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])

        # Note that frame views into overlapping clips are designed to NOT
        # produce duplicate frames
        clips = dataset.to_clips("events")
        view = clips.to_frames(sample_frames="dynamic")

        self.assertSetEqual(
            set(view.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_number",
                "hello",
                "ground_truth",
            },
        )

        self.assertSetEqual(
            set(view.select_fields().get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_number",
            },
        )

        self.assertListEqual(
            view.distinct("dataset_id"),
            [str(view._dataset._doc.id)],
        )

        with self.assertRaises(ValueError):
            view.exclude_fields("sample_id")  # can't exclude default field

        with self.assertRaises(ValueError):
            view.exclude_fields("frame_number")  # can't exclude default field

        index_info = view.get_index_information()
        indexes = view.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
            "_sample_id_1_frame_number_1",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            view.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            view.drop_index("sample_id")  # can't drop default index

        self.assertEqual(len(view), 9)

        frame = view.first()
        self.assertIsInstance(frame.id, str)
        self.assertIsInstance(frame._id, ObjectId)
        self.assertIsInstance(frame.sample_id, str)
        self.assertIsInstance(frame._sample_id, ObjectId)

        for _id in view.values("id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in view.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in view.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 2})
        self.assertDictEqual(view.count_sample_tags(), {"test": 9})

        view.tag_samples("foo")

        self.assertEqual(view.count_sample_tags()["foo"], 9)
        self.assertNotIn("foo", dataset.count_sample_tags())
        self.assertNotIn("tags", dataset.get_frame_field_schema())

        view.untag_samples("foo")

        self.assertNotIn("foo", view.count_sample_tags())

        view.tag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {"test": 4})
        self.assertDictEqual(dataset.count_label_tags(), {"test": 4})

        view.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(view.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = view.skip(4).set_field(
            "ground_truth.detections.label", F("label").upper()
        )

        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )
        self.assertDictEqual(
            view2.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"cat": 1, "dog": 2, "rabbit": 1},
        )

        view2.save()

        self.assertEqual(len(view), 9)
        self.assertEqual(dataset.values(F("frames").length()), [3, 3])
        self.assertIn(
            "DOG", view.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "RABBIT", view.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "DOG", dataset.count_values("frames.ground_truth.detections.label")
        )
        self.assertIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().frames.first().id)

        view2.keep()

        self.assertEqual(len(view), 5)
        self.assertEqual(dataset.values(F("frames").length()), [0, 3])
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertIsNotNone(view.first().id)
        self.assertIsNotNone(dataset.last().frames.first().id)

        sample = view.exclude_fields("ground_truth").first()

        sample["foo"] = "bar"
        sample.save()

        self.assertIn("foo", view.get_field_schema())
        self.assertIn("foo", dataset.get_frame_field_schema())
        self.assertIn("ground_truth", view.get_field_schema())
        self.assertIn("ground_truth", dataset.get_frame_field_schema())
        self.assertEqual(view.count_values("foo")["bar"], 1)
        self.assertEqual(dataset.count_values("frames.foo")["bar"], 1)
        self.assertDictEqual(
            view.count_values("ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.label"),
            {"DOG": 1, "RABBIT": 1},
        )

        dataset.untag_samples("test")
        view.reload()

        self.assertEqual(dataset.count_sample_tags(), {})
        self.assertEqual(view.count_sample_tags(), {})

        view.select_fields().keep_fields()

        self.assertNotIn("ground_truth", view.get_field_schema())
        self.assertNotIn("ground_truth", clips.get_frame_field_schema())
        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        sample_view = view.last()
        with self.assertRaises(KeyError):
            sample_view["ground_truth"]

        frame_view = clips.last().frames.last()
        with self.assertRaises(KeyError):
            frame_view["ground_truth"]

        frame = dataset.last().frames.last()
        with self.assertRaises(KeyError):
            frame["ground_truth"]

    @drop_datasets
    def test_to_frame_patches(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
        )
        sample2.frames[1] = fo.Frame(
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])

        # User must first convert to frames, then patches
        with self.assertRaises(ValueError):
            dataset.to_patches("frames.ground_truth")

        frames = dataset.to_frames(sample_frames="dynamic")
        patches = frames.to_patches("ground_truth")

        self.assertSetEqual(
            set(patches.get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_id",
                "frame_number",
                "ground_truth",
            },
        )

        self.assertSetEqual(
            set(patches.select_fields().get_field_schema().keys()),
            {
                "id",
                "filepath",
                "metadata",
                "tags",
                "created_at",
                "last_modified_at",
                "sample_id",
                "frame_id",
                "frame_number",
            },
        )

        with self.assertRaises(ValueError):
            patches.exclude_fields("sample_id")  # can't exclude default field

        with self.assertRaises(ValueError):
            patches.exclude_fields("frame_id")  # can't exclude default field

        with self.assertRaises(ValueError):
            patches.exclude_fields(
                "frame_number"
            )  # can't exclude default field

        index_info = patches.get_index_information()
        indexes = patches.list_indexes()
        default_indexes = {
            "id",
            "filepath",
            "created_at",
            "last_modified_at",
            "sample_id",
            "frame_id",
            "_sample_id_1_frame_number_1",
        }

        self.assertSetEqual(set(index_info.keys()), default_indexes)
        self.assertSetEqual(set(indexes), default_indexes)

        with self.assertRaises(ValueError):
            patches.drop_index("id")  # can't drop default index

        with self.assertRaises(ValueError):
            patches.drop_index("filepath")  # can't drop default index

        with self.assertRaises(ValueError):
            patches.drop_index("sample_id")  # can't drop default index

        with self.assertRaises(ValueError):
            patches.drop_index("frame_id")  # can't drop default index

        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertEqual(patches.count(), 4)
        self.assertEqual(len(patches), 4)

        patch = patches.first()
        self.assertIsInstance(patch.id, str)
        self.assertIsInstance(patch._id, ObjectId)
        self.assertIsInstance(patch.sample_id, str)
        self.assertIsInstance(patch._sample_id, ObjectId)
        self.assertIsInstance(patch.frame_id, str)
        self.assertIsInstance(patch._frame_id, ObjectId)
        self.assertIsInstance(patch.frame_number, int)

        for _id in patches.values("id"):
            self.assertIsInstance(_id, str)

        for oid in patches.values("_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in patches.values("sample_id"):
            self.assertIsInstance(_id, str)

        for oid in patches.values("_sample_id"):
            self.assertIsInstance(oid, ObjectId)

        for _id in patches.values("frame_id"):
            self.assertIsInstance(_id, str)

        for oid in patches.values("_frame_id"):
            self.assertIsInstance(oid, ObjectId)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 2})
        self.assertDictEqual(patches.count_sample_tags(), {"test": 4})

        patches.tag_samples("patch")

        self.assertEqual(patches.count_sample_tags()["patch"], 4)
        self.assertNotIn("patch", frames.count_sample_tags())
        self.assertNotIn("patch", dataset.count_sample_tags())

        patches.untag_samples("patch")

        self.assertNotIn("patch", patches.count_sample_tags())
        self.assertNotIn("patch", frames.count_sample_tags())
        self.assertNotIn("patch", dataset.count_sample_tags())

        patches.tag_labels("test")

        self.assertDictEqual(patches.count_label_tags(), {"test": 4})
        self.assertDictEqual(frames.count_label_tags(), {"test": 4})
        self.assertDictEqual(
            dataset.count_label_tags("frames.ground_truth"), {"test": 4}
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        patches.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(patches.count_label_tags(), {})
        self.assertDictEqual(frames.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = patches.limit(2)

        values = [l.upper() for l in view2.values("ground_truth.label")]
        view2.set_values("ground_truth.label_upper", values)

        self.assertEqual(dataset.count(), 2)

        # Empty frames were added based on metadata frame counts
        self.assertEqual(frames.count(), 9)

        self.assertEqual(patches.count(), 4)
        self.assertEqual(view2.count(), 2)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertEqual(frames.count("ground_truth.detections"), 4)
        self.assertEqual(patches.count("ground_truth"), 4)
        self.assertEqual(view2.count("ground_truth"), 2)
        self.assertEqual(
            dataset.count("frames.ground_truth.detections.label_upper"), 2
        )
        self.assertEqual(
            frames.count("ground_truth.detections.label_upper"), 2
        )
        self.assertEqual(patches.count("ground_truth.label_upper"), 2)
        self.assertEqual(view2.count("ground_truth.label_upper"), 2)
        self.assertIsNone(patches.get_field("ground_truth.label_upper"))
        self.assertIsNone(
            frames.get_field("ground_truth.detections.label_upper")
        )
        self.assertIsNone(
            dataset.get_field("frames.ground_truth.detections.label_upper")
        )

        view2.set_values("ground_truth.label_dynamic", values, dynamic=True)
        self.assertIsNotNone(patches.get_field("ground_truth.label_dynamic"))
        self.assertIsNotNone(
            frames.get_field("ground_truth.detections.label_dynamic")
        )
        self.assertIsNotNone(
            dataset.get_field("frames.ground_truth.detections.label_dynamic")
        )

        values = {
            _id: v
            for _id, v in zip(
                *view2.values(["ground_truth.id", "ground_truth.label"])
            )
        }
        patches.set_label_values("ground_truth.also_label", values)

        self.assertEqual(patches.count("ground_truth.also_label"), 2)
        self.assertEqual(frames.count("ground_truth.detections.also_label"), 2)
        self.assertEqual(
            dataset.count("frames.ground_truth.detections.also_label"), 2
        )
        self.assertDictEqual(
            patches.count_values("ground_truth.also_label"),
            dataset.count_values("frames.ground_truth.detections.also_label"),
        )
        self.assertDictEqual(
            frames.count_values("ground_truth.detections.also_label"),
            dataset.count_values("frames.ground_truth.detections.also_label"),
        )

        view3 = patches.skip(2).set_field(
            "ground_truth.label", F("label").upper()
        )

        self.assertEqual(patches.count(), 4)
        self.assertEqual(view3.count(), 2)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertNotIn("rabbit", view3.count_values("ground_truth.label"))
        self.assertEqual(view3.count_values("ground_truth.label")["RABBIT"], 1)
        self.assertNotIn("RABBIT", patches.count_values("ground_truth.label"))
        self.assertNotIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )

        view3.save()

        self.assertEqual(patches.count(), 4)
        self.assertEqual(frames.count(), 9)
        self.assertEqual(dataset.count(), 2)
        self.assertEqual(patches.count("ground_truth"), 4)
        self.assertEqual(frames.count("ground_truth.detections"), 4)
        self.assertEqual(dataset.count("frames"), 6)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertIn("RABBIT", patches.count_values("ground_truth.label"))
        self.assertIn(
            "RABBIT", frames.count_values("ground_truth.detections.label")
        )
        self.assertIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )

        view3.keep()

        self.assertEqual(patches.count(), 2)
        self.assertEqual(frames.count(), 9)
        self.assertEqual(dataset.count(), 2)
        self.assertEqual(patches.count("ground_truth"), 2)
        self.assertEqual(frames.count("ground_truth.detections"), 2)
        self.assertEqual(dataset.count("frames"), 6)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 2)

        sample = patches.first()

        sample.ground_truth["hello"] = "world"
        sample.save()

        self.assertEqual(
            patches.count_values("ground_truth.hello")["world"], 1
        )
        self.assertEqual(
            frames.count_values("ground_truth.detections.hello")["world"], 1
        )
        self.assertEqual(
            dataset.count_values("frames.ground_truth.detections.hello")[
                "world"
            ],
            1,
        )

        dataset.untag_samples("test")
        patches.reload()

        self.assertDictEqual(dataset.count_sample_tags(), {})
        self.assertDictEqual(frames.count_sample_tags(), {})
        self.assertDictEqual(patches.count_sample_tags(), {})

        patches.tag_labels("test")

        self.assertDictEqual(
            patches.count_label_tags(), frames.count_label_tags()
        )
        self.assertDictEqual(
            patches.count_label_tags(), dataset.count_label_tags()
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        patches.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(patches.count_values("ground_truth.tags"), {})
        self.assertDictEqual(
            frames.count_values("ground_truth.detections.tags"), {}
        )
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.tags"), {}
        )

        patches.select_fields().keep_fields()

        self.assertNotIn("ground_truth", patches.get_field_schema())
        self.assertNotIn("ground_truth", frames.get_field_schema())
        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        patch_view = patches.first()
        with self.assertRaises(KeyError):
            patch_view["ground_truth"]

        frame_view = frames.first()
        with self.assertRaises(KeyError):
            frame_view["ground_truth"]

        frame = dataset.first().frames.first()
        with self.assertRaises(KeyError):
            frame["ground_truth"]

    @drop_datasets
    def test_to_clip_frame_patches(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                    fo.TemporalDetection(label="party", support=[2, 4]),
                ]
            ),
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="party", support=[3, 5]),
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                ]
            ),
        )
        sample2.frames[1] = fo.Frame(
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])

        # Note that frame views into overlapping clips are designed to NOT
        # produce duplicate frames
        clips = dataset.to_clips("events")
        frames = clips.to_frames(sample_frames="dynamic")
        patches = frames.to_patches("ground_truth")

        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertEqual(patches.count(), 4)
        self.assertEqual(len(patches), 4)

        self.assertDictEqual(dataset.count_sample_tags(), {"test": 2})
        self.assertDictEqual(patches.count_sample_tags(), {"test": 4})

        patches.tag_samples("patch")

        self.assertEqual(patches.count_sample_tags()["patch"], 4)
        self.assertNotIn("patch", frames.count_sample_tags())
        self.assertNotIn("patch", dataset.count_sample_tags())

        patches.untag_samples("patch")

        self.assertNotIn("patch", patches.count_sample_tags())
        self.assertNotIn("patch", frames.count_sample_tags())
        self.assertNotIn("patch", dataset.count_sample_tags())

        patches.tag_labels("test")

        self.assertDictEqual(patches.count_label_tags(), {"test": 4})
        self.assertDictEqual(frames.count_label_tags(), {"test": 4})
        self.assertDictEqual(
            dataset.count_label_tags("frames.ground_truth"), {"test": 4}
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        patches.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(patches.count_label_tags(), {})
        self.assertDictEqual(dataset.count_label_tags(), {})

        view2 = patches.limit(2)

        values = [l.upper() for l in view2.values("ground_truth.label")]
        view2.set_values("ground_truth.label_upper", values)

        self.assertEqual(dataset.count(), 2)

        self.assertEqual(patches.count(), 4)
        self.assertEqual(view2.count(), 2)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertEqual(patches.count("ground_truth"), 4)
        self.assertEqual(view2.count("ground_truth"), 2)
        self.assertEqual(
            dataset.count("frames.ground_truth.detections.label_upper"), 2
        )
        self.assertEqual(patches.count("ground_truth.label_upper"), 2)
        self.assertEqual(view2.count("ground_truth.label_upper"), 2)
        self.assertIsNone(patches.get_field("ground_truth.label_upper"))
        self.assertIsNone(
            dataset.get_field("frames.ground_truth.detections.label_upper")
        )

        view2.set_values("ground_truth.label_dynamic", values, dynamic=True)
        self.assertIsNotNone(patches.get_field("ground_truth.label_dynamic"))
        self.assertIsNotNone(
            dataset.get_field("frames.ground_truth.detections.label_dynamic")
        )

        view3 = patches.skip(2).set_field(
            "ground_truth.label", F("label").upper()
        )

        self.assertEqual(patches.count(), 4)
        self.assertEqual(view3.count(), 2)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertNotIn("rabbit", view3.count_values("ground_truth.label"))
        self.assertEqual(view3.count_values("ground_truth.label")["RABBIT"], 1)
        self.assertNotIn("RABBIT", patches.count_values("ground_truth.label"))
        self.assertNotIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )

        view3.save()

        self.assertEqual(patches.count(), 4)
        self.assertEqual(dataset.count(), 2)
        self.assertEqual(patches.count("ground_truth"), 4)
        self.assertEqual(dataset.count("frames"), 6)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 4)
        self.assertIn("RABBIT", patches.count_values("ground_truth.label"))
        self.assertIn(
            "RABBIT",
            dataset.count_values("frames.ground_truth.detections.label"),
        )

        view3.keep()

        self.assertEqual(patches.count(), 2)
        self.assertEqual(dataset.count(), 2)
        self.assertEqual(patches.count("ground_truth"), 2)
        self.assertEqual(dataset.count("frames"), 6)
        self.assertEqual(dataset.count("frames.ground_truth.detections"), 2)

        sample = patches.first()

        sample.ground_truth["hello"] = "world"
        sample.save()

        self.assertEqual(
            patches.count_values("ground_truth.hello")["world"], 1
        )
        self.assertEqual(
            dataset.count_values("frames.ground_truth.detections.hello")[
                "world"
            ],
            1,
        )

        dataset.untag_samples("test")
        patches.reload()

        self.assertDictEqual(dataset.count_sample_tags(), {})
        self.assertDictEqual(patches.count_sample_tags(), {})

        patches.tag_labels("test")

        self.assertDictEqual(
            patches.count_label_tags(), dataset.count_label_tags()
        )

        # Including `select_labels()` here tests an important property: if the
        # contents of a `view` changes after a save operation occurs, the
        # original view still needs to be synced with the source dataset
        patches.select_labels(tags="test").untag_labels("test")

        self.assertDictEqual(patches.count_values("ground_truth.tags"), {})
        self.assertDictEqual(
            dataset.count_values("frames.ground_truth.detections.tags"), {}
        )

        patches.select_fields().keep_fields()

        self.assertNotIn("ground_truth", patches.get_field_schema())
        self.assertNotIn("ground_truth", frames.get_field_schema())
        self.assertNotIn("ground_truth", clips.get_frame_field_schema())
        self.assertNotIn("ground_truth", dataset.get_frame_field_schema())

        patch_view = patches.first()
        with self.assertRaises(KeyError):
            patch_view["ground_truth"]

        frame_view = frames.first()
        with self.assertRaises(KeyError):
            frame_view["ground_truth"]

        clip_frame_view = clips.first().frames.first()
        with self.assertRaises(KeyError):
            clip_frame_view["ground_truth"]

        frame = dataset.first().frames.first()
        with self.assertRaises(KeyError):
            frame["ground_truth"]

    @drop_datasets
    def test_detection_frames(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
        )
        sample1.frames[1] = fo.Frame(
            filepath="frame11.jpg", detection=fo.Detection(label="cat")
        )
        sample1.frames[2] = fo.Frame(filepath="frame12.jpg")
        sample1.frames[3] = fo.Frame(
            filepath="frame13.jpg", detection=fo.Detection(label="dog")
        )

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
        )
        sample2.frames[1] = fo.Frame(
            filepath="frame21.jpg", detection=fo.Detection(label="dog")
        )
        sample2.frames[3] = fo.Frame(filepath="frame23.jpg")
        sample2.frames[5] = fo.Frame(
            filepath="frame25.jpg", detection=fo.Detection(label="rabbit")
        )

        dataset.add_samples([sample1, sample2])

        frames = dataset.to_frames()
        view = frames.filter_labels("detection", F("label") == "dog")

        view.tag_samples("test")

        self.assertEqual(view.count_sample_tags(), {"test": 2})
        self.assertEqual(dataset.count_sample_tags(), {})

        view.untag_samples("test")

        self.assertEqual(frames.count_sample_tags(), {})
        self.assertEqual(dataset.count_sample_tags(), {})

        view.tag_labels("test")

        self.assertEqual(view.count_label_tags(), {"test": 2})
        self.assertEqual(dataset.count_label_tags(), {"test": 2})

        view.untag_labels("test")

        self.assertEqual(view.count_label_tags(), {})
        self.assertEqual(dataset.count_label_tags(), {})

        view.tag_labels("test")

        self.assertEqual(view.count_label_tags(), {"test": 2})
        self.assertEqual(dataset.count_label_tags(), {"test": 2})

        view.select_labels(tags="test").untag_labels("test")

        self.assertEqual(view.count_label_tags(), {})
        self.assertEqual(dataset.count_label_tags(), {})

    @drop_datasets
    def test_temporal_detection_clips(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            event=fo.TemporalDetection(label="meeting", support=[1, 3]),
        )
        sample2 = fo.Sample(filepath="video2.mp4")
        sample3 = fo.Sample(
            filepath="video3.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            event=fo.TemporalDetection(label="party", support=[3, 5]),
        )

        dataset.add_samples([sample1, sample2, sample3])

        clips = dataset.to_clips("event")

        self.assertEqual(len(clips), 2)

        clips.tag_samples("test")

        self.assertEqual(clips.count_sample_tags(), {"test": 2})
        self.assertEqual(dataset.count_sample_tags(), {})

        clips.untag_samples("test")

        self.assertEqual(clips.count_sample_tags(), {})
        self.assertEqual(dataset.count_sample_tags(), {})

        clips.tag_labels("test")

        self.assertEqual(clips.count_label_tags(), {"test": 2})
        self.assertEqual(dataset.count_label_tags(), {"test": 2})

        clips.untag_labels("test")

        self.assertEqual(clips.count_label_tags(), {})
        self.assertEqual(dataset.count_label_tags(), {})

        clips.tag_labels("test")

        self.assertEqual(clips.count_label_tags(), {"test": 2})
        self.assertEqual(dataset.count_label_tags(), {"test": 2})

        clips.select_labels(tags="test").untag_labels("test")

        self.assertEqual(clips.count_label_tags(), {})
        self.assertEqual(dataset.count_label_tags(), {})

    @drop_datasets
    def test_to_trajectories(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
        )
        sample1.frames[1] = fo.Frame(
            detections=fo.Detections(
                detections=[fo.Detection(label="cat", index=1)]
            )
        )
        sample1.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="dog", index=1),
                ]
            )
        )
        sample1.frames[4] = fo.Frame(
            detections=fo.Detections(
                detections=[fo.Detection(label="dog", index=1)]
            )
        )

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
        )
        sample2.frames[2] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="dog", index=2),
                ]
            )
        )
        sample2.frames[3] = fo.Frame(
            detections=fo.Detections(
                detections=[
                    fo.Detection(label="cat", index=1),
                    fo.Detection(label="dog", index=3),
                ]
            )
        )
        sample2.frames[5] = fo.Frame(
            detections=fo.Detections(
                detections=[fo.Detection(label="dog", index=3)]
            )
        )

        dataset.add_samples([sample1, sample2])

        trajectories = dataset.to_trajectories("frames.detections")

        self.assertEqual(len(trajectories), 5)
        self.assertEqual(
            dataset.count("frames.detections.detections"),
            trajectories.count("frames.detections.detections"),
        )

        trajs_map = {
            (_id, l, i): s
            for _id, l, i, s in zip(
                *trajectories.values(
                    [
                        "sample_id",
                        "detections.label",
                        "detections.index",
                        "support",
                    ]
                )
            )
        }

        expected_trajs_map = {
            (sample1.id, "cat", 1): [1, 3],
            (sample1.id, "dog", 1): [3, 4],
            (sample2.id, "cat", 1): [2, 3],
            (sample2.id, "dog", 2): [2, 2],
            (sample2.id, "dog", 3): [3, 5],
        }

        self.assertDictEqual(trajs_map, expected_trajs_map)

        schema = trajectories.get_field_schema(flat=True)
        self.assertIn("detections.label", schema)
        self.assertIn("detections.index", schema)

        schema = trajectories.get_frame_field_schema()
        self.assertIn("detections", schema)

    @drop_datasets
    def test_make_clips_dataset(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            metadata=fo.VideoMetadata(total_frame_count=4),
            tags=["test"],
            weather="sunny",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                    fo.TemporalDetection(label="party", support=[2, 4]),
                ]
            ),
        )
        sample1.frames[1] = fo.Frame(hello="world")
        sample1.frames[2] = fo.Frame(
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="cat"),
                    fo.Detection(label="dog"),
                ]
            )
        )
        sample1.frames[3] = fo.Frame(hello="goodbye")

        sample2 = fo.Sample(
            filepath="video2.mp4",
            metadata=fo.VideoMetadata(total_frame_count=5),
            tags=["test"],
            weather="cloudy",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="party", support=[3, 5]),
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                ]
            ),
        )
        sample2.frames[1] = fo.Frame(
            hello="goodbye",
            ground_truth=fo.Detections(
                detections=[
                    fo.Detection(label="dog"),
                    fo.Detection(label="rabbit"),
                ]
            ),
        )
        sample2.frames[3] = fo.Frame()
        sample2.frames[5] = fo.Frame(hello="there")

        dataset.add_samples([sample1, sample2])

        clips_view = dataset.to_clips("events")
        clips_dataset = foc.make_clips_dataset(dataset, "events")

        self.assertNotEqual(
            clips_dataset._sample_collection_name,
            dataset._sample_collection_name,
        )
        self.assertNotEqual(
            clips_dataset._frame_collection_name,
            dataset._frame_collection_name,
        )
        self.assertTrue(clips_view._is_generated)
        self.assertFalse(clips_dataset._is_generated)
        self.assertEqual(len(clips_dataset), len(clips_view))
        self.assertEqual(
            clips_dataset.count("frames"), clips_view.count("frames")
        )

    @drop_datasets
    def test_clips_save_context(self):
        dataset = fo.Dataset()

        sample1 = fo.Sample(
            filepath="video1.mp4",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="meeting", support=[1, 3]),
                    fo.TemporalDetection(label="party", support=[2, 4]),
                ]
            ),
        )
        sample1.frames[1] = fo.Frame()
        sample1.frames[2] = fo.Frame()
        sample1.frames[3] = fo.Frame()

        sample2 = fo.Sample(filepath="video2.mp4")

        sample3 = fo.Sample(
            filepath="video3.mp4",
            events=fo.TemporalDetections(
                detections=[
                    fo.TemporalDetection(label="party", support=[3, 5]),
                ]
            ),
        )
        sample3.frames[1] = fo.Frame()
        sample3.frames[3] = fo.Frame()
        sample3.frames[5] = fo.Frame()

        dataset.add_samples([sample1, sample2, sample3])

        view = dataset.to_clips("events")

        for sample in view.iter_samples(autosave=True):
            sample.events.foo = "bar"
            for frame in sample.frames.values():
                frame["foo"] = "bar"

        self.assertEqual(view.count("events.foo"), 3)
        # tricky: this is 7 because `view` contains overlapping frame supports
        self.assertEqual(view.count("frames.foo"), 7)
        self.assertEqual(dataset.count("events.detections.foo"), 3)
        self.assertEqual(dataset.count("frames.foo"), 5)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
