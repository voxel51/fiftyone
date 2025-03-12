"""
Factory for mapping backends
| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

from typing import Dict, List, Optional, TypeVar, Type, Union


import fiftyone.core.config as focc
import fiftyone.core.map.batcher as fomb
import fiftyone.core.map.mapper as fomm
import fiftyone.core.map.process as fomp
import fiftyone.core.map.threading as fomt

T = TypeVar("T")


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
    def create(
        cls,
        key: Optional[str],
        sample_collection: fomm.SampleCollection[T],
        workers: Optional[int],
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

        return cls.__MAPPER_CLASSES[key](
            sample_collection, workers, batch_method, **mapper_extra_kwargs
        )
