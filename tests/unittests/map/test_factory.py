"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from unittest import mock

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
                map_fcn=mock.Mock(),
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
                sample_collection,
                default_workers,
                batch_method,
                **kwargs,
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
