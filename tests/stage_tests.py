import unittest


import fiftyone as fo
import fiftyone.core.odm as foo


class StageTests(unittest.TestCase):
    def setUp(self):
        foo.drop_database()
        self.dataset = fo.Dataset("test")
        self.sample1 = fo.Sample(filepath="test_one.png")
        self.sample2 = fo.Sample(filepath="test_two.png")
        self.dataset.add_sample(self.sample1)
        self.dataset.add_sample(self.sample2)

    def test_exclude(self):
        result = list(self.dataset.view().exclude([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample2)

    def test_exists(self):
        self.sample1["exists"] = True
        self.sample1.save()
        result = list(self.dataset.view().exists("exists"))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_limit(self):
        result = list(self.dataset.view().limit(1))
        self.assertIs(len(result), 1)

    def test_match(self):
        self.sample1["value"] = "value"
        self.sample1.save()
        result = list(self.dataset.view().match({"value": "value"}))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_match_tag(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.view().match_tag("test"))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_match_tags(self):
        self.sample1.tags.append("test")
        self.sample1.save()
        result = list(self.dataset.view().match_tags(["test"]))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_select(self):
        result = list(self.dataset.view().select([self.sample1.id]))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample1)

    def test_sort_by(self):
        result = list(self.dataset.view().sort_by("filepath"))
        self.assertIs(len(result), 2)
        self.assertIs(result[0], self.sample1)
        result = list(self.dataset.view().sort_by("filepath", reverse=True))
        self.assertIs(len(result), 2)
        self.assertIs(result[0], self.sample2)

    def test_skip(self):
        result = list(self.dataset.view().sort_by("filepath").skip(1))
        self.assertIs(len(result), 1)
        self.assertIs(result[0], self.sample2)

    def test_take(self):
        result = list(self.dataset.view().take(1))
        self.assertIs(len(result), 1)


if __name__ == "__main__":
    unittest.main()
