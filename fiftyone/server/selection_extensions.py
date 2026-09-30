"""Selection filter extension points.

| Copyright 2017-2026, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""

_filter_resolver = None


def register_selection_filter_resolver(resolver):
    """Registers a resolver for filters not represented by ordinary view stages.

    The callable receives a dataset and filters and returns ``(filters,
    constrain_view)``. The returned filters enter the ordinary view builder;
    ``constrain_view(view)`` then applies the provider's candidate restriction.
    The provider must preserve empty results and propagate resolution errors.

    Returns:
        a function that restores the previous resolver
    """
    global _filter_resolver
    previous = _filter_resolver
    _filter_resolver = resolver

    def unregister():
        global _filter_resolver
        if _filter_resolver is resolver:
            _filter_resolver = previous

    return unregister


def resolve_filters(dataset, filters):
    """Returns ordinary filters and a view constraint, or an identity fallback."""
    if _filter_resolver is None:
        return filters, lambda view: view
    return _filter_resolver(dataset, filters)


_sample_builder = None


def register_selection_sample_builder(builder):
    """Registers an async builder for grid-identical selection preview nodes.

    The builder receives a view and its sample documents and returns sample
    nodes with resolved media metadata. It should use the grid's URL policy.

    Returns:
        a function that restores the previous builder
    """
    global _sample_builder
    previous = _sample_builder
    _sample_builder = builder

    def unregister():
        global _sample_builder
        if _sample_builder is builder:
            _sample_builder = previous

    return unregister


async def build_sample_items(view, samples):
    """Builds selection preview nodes with the registered or local grid policy."""
    if _sample_builder is not None:
        return await _sample_builder(view, samples)

    import asyncio
    import fiftyone.server.metadata as fosm
    from fiftyone.server.samples import _create_sample_item

    metadata_cache = {}
    url_cache = {}
    additional_media_fields = (
        fosm._get_additional_media_fields(view) if samples else None
    )
    return await asyncio.gather(
        *[
            _create_sample_item(
                view,
                sample,
                metadata_cache,
                url_cache,
                True,
                additional_media_fields=additional_media_fields,
            )
            for sample in samples
        ]
    )


_range_source_resolver = None


def register_selection_range_source_resolver(resolver):
    """Registers source-owned ranges for captures of filtered parent samples.

    The callable receives a view, a source descriptor and a request-local
    cache. It must return complete members or raise if resolution is partial.
    It does not change which parents the grid's filters show.

    Returns:
        a function that restores the previous resolver
    """
    global _range_source_resolver
    previous = _range_source_resolver
    _range_source_resolver = resolver

    def unregister():
        global _range_source_resolver
        if _range_source_resolver is resolver:
            _range_source_resolver = previous

    return unregister


def resolve_range_source(view, source, cache=None):
    """Resolves a registered capture source, rejecting unsupported sources."""
    if _range_source_resolver is None:
        raise ValueError("No resolver is registered for this capture source")
    return _range_source_resolver(view, source, cache)
