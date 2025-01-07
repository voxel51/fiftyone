"""
Random sampling utilities.

| Copyright 2017-2025, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np


def random_split(sample_collection, split_fracs, seed=None):
    """Generates a random partition of the samples in the collection according
    to the specified split fractions.

    Example::

        import fiftyone as fo
        import fiftyone.utils.random as four
        import fiftyone.zoo as foz

        # A dataset with `ground_truth` detections and no tags
        dataset = (
            foz.load_zoo_dataset("quickstart")
            .select_fields("ground_truth")
            .set_field("tags", [])
        ).clone()

        #
        # Generate a random sample and encode results via tags
        #

        four.random_split(dataset, {"train": 0.7, "test": 0.2, "val": 0.1})

        print(dataset.count_sample_tags())
        # {'train': 140, 'test': 40, 'val': 20}

        #
        # Generate a random sample in-memory
        #

        view1, view2 = four.random_split(dataset, [0.5, 0.5])

        assert len(view1) + len(view2) == len(dataset)
        assert set(view1.values("id")).isdisjoint(set(view2.values("id")))

    Args:
        sample_collection: a
            :class:`fiftyone.core.collections.SampleCollection`
        split_fracs: can be either of the following:

            -   a dict mapping tag strings to split fractions in ``[0, 1]``. In
                this case, the partition is denoted by tagging each sample with
                its assigned split
            -   a list of split fractions in ``[0, 1]``. In this case, a
                corresponding list of :class:`fiftyone.core.view.DatasetView`
                instances containing the partition is returned

            In either case, the split fractions are normalized so that they sum
            to 1, if necessary
        seed (None): an optional random seed

    Returns:
        one of the following

        -   ``None``, if ``split_fracs`` is a dict
        -   a tuple of :class:`fiftyone.core.view.DatasetView` instances, if
            ``split_fracs`` is a list
    """
    use_tags = isinstance(split_fracs, dict)

    if use_tags:
        tags, fracs = zip(*split_fracs.items())
    else:
        fracs = split_fracs

    fracs = np.cumsum(fracs)
    alpha = len(sample_collection) / fracs[-1]
    threshs = np.round(alpha * fracs).astype(int)

    sample_ids = np.array(sample_collection.values("id"))
    rs = np.random.RandomState(seed=seed)  # pylint: disable=no-member
    rs.shuffle(sample_ids)

    split_ids = np.split(sample_ids, threshs[:-1])

    if use_tags:
        for ids, tag in zip(split_ids, tags):
            sample_collection.select(ids).tag_samples(tag)

        return

    return tuple(sample_collection.select(ids) for ids in split_ids)


def weighted_sample(
    sample_collection,
    k,
    weights,
    tag=None,
    exact=True,
    seed=None,
):
    """Generates a random sample of size ``k`` from the given collection such
    that the probability of selecting each sample is proportional to the given
    per-sample weights.

    Example::

        import fiftyone as fo
        import fiftyone.utils.random as four
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="train")

        # Sample proportional to label length
        weights = dataset.values(F("ground_truth.label").strlen())
        sample = four.weighted_sample(dataset, 10000, weights)

        # Plot results
        plot = fo.CategoricalHistogram(
            "ground_truth.label",
            order=lambda kv: -len(kv[0]),  # order by label length
            init_view=sample,
        )
        plot.show()

    Args:
        sample_collection: a :class:`fiftyone.core.collections.SampleCollection`
        k: the number of samples to select
        weights: an array of per-sample weights
        tag (None): an optional sample tag to use to encode the results
        exact (True): whether to tag exactly ``k`` samples (True) or sample so
            that the expected number of samples is ``k`` (False)
        seed (None): an optional random seed to use

    Returns:
        a :class:`fiftyone.core.view.DatasetView` containing the sample
    """
    weights = np.asarray(weights)
    probs = (k / sum(weights)) * weights

    rs = np.random.RandomState(seed=seed)  # pylint: disable=no-member
    rands = rs.rand(len(sample_collection))

    if exact:
        inds = np.argpartition(rands - probs, k)[:k]
    else:
        inds = rands < probs

    ids = np.array(sample_collection.values("id"))
    select_ids = ids[inds]

    view = sample_collection[select_ids]

    if tag is not None:
        view.tag_samples(tag)
        view = sample_collection.match_tags(tag)

    return view


def balanced_sample(
    sample_collection,
    k,
    path,
    tag=None,
    exact=True,
    seed=None,
):
    """Generates a random sample of size ``k`` from the given collection such
    that the expected histogram of ``path`` values in the sample is uniform.

    Example::

        import fiftyone as fo
        import fiftyone.utils.random as four
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="train")

        # Sample proportional to label length
        weights = dataset.values(F("ground_truth.label").strlen())
        view1 = four.weighted_sample(dataset, 10000, weights)

        # Now take a balanced sample from this unbalanced sample
        view2 = four.balanced_sample(view1, 2000, "ground_truth.label")

        # Plot results
        plot1 = fo.CategoricalHistogram("ground_truth.label", init_view=dataset)
        plot2 = fo.CategoricalHistogram(
            "ground_truth.label",
            order=lambda kv: -len(kv[0]),  # order by label length
            init_view=view1,
        )
        plot3 = fo.CategoricalHistogram("ground_truth.label", init_view=view2)
        plot = fo.ViewGrid([plot1, plot2, plot3])
        plot.show()

    Args:
        sample_collection: a :class:`fiftyone.core.collections.SampleCollection`
        k: the number of samples to select
        path: the categorical field against which to sample, e.g.,
            ``"ground_truth.label"``
        tag (None): an optional sample tag to use to encode the results
        exact (True): whether to tag exactly ``k`` samples (True) or sample so
            that the expected number of samples is ``k`` (False)
        seed (None): an optional random seed to use

    Returns:
        a :class:`fiftyone.core.view.DatasetView` containing the sample
    """
    counts = sample_collection.count_values(path)
    weights = np.array([1 / counts[l] for l in sample_collection.values(path)])

    return weighted_sample(
        sample_collection,
        k,
        weights,
        tag=tag,
        exact=exact,
        seed=seed,
    )
