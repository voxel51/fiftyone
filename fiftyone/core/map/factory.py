"""
Factory for mapping backends
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from enum import Enum
from typing import Dict, List, Optional, TypeVar, Type, Union


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt

T = TypeVar("T")


class MapImplementation:
    PROCESS = "process"
    THREAD = "thread"


class MapperFactory:
    """Manage mapper implementations"""

    __MAPPER_CLASSES: Dict[str, Type[fomm.Mapper]] = {
        MapImplementation.PROCESS: fomp.ProcessMapper,
        MapImplementation.THREAD: fomt.ThreadMapper,
    }

    __DEFAULT_KEY = MapImplementation.PROCESS

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
        batch_method: Optional[str] = None,
        **mapper_extra_kwargs,
    ) -> fomm.Mapper:
        """Create a mapper instance"""
        cfg = focc.load_config()

        if workers is None:
            workers = cfg.default_map_workers

        if batch_method is not None and batch_method not in (
            batch_methods := fomb.SampleBatcher.available()
        ):
            raise ValueError(
                f"Invalid `batch_method`: {batch_method}. "
                f"Choose from: {', '.join(batch_methods)}"
            )

        # If batch_method is not provided, use the default from config
        key = key or cfg.default_map_samples_method

        if key is None:
            key = cls.default()

        if key not in cls.__MAPPER_CLASSES:
            raise ValueError(f"Could not create mapper for: '{key}'")

        # Check if the current environment supports multiprocessing, if not use threading
        if (
            key == MapImplementation.PROCESS
            and not fomp.check_multiprocessing_support()
        ):
            key = MapImplementation.THREAD

        return cls.__MAPPER_CLASSES[key](
            sample_collection, workers, batch_method, **mapper_extra_kwargs
        )
