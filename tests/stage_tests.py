"""
ViewStage tests.

To run a single test, modify the main code to::

    singletest = unittest.TestSuite()
    singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
    unittest.TextTestRunner().run(singletest)

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest


import fiftyone as fo
from fiftyone.core.odm.sample import default_sample_fields
from fiftyone import ViewField as F


class StageTests(unittest.TestCase):
    """Tests for all ViewStages."""

    def setUp(self):
        self.dataset = fo.Dataset()
        self.sample1 = fo.Sample(filepath="test_one.png")
        self.sample2 = fo.Sample(filepath="test_two.png")
        self.dataset.add_sample(self.sample1)
        self.dataset.add_sample(self.sample2)

    def test_exclude(self):
        result = list(self.dataset.exclude([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_exclude_fields(self):
        self.dataset.add_sample_field("exclude_fields_field1", fo.IntField)
        self.dataset.add_sample_field("exclude_fields_field2", fo.IntField)

        for sv in self.dataset.exclude_fields(["exclude_fields_field1"]):
            self.assertIsNone(sv.selected_field_names)
            self.assertSetEqual(
                sv.excluded_field_names, {"exclude_fields_field1"}
            )
            with self.assertRaises(NameError):
                sv.exclude_fields_field1
            self.assertIsNone(sv.exclude_fields_field2)

    def test_exists(self):
        self.sample1["exists"] = True
        self.sample1.save()
        result = list(self.dataset.exists("exists"))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_filter_classifications(self):
        self.sample1["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.9,),
                fo.Classification(label="friend", confidence=0.3,),
                fo.Classification(label="stopper", confidence=0.1,),
                fo.Classification(label="big bro", confidence=0.6,),
            ]
        )
        self.sample1.save()
        self.sample2["test_clfs"] = fo.Classifications(
            classifications=[
                fo.Classification(label="friend", confidence=0.99,),
                fo.Classification(label="tricam", confidence=0.2,),
                fo.Classification(label="hex", confidence=0.8,),
            ]
        )
        self.sample2.save()

        view = self.dataset.filter_classifications(
            "test_clfs", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sv in view:
            for clf in sv.test_clfs.classifications:
                self.assertGreater(clf.confidence, 0.5)
                self.assertEqual(clf.label, "friend")

    def test_filter_detections(self):
        self.sample1["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend",
                    confidence=0.9,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="friend",
                    confidence=0.3,
                    bounding_box=[0.25, 0, 0.5, 0.1],
                ),
                fo.Detection(
                    label="stopper",
                    confidence=0.1,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="big bro",
                    confidence=0.6,
                    bounding_box=[0, 0, 0.1, 0.5],
                ),
            ]
        )
        self.sample1.save()
        self.sample2["test_dets"] = fo.Detections(
            detections=[
                fo.Detection(
                    label="friend", confidence=0.99, bounding_box=[0, 0, 1, 1],
                ),
                fo.Detection(
                    label="tricam",
                    confidence=0.2,
                    bounding_box=[0, 0, 0.5, 0.5],
                ),
                fo.Detection(
                    label="hex",
                    confidence=0.8,
                    bounding_box=[0.35, 0, 0.2, 0.25],
                ),
            ]
        )
        self.sample2.save()

        view = self.dataset.filter_detections(
            "test_dets", (F("confidence") > 0.5) & (F("label") == "friend")
        )

        for sv in view:
            for det in sv.test_dets.detections:
                self.assertGreater(det.confidence, 0.5)
                self.assertEqual(det.label, "friend")

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_tag(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tag("test"))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_match_tags(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tags(["test"]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_re_match(self):
        result = list(self.dataset.match(F("filepath").re_match("two\.png$")))
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

        # case-insentive match
        result = list(
            self.dataset.match(
                F("filepath").re_match("TWO\.PNG$", options="i")
            )
        )
        self.assertIs(len(result), 1)
        self.assertTrue(result[0].filepath.endswith("two.png"))

    def test_mongo(self):
        result = list(self.dataset.mongo([{"$limit": 1}]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select(self):
        result = list(self.dataset.select([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample1.id)

    def test_select_fields(self):
        self.dataset.add_sample_field("select_fields_field", fo.IntField)

        for sv in self.dataset.select_fields():
            self.assertSetEqual(
                sv.selected_field_names, set(default_sample_fields())
            )
            self.assertIsNone(sv.excluded_field_names)
            sv.filepath
            sv.metadata
            sv.tags
            with self.assertRaises(NameError):
                sv.select_fields_field

    def test_skip(self):
        result = list(self.dataset.sort_by("filepath").skip(1))
        self.assertIs(len(result), 1)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_sort_by(self):
        result = list(self.dataset.sort_by("filepath"))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample1.id)
        result = list(self.dataset.sort_by("filepath", reverse=True))
        self.assertIs(len(result), 2)
        self.assertEqual(result[0].id, self.sample2.id)

    def test_take(self):
        result = list(self.dataset.take(1))
        self.assertIs(len(result), 1)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
