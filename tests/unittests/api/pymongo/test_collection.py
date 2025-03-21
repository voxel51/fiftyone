import pytest
import bson
import pymongo
import requests
from unittest.mock import MagicMock, patch
from bson.objectid import ObjectId
from fiftyone.api.pymongo.collection import Collection


@pytest.fixture
def fixture_database():
    """MongoDB database."""
    return MagicMock()


@pytest.fixture
def fixture_sample_collection(fixture_database):
    """Sample collection."""
    collection = Collection(database=fixture_database, name="test_collection")
    collection.__proxy_it__ = MagicMock()
    return collection


@pytest.fixture
def fixture_sample_docs():
    """Sample documents."""
    return [
        {
            "_id": ObjectId(),
            "filepath": f"image{i}.jpg",
            "tags": ["tag1", "tag2"],
        }
        for i in range(1, 5)
    ]


def test_insert_many(fixture_sample_collection, fixture_sample_docs):
    """Test insert_many preserves preassigned _ids."""

    inserted_result = fixture_sample_collection.insert_many(
        fixture_sample_docs
    )

    assert isinstance(inserted_result, pymongo.results.InsertManyResult)
    assert inserted_result.acknowledged is True
    assert len(inserted_result.inserted_ids) == len(fixture_sample_docs)
    for doc in fixture_sample_docs:
        assert doc["_id"] in inserted_result.inserted_ids
    fixture_sample_collection.__proxy_it__.assert_called_once_with(
        "insert_many", (fixture_sample_docs,), {}, is_idempotent=False
    )


def test_insert_many_assigns_ids(
    fixture_sample_collection, fixture_sample_docs
):
    """Test that docs without _ids are assigned new ObjectIds."""

    new_docs = []
    for doc in fixture_sample_docs:
        new_doc = doc.copy()
        new_doc.pop("_id")
        new_docs.append(new_doc)

    inserted_result = fixture_sample_collection.insert_many(new_docs)

    fixture_sample_collection.__proxy_it__.assert_called_once_with(
        "insert_many", (new_docs,), {}, is_idempotent=False
    )
    assert isinstance(inserted_result, pymongo.results.InsertManyResult)
    assert inserted_result.acknowledged is True
    assert len(inserted_result.inserted_ids) == len(new_docs)
    for doc in new_docs:
        assert isinstance(doc["_id"], ObjectId)


def test_insert_many_handles_empty_input(fixture_sample_collection):
    """Test insert_many with an empty list does nothing."""
    inserted_result = fixture_sample_collection.insert_many([])

    assert isinstance(inserted_result, pymongo.results.InsertManyResult)
    assert inserted_result.inserted_ids == []
    fixture_sample_collection.__proxy_it__.assert_not_called()


def test_insert_many_handles_timeout(
    fixture_sample_collection, fixture_sample_docs
):
    """Test that a ReadTimeout logs a warning and returns ids."""
    fixture_sample_collection.__proxy_it__.side_effect = (
        requests.exceptions.ReadTimeout()
    )

    with patch("logging.warning") as mock_warning, patch(
        "logging.debug"
    ) as mock_debug:
        inserted_result = fixture_sample_collection.insert_many(
            fixture_sample_docs
        )

        mock_warning.assert_called_once()
        mock_debug.assert_called_once()
        assert len(inserted_result.inserted_ids) == len(fixture_sample_docs)
        for doc in fixture_sample_docs:
            assert doc["_id"] in inserted_result.inserted_ids
