"""
FiftyOne odm unit tests.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import unittest

import mongoengine

from fiftyone.core.odm import fields


class TestDocument(mongoengine.Document):
    __test__ = False
    file = fields.SharedFileField()


class TestSharedFileField(unittest.TestCase):
    content = b"Hello, world"
    content_type = "application/text"

    def _delete_file_and_assert(self, doc):
        doc.file.delete()
        self.assertFalse(doc.file)
        self.assertIsNone(doc.file.grid_id)
        self.assertIsNone(doc.file.gridout)

    def test_simple(self):
        """Retains simple put-delete functionality as FileField"""
        doc = TestDocument()
        doc.file.put(self.content, content_type=self.content_type)
        grid_id = doc.file.grid_id

        self.assertEqual(doc.file.read(), self.content)
        self._delete_file_and_assert(doc)

        self.assertFalse(doc.file.fs.exists(grid_id))

    def test_copy_from(self):
        """Test new copy_from() function shares file pointer"""
        doc1 = TestDocument()
        doc2 = TestDocument()

        # Put something to the file
        doc1.file.put(self.content, content_type=self.content_type)
        self.assertEqual(doc1.file.content_type, self.content_type)
        self.assertEqual(doc1.file.reference_count, 1)
        grid_id = doc1.file.grid_id

        # Use new copy_from() method to update ref count only
        doc2.file.copy_from(doc1.file)
        self.assertEqual(doc2.file.content_type, self.content_type)
        self.assertEqual(doc2.file.reference_count, 2)
        self.assertEqual(doc1.file.read(), self.content)
        self.assertEqual(doc2.file.read(), self.content)
        self.assertEqual(doc1.file.grid_id, doc2.file.grid_id)

        # "Delete" file in doc1 but file isn't actually deleted since its
        #   still referenced by doc2
        self._delete_file_and_assert(doc1)
        self.assertTrue(doc2.file.fs.exists(grid_id))
        doc2.file.seek(0)
        self.assertEqual(doc2.file.read(), self.content)

        # Note we can't assert doc2.file.reference_count here because it won't
        #   auto-update to 1, as the object is cached.

        # Now really delete the file by deleting final reference
        self._delete_file_and_assert(doc2)
        self.assertFalse(doc2.file.fs.exists(grid_id))

    def test_no_write_funcs(self):
        """write() and friends are not allowed"""
        doc = TestDocument()

        self.assertRaises(RuntimeError, doc.file.write)
        self.assertRaises(RuntimeError, doc.file.writelines)
        self.assertRaises(RuntimeError, doc.file.new_file)

    def test_no_repeated_put(self):
        """Can't put() multiple files"""
        doc = TestDocument()

        doc.file.put(self.content, content_type=self.content_type)
        grid_id = doc.file.grid_id
        self.assertRaises(mongoengine.GridFSError, doc.file.put, self.content)
        doc.file.replace(self.content + b"!")
        self.assertNotEqual(grid_id, doc.file.grid_id)
        self.assertFalse(doc.file.fs.exists(grid_id))
        self._delete_file_and_assert(doc)

    def test_shared_doc_replace(self):
        doc1 = TestDocument()
        doc2 = TestDocument()

        # Setup
        doc1.file.put(self.content, content_type=self.content_type)
        grid_id = doc1.file.grid_id
        doc2.file.copy_from(doc1.file)

        # Replace with something else
        doc1.file.replace(self.content + b"!")
        self.assertNotEqual(doc1.file.grid_id, grid_id)
        self.assertTrue(doc2.file.fs.exists(grid_id))
        self.assertEqual(doc2.file.read(), self.content)
        self.assertEqual(doc1.file.read(), self.content + b"!")

        self._delete_file_and_assert(doc1)
        self._delete_file_and_assert(doc2)

    def test_delete_no_reference_count_to_begin(self):
        """Test that if there's no reference count stored initially, it will
        still work properly when copy_from is not called
        """
        doc1 = TestDocument()

        # Put data without a reference count field
        file_proxy = doc1.file
        # pylint: disable-next=bad-super-call
        super(type(file_proxy), file_proxy).put(
            self.content, content_type=self.content_type
        )
        grid_id = file_proxy.grid_id

        self.assertRaises(
            AttributeError, doc1.file.__getattr__, "reference_count"
        )
        self._delete_file_and_assert(doc1)
        self.assertFalse(file_proxy.fs.exists(grid_id))

    def test_copy_from_no_reference_count_to_begin(self):
        """Test that if there's no reference count stored initially, it will
        still work properly when copy_from *is* called
        """
        doc1 = TestDocument()
        doc2 = TestDocument()

        # Put data without a reference count field
        file_proxy = doc1.file
        # pylint: disable-next=bad-super-call
        super(type(file_proxy), file_proxy).put(
            self.content, content_type=self.content_type
        )
        grid_id = file_proxy.grid_id

        self.assertRaises(
            AttributeError, doc1.file.__getattr__, "reference_count"
        )

        doc2.file.copy_from(doc1.file)
        self.assertEqual(doc2.file.content_type, self.content_type)
        self.assertEqual(doc2.file.reference_count, 2)
        self.assertEqual(doc1.file.read(), self.content)
        self.assertEqual(doc2.file.read(), self.content)
        self.assertEqual(doc1.file.grid_id, doc2.file.grid_id)

        self._delete_file_and_assert(doc1)
        self.assertTrue(file_proxy.fs.exists(grid_id))

        self._delete_file_and_assert(doc2)
        self.assertFalse(file_proxy.fs.exists(grid_id))
