"""
Factory for mapping backends
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Callable, Dict, List, Optional, Type, TypeVar, Union

import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt
import fiftyone.core.sample as fos

T = TypeVar("T")
R = TypeVar("R")


class MapperFactory:
    """Manage mapper implementations"""

    __MAPPER_CLASSES: Dict[str, Type[fomm.Mapper]] = {
        "process": fomp.ProcessMapper,
        "thread": fomt.ThreadMapper,
    }

    __DEFAULT_KEY = "process"

    @classmethod
    def available(cls) -> List[str]:
        """Get available mapper class keys"""
        return sorted([k for k, _ in cls.__MAPPER_CLASSES.items()])

    @classmethod
    def default(cls) -> str:
        """Get default mapper class key"""
        # Using method to get default to allow for programmatic way to
        # determine default.
        return cls.__DEFAULT_KEY

    @classmethod
    def get(cls, key: str) -> Union[Type[fomm.Mapper], None]:
        """Get mapper class"""
        return cls.__MAPPER_CLASSES.get(key)

    @classmethod
    def key(cls, mapper_cls: Type[fomm.Mapper]) -> Union[str, None]:
        """Get key for mapper class"""
        return next(
            (
                key
                for key, value in cls.__MAPPER_CLASSES.items()
                if value == mapper_cls
            ),
            None,
        )

    @classmethod
    def create(
        cls,
        key: Optional[str],
        sample_collection: fomm.SampleCollection[T],
        workers: Optional[int],
        map_fcn: Callable[[T], R],
        batch_method: Optional[str] = None,
        **mapper_extra_kwargs,
    ) -> fomm.Mapper:
        """Create a mapper instance"""

        if workers is None:
            cfg = focc.load_config()
            workers = cfg.default_map_workers

        if batch_method is not None and batch_method not in (
            batch_methods := fomb.SampleBatcher.available()
        ):
            raise ValueError(
                f"Invalid `batch_method`: {batch_method}. "
                f"Choose from: {', '.join(batch_methods)}"
            )

        if key is None:
            key = cls.default()

        if key not in cls.__MAPPER_CLASSES:
            raise ValueError(f"Could not create mapper for: '{key}'")

        # check here if the map fcn returns a sample and raise if it do
        if cls.__check_if_return_is_sample(sample_collection, map_fcn):
            raise ValueError(
                "The map function must not return a Sample object"
            )

        return cls.__MAPPER_CLASSES[key](
            sample_collection, workers, batch_method, **mapper_extra_kwargs
        )

    @classmethod
    def __check_if_return_is_sample(
        cls,
        sample_collection: fomm.SampleCollection[T],
        map_fcn: Callable[[T], R],
    ) -> bool:
        """
        Check if the map function returns a sample and raise if it does not
        """

        first_sample = sample_collection.first()
        if first_sample is None:
            raise ValueError("Sample collection is empty")

        # make a copy outside of the db
        sample_copy = first_sample.copy()

        # run the map function on just the copy
        # if it returns a Sample object, raise
        if isinstance(map_fcn(sample_copy), fos.Sample):
            return True

        return False
