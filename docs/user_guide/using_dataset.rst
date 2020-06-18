Using a Dataset
===============

After a `Dataset` has been :doc:`loaded or created <making_dataset>`, FiftyOne
provides powerful functionality to inspect, search, and modify it from a
`Dataset`-wide down to a `Sample` level.


The following sections provide details of how to use various aspects of FiftyOne
`Datasets`.


Samples
_______

Individual `Samples` are always initialized with a file path to the
corresponding image on disk::
    import fiftyone as fo
    sample = fo.Sample(filepath="path/to/image.png")


Adding Sample
-------------

Can easily be added to an existing `Dataset`::
    dataset = fo.Dataset(name="example_dataset")
    dataset.add_sample(sample)

When a `Sample` is added to a `Dataset`, the related attributes of the `Sample` are
automatically updated::
    print(sample.in_dataset)
    print(sample.dataset_name)

    Out: 
        True
        simple_dataset

Every `Sample` in a `Dataset` is given a unique ID when it is added::
    print(sample.id)

    Out: 
        5ee0ebd72ceafe13e7741c42

A batch of multiple `Samples` can be added to a `Dataset` at the same time by providing a
list of `Samples`::
    print(len(dataset))
    dataset.add_samples(
        [
            fo.Sample(filepath="/path/to/img1.jpg"),
            fo.Sample(filepath="/path/to/img2.jpg"),
            fo.Sample(filepath="/path/to/img3.jpg"),
        ]
    );
    print(len(dataset)

    Out:
        1
        4


Viewing Samples
---------------

FiftyOne provides multiple ways to access `Samples` in a `Dataset`.

`Datasets` are iterable allowing all `Samples` to be accessed one at a time::
    for sample in dataset:
        print(sample)

A `Sample` can be accessed directly from a `Dataset` by it's ID. The `Samples`
that are returned when accessing a `Dataset` will always provide the same
instance::
    same_sample = dataset[sample.id]
    print(same_sample is sample)

    Out:
        True


Removing Samples
----------------

`Samples` can be removed from a `Dataset` through their ID, either one at a
time or in a batch::
    del dataset[sample_id]

    dataset.remove_samples([sample_id2, sample_id3])

`Samples` can also be removed from a `Dataset` by using the `Sample` instance::
    sample = dataset[sample_id]
    dataset.remove_sample(sample)

If the `Sample` is in memory, it will behaving the same as a `Sample` that has
never been added to the `Dataset`


Fields
______


Views
_____

The default view of a `Dataset` is a look at the entire `Dataset`. From there, ::
    print(dataset.view())

    Out: fiftyone.core.view.DatasetView



Iterating
---------

In order to look at `Samples` in a `View`, use `first()` to get the frst sample
in a `View` or `take(x)` to get a new `View` containing `x` random `Samples`::
    first_sample = dataset.view().first()

    new_view = dataset.view().take(2)
    print(len(new_view))

    Out: 2



Sorting
-------


Searching
---------


Modify Dataset
______________

