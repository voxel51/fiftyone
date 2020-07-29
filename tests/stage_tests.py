"""
ViewStage tests

To run a single test, modify the main code to:

```
singletest = unittest.TestSuite()
singletest.addTest(TESTCASE("<TEST METHOD NAME>"))
unittest.TextTestRunner().run(singletest)
```

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest


import fiftyone as fo


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
        self.assertIs(result[0], self.sample2)

    def test_exists(self):
        self.sample1["exists"] = True
        self.sample1.save()
        result = list(self.dataset.exists("exists"))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_limit(self):
        result = list(self.dataset.limit(1))
        self.assertIs(len(result), 1)

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_match_tag(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tag("test"))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_match_tags(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.match_tags(["test"]))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_select(self):
        result = list(self.dataset.select([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_sort_by(self):
        result = list(self.dataset.sort_by("filepath"))
        self.assertIs(len(result), 2)
        self.assertIs(result[0], self.sample1)
        result = list(self.dataset.sort_by("filepath", reverse=True))
        self.assertIs(len(result), 2)
        self.assertIs(result[0], self.sample2)

    def test_skip(self):
        result = list(self.dataset.sort_by("filepath").skip(1))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample2)

    def test_take(self):
        result = list(self.dataset.take(1))
        self.assertIs(len(result), 1)


if __name__ == "__main__":
    fo.config.show_progress_bars = False
    unittest.main(verbosity=2)
