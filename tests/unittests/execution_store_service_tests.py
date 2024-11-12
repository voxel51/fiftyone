"""
FiftyOne execution store related unit tests.

| Copyright 2017-2024, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import pytest

import fiftyone as fo
from fiftyone.operators.store import ExecutionStoreService

from decorators import drop_stores, drop_datasets


@pytest.fixture
def svc():
    return ExecutionStoreService()


@pytest.fixture
def svc_with_dataset():
    dataset = fo.Dataset(name="test_dataset")
    dataset.save()
    yield ExecutionStoreService(dataset_id=dataset._doc.id)


@drop_stores
@drop_datasets
def test_store_creation(svc):
    NAME = "test_store"
    created_store = svc.create_store(NAME)

    assert (
        created_store.store_name == NAME
    ), "Store name should match the given name"
    assert (
        created_store.dataset_id is None
    ), "Dataset ID should be None when not provided"
    assert svc.count_stores() == 1, "Store count should be 1"


@drop_stores
@drop_datasets
def test_store_creation_with_dataset(svc_with_dataset):
    NAME = "test_store"
    created_store = svc_with_dataset.create_store(NAME)

    assert (
        created_store.store_name == NAME
    ), "Store name should match the given name"
    assert (
        created_store.dataset_id is not None
    ), "Dataset ID should be set when provided"
    assert svc_with_dataset.count_stores() == 1, "Store count should be 1"


@drop_stores
@drop_datasets
def test_store_creation_with_metadata(svc):
    NAME = "test_store"
    METADATA = {"test": "value"}
    svc.create_store(NAME, metadata=METADATA)
    created_store = svc.get_store(NAME)

    assert (
        created_store.store_name == NAME
    ), "Store name should match the given name"
    assert (
        created_store.metadata == METADATA
    ), "Metadata should match the provided metadata"
    assert svc.count_stores() == 1, "Store count should be 1"


@drop_stores
@drop_datasets
def test_set_get_key(svc):
    NAME = "test_store"
    KEY = "test_key"
    VALUE = "test_value"

    svc.set_key(NAME, KEY, VALUE)
    assert (
        svc.count_keys(NAME) == 1
    ), "Store should have 1 key after setting it"
    assert (
        svc.get_key(NAME, KEY).value == VALUE
    ), "Retrieved value should match the set value"


@drop_stores
@drop_datasets
def test_list_global_stores(svc, svc_with_dataset):
    NO_DATASET_STORE_NAME = "dataset_less_store"
    DATASET_STORE_NAME = "dataset_store"
    KEY_ONLY_STORE_NAME = "key_only_store"

    svc.create_store(NO_DATASET_STORE_NAME)
    svc_with_dataset.create_store(DATASET_STORE_NAME)
    svc_with_dataset.set_key(DATASET_STORE_NAME, "key", "value")
    svc_with_dataset.set_key(KEY_ONLY_STORE_NAME, "key", "value")

    global_list = svc.list_stores_global()
    store_names = [store.store_name for store in global_list]
    dataset_ids = [store.dataset_id for store in global_list]
    assert len(global_list) == 3
    assert NO_DATASET_STORE_NAME in store_names
    assert DATASET_STORE_NAME in store_names
    assert KEY_ONLY_STORE_NAME in store_names
    assert None in dataset_ids
    assert svc_with_dataset._dataset_id in dataset_ids


@drop_stores
@drop_datasets
def test_has_store(svc, svc_with_dataset):
    NAME = "test_store"
    KEY = "key1"
    svc.set_key(NAME, KEY, "value1")
    assert svc.has_store(NAME)
    assert svc.has_store("nonexistent") is False
    assert svc_with_dataset.has_store(NAME) is False


@drop_stores
@drop_datasets
def test_has_key(svc, svc_with_dataset):
    NAME = "test_store"
    KEY = "key1"
    svc.set_key(NAME, KEY, "value1")
    assert svc.has_key(NAME, KEY)
    assert svc.has_key(NAME, "nonexistent") is False
    assert svc_with_dataset.has_key(NAME, KEY) is False


@drop_stores
@drop_datasets
def test_get_key(svc):
    NAME = "test_store"
    KEY = "key1"
    svc.set_key(NAME, KEY, "value1")
    key_doc = svc.get_key(NAME, KEY)
    assert key_doc.value == "value1"
    assert svc.get_key(NAME, "nonexistent") is None


@drop_stores
@drop_datasets
def test_get_store_with_only_keys(svc):
    NAME = "test_store"
    KEY = "key1"
    svc.set_key(NAME, KEY, "value1")
    store = svc.get_store(NAME)
    assert store.store_name == NAME
    key_doc = svc.get_key(NAME, KEY)
    assert key_doc.value == "value1"


@drop_stores
@drop_datasets
def test_scoping(svc, svc_with_dataset):
    NAME = "test_store"
    KEY = "test_key"
    VALUE = "test_value"
    svc.set_key(NAME, KEY, VALUE)
    svc_with_dataset.set_key(NAME, KEY, VALUE)
    global_list = svc.list_stores_global()
    global_names = [store.store_name for store in global_list]
    assert global_names == [NAME, NAME], "Global store should be listed"
    assert svc.count_keys(NAME) == 1, "Global store should have 1 key"
    assert (
        svc_with_dataset.count_keys(NAME) == 1
    ), "Dataset store should have 1 key"
    svc_with_dataset.delete_store(NAME)
    assert svc.count_keys(NAME) == 1, "Global store should still have 1 key"
    assert (
        svc_with_dataset.count_keys(NAME) == 0
    ), "Dataset store should have 0 keys"
    svc.delete_store(NAME)
    assert svc.count_keys(NAME) == 0, "Global store should have 0 keys"
    global_list = svc.list_stores_global()
    assert NAME not in global_list, "Global store should not be listed"


@drop_datasets
@drop_stores
def test_set_key_with_ttl(svc):
    NAME = "test_store"
    KEY = "ttl_key"
    VALUE = "value"
    TTL = 100
    svc.set_key(NAME, KEY, VALUE, ttl=TTL)
    key_doc = svc.get_key(NAME, KEY)
    assert key_doc.value == VALUE
    assert key_doc.expires_at is not None


@drop_datasets
@drop_stores
def test_set_key_with_ttl_and_update(svc):
    NAME = "test_store"
    KEY = "ttl_key"
    VALUE = "value"
    TTL = 100
    UPDATED_TTL = 200
    svc.set_key(NAME, KEY, VALUE, ttl=TTL)
    key_doc = svc.get_key(NAME, KEY)
    original_expiry = key_doc.expires_at
    assert key_doc.value == VALUE
    svc.update_ttl(NAME, KEY, UPDATED_TTL)
    updated_key_doc = svc.get_key(NAME, KEY)
    assert updated_key_doc.expires_at > original_expiry


@drop_datasets
@drop_stores
def test_set_key_with_dict_value(svc):
    NAME = "test_store"
    KEY = "dict_key"
    VALUE = {"key": "value"}
    svc.set_key(NAME, KEY, VALUE)
    key_doc = svc.get_key(NAME, KEY)
    assert key_doc.value == VALUE


@drop_datasets
@drop_stores
def test_count_stores(svc, svc_with_dataset):
    assert svc.count_stores() == 0
    assert svc.count_stores_global() == 0

    svc.create_store("store_a")
    svc.create_store("store_b")
    assert svc.count_stores() == 2
    assert svc.count_stores_global() == 2

    assert svc_with_dataset.count_stores() == 0

    svc_with_dataset.create_store("store_c")
    assert svc_with_dataset.count_stores() == 1
    assert svc.count_stores() == 2  # global count should still be 2
    assert svc.count_stores_global() == 3  # total across contexts should be 3

    svc.set_key("store_x", "key_a", "value")
    assert svc.count_stores() == 3
    assert svc.count_stores_global() == 4


@drop_datasets
@drop_stores
def test_cleanup(svc, svc_with_dataset):
    A_STORE_NAME = "store_a"
    B_STORE_NAME = "store_b"

    KEY_B = "key_b"
    svc.create_store(A_STORE_NAME)
    svc_with_dataset.set_key(B_STORE_NAME, KEY_B, "value_b")
    svc.cleanup()
    assert svc.has_store(A_STORE_NAME) is False
    assert svc_with_dataset.has_store(B_STORE_NAME) is True
    assert svc.count_stores() == 0
    assert svc_with_dataset.count_stores() == 1
    svc_with_dataset.cleanup()
    assert svc_with_dataset.has_store(B_STORE_NAME) is False
