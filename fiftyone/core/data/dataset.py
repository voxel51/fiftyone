import weakref


class DatasetSingleton(type):
    """Singleton metaclass for :class:`fiftyone.core.dataset.Dataset`.

    Datasets are singletons keyed by the dataset's ``name``.

    Note that new :class:`fiftyone.core.dataset.Dataset` instances are always
    created if the ``_create == True``.
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
