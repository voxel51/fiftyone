"""
FiftyOne sample-related unit tests.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import os
import tempfile
import unittest

from bson import Binary, ObjectId
import numpy as np
from PIL import ExifTags, Image

import fiftyone as fo
from fiftyone import ViewField as F
import fiftyone.core.odm as foo
import fiftyone.core.sample as fos

from decorators import drop_datasets


class SampleTests(unittest.TestCase):
    @drop_datasets
    def test_backing_doc_type(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")
        self.assertIsInstance(sample._doc, foo.NoDatasetSampleDocument)

    @drop_datasets
    def test_abs_filepath(self):
        filepath = "relative/file.jpg"
        abs_filepath = os.path.abspath(filepath)

        sample = fo.Sample(filepath=filepath)
        self.assertEqual(sample.filepath, abs_filepath)

    @drop_datasets
    def test_get_field(self):
        field_value = "custom_value"
        sample = fo.Sample(filepath="/path/to/image.jpg", field1=field_value)

        # get valid
        self.assertEqual(sample.get_field("field1"), field_value)
        self.assertEqual(sample["field1"], field_value)
        self.assertEqual(sample.field1, field_value)

        # get missing
        with self.assertRaises(AttributeError):
            sample.get_field("missing_field")

        with self.assertRaises(KeyError):
            sample["missing_field"]

        with self.assertRaises(AttributeError):
            sample.missing_field

    @drop_datasets
    def test_set_field(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")

        value = 51

        # set_field with create=False
        with self.assertRaises(ValueError):
            sample.set_field("field1", value, create=False)

        with self.assertRaises(AttributeError):
            sample.get_field("field1")

        with self.assertRaises(KeyError):
            sample["field1"]

        with self.assertRaises(AttributeError):
            sample.field1

        # set_field
        sample.set_field("field2", value)
        self.assertIsInstance(sample.field2, int)
        self.assertEqual(sample.get_field("field2"), value)
        self.assertEqual(sample["field2"], value)
        self.assertEqual(sample.field2, value)

        # __setitem__
        sample["field3"] = value
        self.assertEqual(sample.get_field("field3"), value)
        self.assertEqual(sample["field3"], value)
        self.assertEqual(sample.field3, value)

        # __setattr__
        with self.assertRaises(ValueError):
            sample.field4 = value

        with self.assertRaises(AttributeError):
            sample.get_field("field4")

        with self.assertRaises(KeyError):
            sample["field4"]

    @drop_datasets
    def test_change_value(self):
        sample = fo.Sample(filepath="/path/to/image.jpg")

        # init
        value = 51
        sample["test_field"] = value
        self.assertEqual(sample.test_field, value)

        # update setitem
        value = 52
        sample["test_field"] = value
        self.assertEqual(sample.test_field, value)

        # update setattr
        value = 53
        sample.test_field = value
        self.assertEqual(sample.test_field, value)

    @drop_datasets
    def test_bson_fields(self):
        sample = fo.Sample(
            filepath="image.jpg",
            sample_id=ObjectId(),
            embedding=np.random.randn(4),
        )

        d = sample.to_mongo_dict(include_id=True)
        self.assertIsNone(d["_id"])
        self.assertIsInstance(d["embedding"], Binary)
        self.assertIsInstance(d["_sample_id"], ObjectId)

        d = sample.to_dict()

        sample2 = fo.Sample.from_dict(d)
        self.assertIsInstance(sample2["embedding"], np.ndarray)

        d = sample.to_dict(include_private=True)

        sample2 = fo.Sample.from_dict(d)
        self.assertIsInstance(sample2["sample_id"], str)
        self.assertIsInstance(sample2["embedding"], np.ndarray)

    @drop_datasets
    def test_nested_fields(self):
        sample = fo.Sample(
            filepath="image1.jpg",
            dynamic=fo.DynamicEmbeddedDocument(
                classification=fo.Classification(label="hi"),
                classification_list=[
                    fo.Classification(label="foo"),
                    fo.Classification(label="bar"),
                ],
                classifications=fo.Classifications(
                    classifications=[
                        fo.Classification(label="spam"),
                        fo.Classification(label="eggs"),
                    ]
                ),
            ),
        )

        self.assertIsInstance(sample["dynamic"], fo.DynamicEmbeddedDocument)
        self.assertIsInstance(
            sample["dynamic.classification"], fo.Classification
        )
        self.assertIsInstance(sample["dynamic.classification_list"], list)
        self.assertIsInstance(
            sample["dynamic.classifications"], fo.Classifications
        )
        self.assertIsInstance(
            sample["dynamic.classifications.classifications"], list
        )
        self.assertIsInstance(
            sample["dynamic.classifications.classifications"][0],
            fo.Classification,
        )

        with self.assertRaises(KeyError):
            sample["foo"]

        with self.assertRaises(KeyError):
            sample["dynamic.foo"]

        with self.assertRaises(KeyError):
            sample["dynamic.classification.foo"]

        with self.assertRaises(KeyError):
            sample["dynamic.classifications.foo"]

        with self.assertRaises(KeyError):
            sample["dynamic.classifications.classifications.foo"]

    def test_compute_metadata_exif_transpose(self):
        width = 800
        height = 1200
        img = Image.new("RGB", (width, height), (255, 255, 255))
        self.assertEqual(img.width, width)
        self.assertEqual(img.height, height)

        with tempfile.NamedTemporaryFile("w") as image_file:
            # Test all possible orientations. width/height only flipped with
            #   5, 6, 7, 8
            for orientation in range(1, 10):
                exif = img.getexif()
                exif[ExifTags.Base.Orientation] = orientation

                expected_width, expected_height = width, height
                if orientation in {5, 6, 7, 8}:
                    expected_width, expected_height = height, width
                img.save(image_file.name, "jpeg", exif=exif)

                sample = fo.Sample(image_file.name)
                sample.compute_metadata()

                self.assertEqual(sample.metadata.width, expected_width)
                self.assertEqual(sample.metadata.height, expected_height)
                self.assertEqual(sample.metadata.num_channels, 3)

            # Finally a normal non-exif file
            img.save(image_file.name, "jpeg")
            sample = fo.Sample(image_file.name)
            sample.compute_metadata()
            self.assertEqual(sample.metadata.width, width)
            self.assertEqual(sample.metadata.height, height)
            self.assertEqual(sample.metadata.num_channels, 3)


class SampleInDatasetTests(unittest.TestCase):
    @drop_datasets
    def test_invalid_sample(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg", tags=51)

        with self.assertRaises(Exception):
            dataset.add_sample(sample)

        self.assertEqual(len(dataset), 0)

    @drop_datasets
    def test_dataset_clear(self):
        dataset = fo.Dataset()

        self.assertEqual(len(dataset), 0)

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

        # delete all samples
        dataset.clear()
        self.assertEqual(len(dataset), 0)

        # add some new samples
        num_samples = 5
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

    @drop_datasets
    def test_dataset_delete_samples(self):
        dataset = fo.Dataset()

        # add some samples
        num_samples = 10
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i)
            for i in range(num_samples)
        ]
        ids = dataset.add_samples(samples)
        self.assertEqual(len(dataset), num_samples)

        # delete all samples
        num_delete = 7
        dataset.delete_samples(ids[:num_delete])
        self.assertEqual(len(dataset), num_samples - num_delete)

    @drop_datasets
    def test_getitem(self):
        dataset = fo.Dataset()

        # add some samples
        samples = [
            fo.Sample(filepath="/path/to/image_%d.jpg" % i) for i in range(10)
        ]
        sample_ids = dataset.add_samples(samples)

        sample_id = sample_ids[0]
        self.assertIsInstance(sample_id, str)
        sample = dataset[sample_id]
        self.assertIsInstance(sample, fo.Sample)
        self.assertEqual(sample.id, sample_id)

        with self.assertRaises(ValueError):
            dataset[0]

        with self.assertRaises(KeyError):
            dataset["F" * 24]

    @drop_datasets
    def test_autopopulated_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        self.assertIsNone(sample.id)
        self.assertFalse(sample.in_dataset)
        self.assertIsNone(sample.dataset)

        dataset.add_sample(sample)

        self.assertIsNotNone(sample.id)
        self.assertIsInstance(sample.id, str)
        self.assertTrue(sample.in_dataset)
        self.assertIs(sample.dataset, dataset)

    @drop_datasets
    def test_new_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(ValueError):
            dataset.add_sample(sample, expand_schema=False)

        # ensure sample was not inserted
        self.assertEqual(len(dataset), 0)

        dataset.add_sample(sample)
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], fo.IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    @drop_datasets
    def test_new_fields_multi(self):
        dataset = fo.Dataset()
        sample = fo.Sample(filepath="/path/to/image.jpg")

        field_name = "field1"
        value = 51

        sample[field_name] = value

        with self.assertRaises(ValueError):
            dataset.add_samples([sample], expand_schema=False)

        dataset.add_samples([sample])
        fields = dataset.get_field_schema()
        self.assertIsInstance(fields[field_name], fo.IntField)
        self.assertEqual(sample[field_name], value)
        self.assertEqual(dataset[sample.id][field_name], value)

    @drop_datasets
    def test_update_sample(self):
        dataset = fo.Dataset()
        filepath = "/path/to/image.jpg"
        sample = fo.Sample(filepath=filepath, tags=["tag1", "tag2"])
        dataset.add_sample(sample)

        self.assertEqual(len(dataset), 1)

        # update assign
        tag = "tag3"
        sample.tags = [tag]
        self.assertEqual(len(sample.tags), 1)
        self.assertEqual(sample.tags[0], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 1)
        self.assertEqual(sample2.tags[0], tag)

        # update append
        tag = "tag4"
        sample.tags.append(tag)
        self.assertEqual(len(sample.tags), 2)
        self.assertEqual(sample.tags[-1], tag)
        sample2 = dataset[sample.id]
        self.assertEqual(len(sample2.tags), 2)
        self.assertEqual(sample2.tags[-1], tag)

        # update add new field
        dataset.add_sample_field(
            "test_label",
            fo.EmbeddedDocumentField,
            embedded_doc_type=fo.Classification,
        )
        sample.test_label = fo.Classification(label="cow")
        self.assertEqual(sample.test_label.label, "cow")
        self.assertEqual(sample.test_label.label, "cow")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "cow")

        # update modify embedded document
        sample.test_label.label = "chicken"
        self.assertEqual(sample.test_label.label, "chicken")
        self.assertEqual(sample.test_label.label, "chicken")
        sample2 = dataset[sample.id]
        self.assertEqual(sample2.test_label.label, "chicken")

    @drop_datasets
    def test_add_from_another_dataset(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample = fo.Sample(filepath="test.png")

        sample_id = dataset1.add_sample(sample)
        self.assertIs(dataset1[sample_id], sample)
        self.assertIs(sample.dataset, dataset1)

        sample_id2 = dataset2.add_sample(sample)
        self.assertNotEqual(sample_id2, sample_id)

        sample2 = dataset2[sample_id2]
        self.assertIs(dataset1[sample.id], sample)
        self.assertIsNot(dataset2[sample_id2], sample)
        self.assertIs(sample2.dataset, dataset2)

        # Dataset.add_samples()

        sample = fo.Sample(filepath="test2.png")

        sample_id = dataset1.add_samples([sample])[0]
        self.assertIs(dataset1[sample_id], sample)
        self.assertIs(sample.dataset, dataset1)

        sample_id2 = dataset2.add_samples([sample])[0]
        self.assertNotEqual(sample_id2, sample_id)

        sample2 = dataset2[sample_id2]
        self.assertIs(dataset1[sample.id], sample)
        self.assertIsNot(dataset2[sample_id2], sample)
        self.assertIs(sample2.dataset, dataset2)

    @drop_datasets
    def test_copy_sample(self):
        dataset = fo.Dataset()

        sample = fo.Sample(filepath="test.png")

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset)

        dataset.add_sample(sample)

        sample_copy = sample.copy()
        self.assertIsNot(sample_copy, sample)
        self.assertIsNone(sample_copy.id)
        self.assertIsNone(sample_copy.dataset)

    @drop_datasets
    def test_in_memory_sample_fields(self):
        """Ensures that in-memory samples have their field values purged when
        a field is deleted.
        """
        dataset = fo.Dataset()

        s1 = fo.Sample("s1.png")
        s2 = fo.Sample("s2.png")

        dataset.add_samples([s1, s2])

        s1["new_field"] = 51
        dataset.delete_sample_field("new_field")
        s2["new_field"] = "fiftyone"

        self.assertIsNone(s1.new_field)
        self.assertEqual(s2.new_field, "fiftyone")

    @drop_datasets
    def test_nested_fields(self):
        sample1 = fo.Sample(
            filepath="image1.jpg",
            dynamic=fo.DynamicEmbeddedDocument(
                classification=fo.Classification(label="hi"),
                classification_list=[
                    fo.Classification(label="foo"),
                    fo.Classification(label="bar"),
                ],
                classifications=fo.Classifications(
                    classifications=[
                        fo.Classification(label="spam"),
                        fo.Classification(label="eggs"),
                    ]
                ),
            ),
        )

        sample2 = fo.Sample(filepath="image2.jpg")

        dataset = fo.Dataset()
        dataset.add_samples([sample1, sample2], dynamic=True)

        self.assertIsInstance(sample1["dynamic"], fo.DynamicEmbeddedDocument)
        self.assertIsInstance(
            sample1["dynamic.classification"], fo.Classification
        )
        self.assertIsInstance(sample1["dynamic.classification_list"], list)
        self.assertIsInstance(
            sample1["dynamic.classifications"], fo.Classifications
        )
        self.assertIsInstance(
            sample1["dynamic.classifications.classifications"], list
        )
        self.assertIsInstance(
            sample1["dynamic.classifications.classifications"][0],
            fo.Classification,
        )

        self.assertIsNone(sample2["dynamic"])
        self.assertIsNone(sample2["dynamic.classification"])
        self.assertIsNone(sample2["dynamic.classification_list"])
        self.assertIsNone(sample2["dynamic.classifications"])
        self.assertIsNone(sample2["dynamic.classifications.classifications"])

        with self.assertRaises(KeyError):
            sample1["foo"]

        with self.assertRaises(KeyError):
            sample2["foo"]

        with self.assertRaises(KeyError):
            sample1["dynamic.foo"]

        with self.assertRaises(KeyError):
            sample2["dynamic.foo"]

        with self.assertRaises(KeyError):
            sample1["dynamic.classification.foo"]

        with self.assertRaises(KeyError):
            sample2["dynamic.classification.foo"]

        with self.assertRaises(KeyError):
            sample1["dynamic.classifications.foo"]

        with self.assertRaises(KeyError):
            sample2["dynamic.classifications.foo"]

        with self.assertRaises(KeyError):
            sample1["dynamic.classifications.classifications.foo"]

        with self.assertRaises(KeyError):
            sample2["dynamic.classifications.classifications.foo"]


class SampleCollectionTests(unittest.TestCase):
    @drop_datasets
    def test_first_last(self):
        dataset = fo.Dataset()
        dataset.add_samples([fo.Sample("test_%d.png" % i) for i in range(3)])

        self.assertIsInstance(dataset.first(), fo.Sample)
        self.assertIsInstance(dataset.last(), fo.Sample)
        self.assertIsInstance(dataset.view().first(), fos.SampleView)
        self.assertIsInstance(dataset.view().last(), fos.SampleView)


class VideoSampleTests(unittest.TestCase):
    @drop_datasets
    def setUp(self):
        self.dataset = fo.Dataset()

    def _make_dataset(self):
        dataset = fo.Dataset()
        dataset.add_samples(
            [
                fo.Sample("/path/to/video1.mp4"),
                fo.Sample("/path/to/video2.mp4"),
                fo.Sample("/path/to/video3.mp4"),
                fo.Sample("/path/to/video4.mp4"),
            ]
        )
        return dataset

    def test_no_dataset_samples(self):
        sample = fo.Sample(filepath="video.mp4")
        sample[1]["attribute"] = "attr"
        self.assertEqual(sample[1]["attribute"], "attr")

        for idx, frame in enumerate(sample):
            self.assertEqual(idx, 0)

    def test_dataset_samples(self):
        sample = fo.Sample(filepath="video.mp4")
        self.dataset.add_sample(sample)
        sample[1]["attribute"] = "attr"
        self.assertEqual(sample[1]["attribute"], "attr")

        for idx, frame in enumerate(sample):
            self.assertEqual(idx, 0)

    def test_save(self):
        dataset = self._make_dataset()

        for sample in dataset.iter_samples():
            for i in range(1, 50):
                sample.frames[i]["box"] = fo.Detection(
                    label="foo", bounding_box=[i / 100, i / 100, 0.9, 0.9]
                )
            sample.save()

        for sample in dataset.iter_samples():
            for i in range(1, 50):
                self.assertEqual(sample.frames[i]["box"].label, "foo")

    def test_frames(self):
        dataset = self._make_dataset()
        for sample in dataset.iter_samples():
            for i in range(1, 50):
                sample[i]["label"] = i

            sample.save()

        for sample in dataset.iter_samples():
            for idx, frame_number in enumerate(sample):
                self.assertEqual(frame_number - 1, idx)

            for idx, frame_number in enumerate(sample.frames.keys()):
                self.assertEqual(frame_number - 1, idx)

            for idx, (frame_number, frame) in enumerate(sample.frames.items()):
                self.assertEqual(frame_number - 1, idx)
                self.assertEqual(frame["label"], frame_number)

            for idx, frame in enumerate(sample.frames.values()):
                self.assertEqual(frame["label"], idx + 1)

        f = fo.Frame(frame_number=2)
        f["frame_number"] = 1
        self.assertEqual(f.frame_number, 1)

        s = fo.Sample(filepath="video.mp4")
        s[2] = f
        self.assertEqual(s[2].frame_number, 2)

    def test_frame(self):
        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        label = "label"
        new_label = "new label"

        s[1]["label"] = label
        self.assertEqual(s[1]["label"], label)

        s[1]["label"] = new_label
        self.assertEqual(s[1]["label"], new_label)

        d.add_sample(s)
        self.assertEqual(s[1]["label"], new_label)

        for f in s:
            self.assertEqual(s[f]["label"], new_label)

        s[1]["label"] = label
        s[1].save()

        for f in s:
            self.assertEqual(s[f]["label"], label)

    def test_frame_number_in_frames(self):
        d = fo.Dataset()
        s = fo.Sample(filepath="video.mp4")
        s[1]["label"] = 1
        self.assertTrue(1 in s.frames)
        self.assertFalse(2 in s.frames)

        d.add_sample(s)
        self.assertTrue(1 in s.frames)
        self.assertFalse(2 in s.frames)

    def test_copy(self):
        sample = fo.Sample("video.mp4")
        sample.frames[1]["label"] = "label"

        sample_copy = sample.copy()

        self.assertEqual(sample_copy.frames[1]["label"], "label")

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        sample_copy = sample.copy()

        self.assertEqual(sample_copy.frames[1]["label"], "label")

    def test_frames_view(self):
        dataset = self._make_dataset()

        sample = dataset.first()
        sample.frames[1]["foo"] = fo.Detections(
            detections=[fo.Detection(label="foo"), fo.Detection(label="bar")]
        )
        sample.save()

        view = dataset.filter_labels("frames.foo", F("label") == "bar")

        detections = dataset.first().frames.first().foo.detections
        self.assertEqual(len(detections), 2)
        self.assertEqual(detections[0].label, "foo")

        detections = view.first().frames.first().foo.detections
        self.assertEqual(len(detections), 1)
        self.assertEqual(detections[0].label, "bar")

        detections = dataset.first().frames.first().foo.detections
        self.assertEqual(len(detections), 2)
        self.assertEqual(detections[0].label, "foo")

    def test_reload(self):
        dataset = self._make_dataset()

        sample = dataset.first()
        sample.frames[1]["foo"] = fo.Detections(
            detections=[fo.Detection(label="foo"), fo.Detection(label="bar")]
        )
        sample.save()

        dataset.filter_labels("frames.foo", F("label") == "foo").save()

        self.assertEqual(len(sample.frames[1].foo.detections), 1)


class SampleFieldTests(unittest.TestCase):
    @drop_datasets
    def test_field_add_delete_in_dataset(self):
        dataset = fo.Dataset()
        id1 = dataset.add_sample(fo.Sample("1.jpg"))
        id2 = dataset.add_sample(fo.Sample("2.jpg"))
        sample1 = dataset[id1]
        sample2 = dataset[id2]

        # redeclaring an existing field is allowed
        dataset.add_sample_field("filepath", fo.StringField)

        # but the types must match
        with self.assertRaises(ValueError):
            dataset.add_sample_field("filepath", fo.IntField)

        # delete default field
        with self.assertRaises(ValueError):
            dataset.delete_sample_field("filepath")

        field_name = "field1"
        ftype = fo.StringField
        wrong_ftype = fo.IntField
        field_test_value = "test_field_value"

        # access non-existent field
        with self.assertRaises(KeyError):
            dataset.get_field_schema()[field_name]

        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(AttributeError):
                sample.get_field(field_name)

            with self.assertRaises(KeyError):
                sample[field_name]

            with self.assertRaises(AttributeError):
                getattr(sample, field_name)

            with self.assertRaises(KeyError):
                sample.to_dict()[field_name]

        # add field (new)
        dataset.add_sample_field(field_name, ftype)
        setattr(sample1, field_name, field_test_value)

        # check field exists and is of correct type
        field = dataset.get_field_schema()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)

        for sample in [sample2, dataset[id2]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is None
            self.assertIsNone(sample.get_field(field_name))
            self.assertIsNone(sample[field_name])
            self.assertIsNone(getattr(sample, field_name))
            self.assertIsNone(sample.to_dict()[field_name])

        # redeclaring an existing field is allowed
        dataset.add_sample_field(field_name, ftype)

        # but the types must match
        with self.assertRaises(ValueError):
            dataset.add_sample_field(field_name, wrong_ftype)

        # delete field
        dataset.delete_sample_field(field_name)

        # access non-existent field
        with self.assertRaises(KeyError):
            dataset.get_field_schema()[field_name]

        for sample in [sample1, sample2, dataset[id1], dataset[id2]]:
            with self.assertRaises(AttributeError):
                sample.get_field(field_name)

            with self.assertRaises(KeyError):
                sample[field_name]

            with self.assertRaises(AttributeError):
                getattr(sample, field_name)

            with self.assertRaises(KeyError):
                sample.to_dict()[field_name]

        # add deleted field with new type
        ftype = fo.IntField
        field_test_value = 51
        dataset.add_sample_field(field_name, ftype)
        setattr(sample1, field_name, field_test_value)

        # check field exists and is of correct type
        field = dataset.get_field_schema()[field_name]
        self.assertIsInstance(field, ftype)
        for sample in [sample1, dataset[id1]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is set correctly
            self.assertEqual(sample.get_field(field_name), field_test_value)
            self.assertEqual(sample[field_name], field_test_value)
            self.assertEqual(getattr(sample, field_name), field_test_value)
            self.assertEqual(sample.to_dict()[field_name], field_test_value)

        for sample in [sample2, dataset[id2]]:
            self.assertIsInstance(field, ftype)
            # check field exists on sample and is None
            self.assertIsNone(sample.get_field(field_name))
            self.assertIsNone(sample[field_name])
            self.assertIsNone(getattr(sample, field_name))
            self.assertIsNone(sample.to_dict()[field_name])

    @drop_datasets
    def test_field_get_set_clear_no_dataset(self):
        filename = "1.jpg"
        tags = ["tag1", "tag2"]
        sample = fo.Sample(filepath=filename, tags=tags)

        # get field (default)
        self.assertEqual(sample.filename, filename)
        self.assertListEqual(sample.tags, tags)
        self.assertIsNone(sample.metadata)

        # get field (invalid)
        with self.assertRaises(AttributeError):
            sample.get_field("invalid_field")

        with self.assertRaises(KeyError):
            sample["invalid_field"]

        with self.assertRaises(AttributeError):
            sample.invalid_field

        # set field (default)
        sample.tags = "invalid type"
        sample.tags = None

        # clear field (default)
        with self.assertRaises(ValueError):
            sample.clear_field("filepath")

        sample.clear_field("tags")
        self.assertListEqual(sample.tags, [])
        sample.clear_field("metadata")
        self.assertIsNone(sample.metadata)

        # set field (new)
        with self.assertRaises(ValueError):
            sample.set_field("field_1", 51, create=False)

        sample.set_field("field_1", 51)
        self.assertIn("field_1", sample.field_names)
        self.assertEqual(sample.get_field("field_1"), 51)
        self.assertEqual(sample["field_1"], 51)
        self.assertEqual(sample.field_1, 51)

        sample["field_2"] = "fiftyone"
        self.assertIn("field_2", sample.field_names)
        self.assertEqual(sample.get_field("field_2"), "fiftyone")
        self.assertEqual(sample["field_2"], "fiftyone")
        self.assertEqual(sample.field_2, "fiftyone")

        # clear field (new)
        sample.clear_field("field_1")
        self.assertNotIn("field_1", sample.field_names)
        with self.assertRaises(AttributeError):
            sample.get_field("field_1")

        with self.assertRaises(KeyError):
            sample["field_1"]

        with self.assertRaises(AttributeError):
            sample.field_1

    @drop_datasets
    def test_field_get_set_clear_in_dataset(self):
        filename = "1.jpg"
        tags = ["tag1", "tag2"]
        sample = fo.Sample(filepath=filename, tags=tags)

        dataset = fo.Dataset()
        dataset.add_sample(sample)
        self.assertTrue(sample.in_dataset)

        # get field (default)
        self.assertEqual(sample.filename, filename)
        self.assertListEqual(sample.tags, tags)
        self.assertIsNone(sample.metadata)

        # get field (invalid)
        with self.assertRaises(AttributeError):
            sample.get_field("invalid_field")

        with self.assertRaises(KeyError):
            sample["invalid_field"]

        with self.assertRaises(AttributeError):
            sample.invalid_field

        # set field (default)
        with self.assertRaises(Exception):
            sample.tags = "invalid type"
            sample.save()

        # clear field (default)
        with self.assertRaises(Exception):
            sample.clear_field("filepath")
            sample.save()

        sample.filepath = filename
        sample.save()

        sample.tags = None
        sample.save()
        self.assertEqual(sample.tags, [])

        sample.clear_field("tags")
        sample.save()
        self.assertListEqual(sample.tags, [])

        sample.clear_field("metadata")
        sample.save()
        self.assertIsNone(sample.metadata)

        # set field (new)
        with self.assertRaises(ValueError):
            sample.set_field("field_1", 51, create=False)
            sample.save()

        sample.set_field("field_1", 51)
        sample.save()
        self.assertIn("field_1", sample.field_names)
        self.assertEqual(sample.get_field("field_1"), 51)
        self.assertEqual(sample["field_1"], 51)
        self.assertEqual(sample.field_1, 51)

        sample["field_2"] = "fiftyone"
        sample.save()
        self.assertIn("field_2", sample.field_names)
        self.assertEqual(sample.get_field("field_2"), "fiftyone")
        self.assertEqual(sample["field_2"], "fiftyone")
        self.assertEqual(sample.field_2, "fiftyone")

        # clear field
        sample.clear_field("field_1")
        sample.save()
        self.assertIsNone(sample["field_1"])

        # delete field
        dataset.delete_sample_field("field_1")

        with self.assertRaises(AttributeError):
            sample.get_field("field_1")

        with self.assertRaises(KeyError):
            sample["field_1"]

        with self.assertRaises(AttributeError):
            sample.field_1

    @drop_datasets
    def test_vector_array_fields(self):
        dataset1 = fo.Dataset()
        dataset2 = fo.Dataset()

        sample1 = fo.Sample(
            filepath="img.png",
            vector_field=np.arange(5),
            array_field=np.ones((2, 3)),
        )
        dataset1.add_sample(sample1)

        sample2 = fo.Sample(filepath="img.png")
        dataset2.add_sample(sample2)
        sample2["vector_field"] = np.arange(5)
        sample2["array_field"] = np.ones((2, 3))
        sample2.save()

        for dataset in [dataset1, dataset2]:
            fields = dataset.get_field_schema()
            self.assertIsInstance(fields["vector_field"], fo.VectorField)
            self.assertIsInstance(fields["array_field"], fo.ArrayField)

    @drop_datasets
    def test_dynamic_fields(self):
        dataset = fo.Dataset()
        sample = fo.Sample(
            filepath="img.png",
            custom_field=fo.DynamicEmbeddedDocument(
                single=fo.Classification(label="single"),
                list=[fo.Classification(label="list")],
            ),
        )
        dataset.add_sample(sample)
        dataset.add_dynamic_sample_fields()

        sample = dataset.first()
        self.assertEqual(sample.custom_field.single.label, "single")
        self.assertEqual(len(sample.custom_field.list), 1)
        self.assertEqual(sample.custom_field.list[0].label, "list")


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
