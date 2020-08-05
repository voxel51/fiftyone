"""
FiftyOne singleton metaclasses.

| Copyright 2017-2020, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import weakref


class DatasetSingleton(type):
    """Singleton metadata for :class:`fiftyone.core.dataset.Dataset`.

    Datasets are singletons keyed on unique dataset ``name``. This metaclass
    keeps a dictionary of weak references to instances keyed on ``name``.

    Note that new :class:`fiftyone.core.dataset.Dataset` instances are always
    created if the ``_create == True``.

    When the final strong reference to a dataset dies the weak reference dies
    and the dataset objects destructor is called.
    """

    def __new__(metacls, *args, **kwargs):
        cls = super().__new__(metacls, *args, **kwargs)
        cls._instances = weakref.WeakValueDictionary()
        return cls

    def __call__(cls, name=None, _create=True, *args, **kwargs):
        if (
            _create
            or name not in cls._instances
            or cls._instances[name].deleted
        ):
            instance = cls.__new__(cls)
            instance.__init__(name=name, _create=_create, *args, **kwargs)
            name = instance.name  # `__init__` may have changed `name`
            cls._instances[name] = instance

        return cls._instances[name]
