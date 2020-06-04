import unittest


import fiftyone as fo
import fiftyone.core.odm as foo


class StageTests(unittest.TestCase):
    def setUp(self):
        foo.drop_database()
        self.dataset = fo.Dataset("test")
        self.sample1 = fo.Sample(filepath="test1.png")
        self.sample2 = fo.Sample(filepath="test2.png")
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


if __name__ == "__main__":
    unittest.main()
