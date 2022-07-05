"""
Random sampling utilities.

| Copyright 2017-2022, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import numpy as np


def weighted_sample(
    sample_collection,
    k,
    weights,
    tag,
    exact=True,
    seed=None,
):
    """Generates a random sample of size ``k`` from the given collection such
    that the probability of selecting each sample is proportional to the given
    per-sample weights.

    The results are encoded by adding the specified ``tag`` to each sample that
    was chosen.

    Example::

        import fiftyone as fo
        import fiftyone.utils.random as four
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="train")

        # Sample proportional to label length
        weights = dataset.values(F("ground_truth.label").strlen())
        sample = four.weighted_sample(dataset, 10000, weights, "unbalanced")

        # Plot results
        plot = fo.CategoricalHistogram(
            "ground_truth.label",
            order=lambda kv: -len(kv[0]),  # order by label length
            init_view=sample,
        )
        plot.show()

        # Cleanup
        dataset.untag_samples("unbalanced")

    Args:
        sample_collection: a :class:`fiftyone.core.collections.SampleCollection`
        k: the number of samples to select
        tag: the tag to use to encode the results of the sampling
        weights (None): an array of per-sample weights
        exact (True): whether to tag exactly ``k`` samples (True) or sample so
            that the expected number of samples is ``k`` (False)
        seed (None): an optional random seed to use

    Returns:
        a :meth:`fiftyone.core.view.DatasetView` containing the sample
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

    sample_collection[select_ids].tag_samples(tag)

    return sample_collection.match_tags(tag)


def balanced_sample(sample_collection, k, path, tag, exact=True, seed=None):
    """Generates a random sample of size ``k`` from the given collection such
    that the expected histogram of ``path`` values in the sample is uniform.

    The results are encoded by adding the specified ``tag`` to each sample that
    was chosen.

    Example::

        import fiftyone as fo
        import fiftyone.utils.random as four
        import fiftyone.zoo as foz
        from fiftyone import ViewField as F

        dataset = foz.load_zoo_dataset("cifar10", split="train")

        # Sample proportional to label length
        weights = dataset.values(F("ground_truth.label").strlen())
        sample1 = four.weighted_sample(dataset, 10000, weights, "unbalanced")

        # Now take a balanced sample from this unbalanced sample
        sample2 = four.balanced_sample(sample1, 2000, "ground_truth.label", "balanced")

        # Plot results
        plot1 = fo.CategoricalHistogram("ground_truth.label", init_view=dataset)
        plot2 = fo.CategoricalHistogram(
            "ground_truth.label",
            order=lambda kv: -len(kv[0]),  # order by label length
            init_view=sample1,
        )
        plot3 = fo.CategoricalHistogram("ground_truth.label", init_view=sample2)
        plot = fo.ViewGrid([plot1, plot2, plot3])
        plot.show()

        # Cleanup
        dataset.untag_samples(["balanced", "unbalanced"])

    Args:
        sample_collection: a :class:`fiftyone.core.collections.SampleCollection`
        k: the number of samples to select
        path: the categorical field against which to sample, e.g.,
            ``"ground_truth.label"``
        tag: the tag to use to encode the results of the sampling
        exact (True): whether to tag exactly ``k`` samples (True) or sample so
            that the expected number of samples is ``k`` (False)
        seed (None): an optional random seed to use

    Returns:
        a :meth:`fiftyone.core.view.DatasetView` containing the sample
    """
    counts = sample_collection.count_values(path)
    weights = np.array([1 / counts[l] for l in sample_collection.values(path)])

    return weighted_sample(
        sample_collection,
        k,
        weights,
        tag,
        exact=exact,
        seed=seed,
    )
