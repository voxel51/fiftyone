"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

import pytest

import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.factory as fomf


@pytest.mark.parametrize(
    ("mapper_class_key", "expected_mapper_cls"),
    [
        pytest.param(
            None,
            fomf.MapperFactory.get(fomf.MapperFactory.default()),
            id="no-key-provided",
        ),
        *[
            pytest.param(key, fomf.MapperFactory.get(key), id=key)
            for key in fomf.MapperFactory.available()
        ],
    ],
)
class TestCreate:
    """Test method for creating mapper"""

    @pytest.mark.usefixtures("expected_mapper_cls")
    def test_invalid_batch_method(self, mapper_class_key):
        """Test invalid batch method"""

        with pytest.raises(ValueError):
            #####
            fomf.MapperFactory.create(
                key=mapper_class_key,
                sample_collection=mock.Mock(),
                workers=mock.Mock(),
                batch_method=mock.Mock(),
                **mock.create_autospec(dict),
            )
            #####

    def test_use_worker_default(self, mapper_class_key, expected_mapper_cls):
        """Test happy path with work default"""

        default_workers = mock.create_autospec(int)

        with mock.patch.object(
            expected_mapper_cls, "__init__"
        ) as init, mock.patch.object(focc, "load_config") as load_config:
            init.return_value = None
            load_config.return_value.default_map_workers = default_workers

            #####
            result = fomf.MapperFactory.create(
                mapper_class_key,
                sample_collection := mock.Mock(),
                None,
                batch_method := fomb.SampleBatcher().default(),
                **(kwargs := mock.create_autospec(dict)),
            )
            #####

            load_config.assert_called_once()
            init.assert_called_once_with(
                sample_collection, default_workers, batch_method, **kwargs
            )

            assert isinstance(result, expected_mapper_cls)

    def test_ok(self, mapper_class_key, expected_mapper_cls):
        """Test happy path"""

        with mock.patch.object(expected_mapper_cls, "__init__") as init:
            init.return_value = None

            #####
            result = fomf.MapperFactory.create(
                mapper_class_key,
                sample_collection := mock.Mock(),
                workers := mock.Mock(),
                batch_method := fomb.SampleBatcher().default(),
                **(kwargs := mock.create_autospec(dict)),
            )
            #####

            init.assert_called_once_with(
                sample_collection, workers, batch_method, **kwargs
            )

            assert isinstance(result, expected_mapper_cls)


class TestConfigDefaultMethod:
    """Test config handling for parallelize_method"""

    def test_use_config_parallelize_method(self):
        """Test using default_map_samples_method from config when parallelize_method is None"""

        config_method = "thread"  # Use thread as the config value
        expected_mapper_cls = fomf.MapperFactory.get(config_method)

        # If key is not passed, use the default from config
        with mock.patch.object(
            expected_mapper_cls, "__init__"
        ) as init, mock.patch.object(focc, "load_config") as load_config:
            init.return_value = None
            load_config.return_value.default_map_samples_method = config_method

            # Call create with None as parallelize_method (key)
            result = fomf.MapperFactory.create(
                key=None,
                sample_collection=mock.Mock(),
                workers=2,
                batch_method=fomb.SampleBatcher().default(),
            )

            load_config.assert_called_once()
            init.assert_called_once()
            assert isinstance(result, expected_mapper_cls)

        # If key is passed, use the value from key
        key = "process"
        expected_mapper_cls = fomf.MapperFactory.get(key)
        with mock.patch.object(
            expected_mapper_cls, "__init__"
        ) as init, mock.patch.object(focc, "load_config") as load_config:
            init.return_value = None
            load_config.return_value.default_map_samples_method = config_method

            # Call create with None as parallelize_method (key)
            result = fomf.MapperFactory.create(
                key=key,
                sample_collection=mock.Mock(),
                workers=2,
                batch_method=fomb.SampleBatcher().default(),
            )

            assert isinstance(result, expected_mapper_cls)

    def test_fallback_to_default_when_config_none(self):
        """Test fallback to default method when both parameter and config value are None"""

        # Get the default implementation from factory
        default_method = fomf.MapperFactory.default()
        expected_mapper_cls = fomf.MapperFactory.get(default_method)

        with mock.patch.object(
            expected_mapper_cls, "__init__"
        ) as init, mock.patch.object(focc, "load_config") as load_config:
            init.return_value = None
            # Set config value to None
            load_config.return_value.default_map_samples_method = None

            # Call create with None as parallelize_method (key)
            result = fomf.MapperFactory.create(
                key=None,
                sample_collection=mock.Mock(),
                workers=2,
                batch_method=fomb.SampleBatcher().default(),
            )

            load_config.assert_called_once()
            init.assert_called_once()
            assert isinstance(result, expected_mapper_cls)
