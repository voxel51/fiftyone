"""
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

import multiprocessing
from unittest import mock

import pytest

import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.factory as fomf
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt


@pytest.fixture(name="config", autouse=True)
def patch_load_config():
    """patch load config"""
    with mock.patch.object(focc, "load_config") as load_config:
        config = load_config.return_value = mock.Mock()
        config.default_parallelization_method = None
        yield config


@pytest.fixture(name="process_mapper_cls")
def fixture_process_mapper_cls():
    """mock process mapper"""

    return mock.create_autospec(fomp.ProcessMapper)


@pytest.fixture(name="thread_mapper_cls")
def fixture_thread_mapper_cls():
    """mock process mapper"""

    return mock.create_autospec(fomt.ThreadMapper)


@pytest.fixture(name="id_batcher")
def fixture_id_batcher():
    """mock id batcher"""

    return mock.create_autospec(fomb.SampleIdBatch)


@pytest.fixture(name="slice_batcher")
def fixture_slice_batcher():
    """mock slice batcher"""

    return mock.create_autospec(fomb.SampleSliceBatch)


@pytest.fixture(name="default_batcher")
def fixture_default_batcher(id_batcher):
    """mock default batcher"""

    return id_batcher


@pytest.fixture(autouse=True)
def fixture_mapper_factory(
    process_mapper_cls, thread_mapper_cls, id_batcher, slice_batcher
):
    """patch mapper factory"""

    with mock.patch.object(
        fomf.MapperFactory, "_MAPPERS", {}
    ) as mappers, mock.patch.object(
        fomf.MapperFactory, "_BATCHERS", {}
    ) as batchers:
        mappers["process"] = process_mapper_cls
        mappers["thread"] = thread_mapper_cls

        batchers["id"] = id_batcher
        batchers["slice"] = slice_batcher

        yield


class TestCreate:
    """Test method for creating mapper"""

    @pytest.fixture(name="process_mapper_cls")
    def patch_process_mapper_cls(self):
        """patch process mapper cls"""

        with mock.patch.object(fomp.ProcessMapper, "__init__") as constructor:
            constructor.return_value = None
            yield constructor

    class TestBatchMethod:
        """test batch method related code paths"""

        def test_invalid(self):
            """test invalid batch method"""
            with pytest.raises(ValueError):
                #####
                fomf.MapperFactory.create(
                    mapper_key=mock.Mock(),
                    workers=mock.Mock(),
                    batch_method="unknown",
                    **mock.create_autospec(dict),
                )
                #####

        @pytest.mark.parametrize("batch_method", ("id", "slice", None))
        def test_valid(
            self,
            config,
            batch_method,
            id_batcher,
            slice_batcher,
            thread_mapper_cls,
        ):
            """test valid batch methods"""

            expected_batcher = None
            if batch_method in ("id", None):
                expected_batcher = id_batcher
            elif batch_method == "slice":
                expected_batcher = slice_batcher

            key = "thread"
            expected_mapper_cls = thread_mapper_cls

            #####
            result = fomf.MapperFactory.create(
                key,
                workers := 1,
                batch_method=batch_method,
                **(kwargs := mock.create_autospec(dict)),
            )
            #####

            expected_mapper_cls.create.assert_called_once_with(
                config=config,
                batcher=expected_batcher,
                workers=workers,
                **kwargs,
            )

            assert result == expected_mapper_cls.create.return_value

    class TestKey:
        """test key related code paths"""

        def test_invalid(self):
            """Test invalid key"""

            with pytest.raises(ValueError):
                #####
                fomf.MapperFactory.create(
                    mapper_key="unknown",
                    workers=mock.Mock(),
                    batch_method=mock.Mock(),
                    **mock.create_autospec(dict),
                )
                #####

        @pytest.mark.parametrize("key", ("process", "thread"))
        @pytest.mark.parametrize(
            "from_config",
            (
                pytest.param(False, id="as_argument"),
                pytest.param(True, id="from_config"),
            ),
        )
        def test_explicit_mapper(
            self,
            key,
            from_config,
            config,
            process_mapper_cls,
            thread_mapper_cls,
            default_batcher,
        ):
            """test create with explicit mapper key"""

            if from_config:
                config.default_parallelization_method = key

            mapper_classes = [process_mapper_cls, thread_mapper_cls]
            expected_mapper_cls = None
            if key == "process":
                expected_mapper_cls = process_mapper_cls
            elif key == "thread":
                expected_mapper_cls = thread_mapper_cls

            #####
            result = fomf.MapperFactory.create(
                key if not from_config else None,
                workers := mock.Mock(),
                **(kwargs := mock.create_autospec(dict)),
            )
            #####

            for mapper_cls in mapper_classes:
                if mapper_cls is not expected_mapper_cls:
                    assert not mapper_cls.create.called

            expected_mapper_cls.create.assert_called_once_with(
                config=config,
                batcher=default_batcher,
                workers=workers,
                **kwargs,
            )

            assert result == expected_mapper_cls.create.return_value

        class TestDefaultMapper:
            """test inferred mapper"""

            @pytest.fixture(name="current_process", autouse=True)
            def patch_multiprocessing(self):
                """patch multiprocessing"""
                with mock.patch.object(
                    multiprocessing, "current_process"
                ) as m:
                    yield m

            def test_use_multiprocessing(
                self,
                current_process,
                config,
                process_mapper_cls,
                thread_mapper_cls,
                default_batcher,
            ):
                """test create with no mapper key"""
                current_process.return_value.daemon = False

                #####
                result = fomf.MapperFactory.create(
                    None,
                    workers := mock.Mock(),
                    **(kwargs := mock.create_autospec(dict)),
                )
                #####

                assert not thread_mapper_cls.called
                process_mapper_cls.create.assert_called_once_with(
                    config=config,
                    batcher=default_batcher,
                    workers=workers,
                    **kwargs,
                )

                assert result == process_mapper_cls.create.return_value

            def test_use_threading(
                self,
                current_process,
                config,
                process_mapper_cls,
                thread_mapper_cls,
                default_batcher,
            ):
                """test create with no mapper key"""
                current_process.return_value.daemon = True

                #####
                result = fomf.MapperFactory.create(
                    None,
                    workers := mock.Mock(),
                    **(kwargs := mock.create_autospec(dict)),
                )
                #####

                assert not process_mapper_cls.called
                thread_mapper_cls.create.assert_called_once_with(
                    config=config,
                    batcher=default_batcher,
                    workers=workers,
                    **kwargs,
                )

                assert result == thread_mapper_cls.create.return_value


class TestConfigDefaultMethod:
    """Test config handling for parallelize_method"""

    def test_use_config_parallelize_method(self):
        """Test using default_map_samples_method from config when parallelize_method is None"""

        config_method = "thread"  # Use thread as the config value

        with mock.patch.object(focc, "load_config") as load_config:
            config = load_config.return_value
            # Set the config to use thread as default method
            config.default_map_samples_method = config_method

            # Mock the default_parallelization_method property access
            type(config).default_parallelization_method = mock.PropertyMock(
                return_value=config_method
            )

            # Call create with None as mapper_key
            result = fomf.MapperFactory.create(
                mapper_key=None,
                workers=2,
                batch_method="id",
            )

            # Check that ThreadMapper.create was called
            assert fomf.MapperFactory._MAPPERS["thread"].create.called
            assert (
                result
                == fomf.MapperFactory._MAPPERS["thread"].create.return_value
            )

        # If key is passed, use the value from key
        mapper_key = "process"

        with mock.patch.object(focc, "load_config") as load_config:
            config = load_config.return_value
            # Set the config to use thread as default method
            config.default_map_samples_method = config_method

            # Mock the default_parallelization_method property access
            type(config).default_parallelization_method = mock.PropertyMock(
                return_value=config_method
            )

            # Call create with explicit mapper_key
            result = fomf.MapperFactory.create(
                mapper_key=mapper_key,
                workers=2,
                batch_method="id",
            )

            # Check that ProcessMapper.create was called
            assert fomf.MapperFactory._MAPPERS["process"].create.called
            assert (
                result
                == fomf.MapperFactory._MAPPERS["process"].create.return_value
            )

    def test_fallback_to_default_when_config_none(self):
        """Test fallback to default method when both parameter and config value are None"""

        # Default to process when config value is None
        with mock.patch.object(
            focc, "load_config"
        ) as load_config, mock.patch.object(
            fomp, "check_multiprocessing_support", return_value=True
        ):

            config = load_config.return_value
            # Set the config value to None
            config.default_map_samples_method = None

            # Mock the default_parallelization_method property access
            type(config).default_parallelization_method = mock.PropertyMock(
                return_value=None
            )

            # Call create with None as mapper_key
            result = fomf.MapperFactory.create(
                mapper_key=None,
                workers=2,
                batch_method="id",
            )

            # Should use ProcessMapper since check_multiprocessing_support returns True
            assert fomf.MapperFactory._MAPPERS["process"].create.called
            assert (
                result
                == fomf.MapperFactory._MAPPERS["process"].create.return_value
            )
