Using a Dataset
===============

.. default-role:: code

After a `Dataset` has been :doc:`loaded or created <making_dataset>`, FiftyOne
provides powerful functionality to inspect, search, and modify it from a
`Dataset`-wide down to a `Sample` level.


The following sections provide details of how to use various aspects of FiftyOne
`Datasets`.


Samples
_______

Individual `Samples` are always initialized with a file path to the
corresponding image on disk. The image is not read at this point::
    import fiftyone as fo
    sample = fo.Sample(filepath="path/to/image.png")


Adding Samples
--------------

`Samples` an easily be added to an existing 
`Dataset`::
    dataset = fo.Dataset(name="example_dataset")
    dataset.add_sample(sample)

When a `Sample` is added to a `Dataset`, the related attributes of the `Sample` are
automatically updated::
    print(sample.in_dataset)
    print(sample.dataset_name)

    Out: 
        True
        example_dataset

Every `Sample` in a `Dataset` is given a unique ID when it is 
added::
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


Accessing Samples in Dataset
----------------------------

FiftyOne provides multiple ways to access `Samples` in a 
`Dataset`.

`Datasets` are iterable allowing all `Samples` to be accessed one at a 
time::
    for sample in dataset:
        print(sample)

A `Sample` can be accessed directly from a `Dataset` by it's ID. The `Samples`
that are returned when accessing a `Dataset` will always provide the same
instance::
    same_sample = dataset[sample.id]
    print(same_sample is sample)

    Out:
        True

**Note: More ways of accessing** `Samples` **are provided through** `Views` **described below.**


Removing Samples
----------------

`Samples` can be removed from a `Dataset` through their ID, either one at a
time or in a batch::
    del dataset[sample_id]

    dataset.remove_samples([sample_id2, sample_id3])

`Samples` can also be removed from a `Dataset` by using the `Sample` 
instance::
    sample = dataset[sample_id]
    dataset.remove_sample(sample)

If the `Sample` is in memory, it will behaving the same as a `Sample` that has
never been added to the `Dataset`


Fields
______

`Fields` are attributes of `Samples` that are shared across all `Samples` in a
`Dataset`.

By default, a `Dataset` and the `Samples` therein have two `Fields`,
`filepath`, and `tags`.
All `Samples` are required to be initialized with the `StringField` `filepath`
and also contain the `ListField` `tags`.


Accessing Fields
----------------

Available `Fields` can be found at a `Sample` or `Dataset` 
level::
    sample.field_names
    dataset.get_field_schema()

The value of a `Field` for a given `Sample` can be accessed either by key or
attribute access::
    sample.filepath
    sample["filepath"]


Adding Fields
--------------------------

`Fields` are added to a `Samples` one at a 
time::
    sample["integer_field"] = 51


`Fields` can be any primitive type: `bool`, `int`, `float`, `str`, `list`,
`dict`, or more complex data structures like `Labels`::
    sample["ground_truth"] = fo.Classification(label="alligator")

Whenever a new `Field` is added to one `Sample` in a `Dataset`, that `Field` is
added to all other `Samples` in the `Dataset` with the value `None`.

A `Field` must be the same type across every `Sample` in the `Dataset`. Setting
a `Field` to an inappropriate type raises a `ValidationError`::
    sample2.integer_field = "a string"

    Out:
        Error: a string could not be converted to int


Removing Fields
---------------

`Fields` can be deleted from every `Sample` in a 
`Dataset`::
    dataset.delete_sample_field("integer_field")

`Fields` can be deleted from a `Sample` using 
`del`. Unlike the previous method, this does not remove the `Field` from the
`Dataset`, it just sets the value of the `Field` to the default value for the
`Sample`::
    del sample["integer_field"]


Tags
----

`Tags` are a special `ListField` that every `Sample` has by default. They are
just a list of strings that are provided for ease of use by the user. For
example, `Tags` can be used to defined dataset splits or mark low quality
images::
    dataset = fo.Dataset("tagged_dataset")

    dataset.add_samples(
        [   
            fo.Sample(filepath="path/to/img1.png", tags=["train"]),
            fo.Sample(filepath="path/to/img2.png", tags=["test", "low_quality"]),
        ]
    )

    print(dataset.get_tags())

    Out:
        {"test", "low_quality", "train"}

`Tags` can be added to a `Sample` like a standard python 
`list`::
    sample.tags += ["new_tag"]
    sample.save()

**Note: If the** `Sample` **is in a** `Dataset` **, then** `sample.save()` **must be used to update the** `Dataset` `Tags`


Views
_____

Since `Datasets` are unordered collections, `Samples`
cannot be easily be accessed. 
In the previous `Sample` section, two ways of accessing `Samples` were
presented. FiftyOne provides a more flexible method of accessing `Samples` through the use of `Views`.


The default view of a `Dataset` is a look at the entire 
`Dataset`. By default, it is sorted arbitrarily::
    print(dataset.view())

    Out: fiftyone.core.view.DatasetView

Basic ways to explore `Views` are 
available::
    print(len(dataset.view()))

    print(datsaet.view())

    Out:
        2
        
        Dataset:        interesting_dataset
        Num samples:    2
        Tags:           ['test', 'train']
        Sample fields:
            filepath: fiftyone.core.fields.StringField
            tags:     fiftyone.core.fields.ListField(fiftyone.core.fields.StringField)
            metadata: fiftyone.core.fields.EmbeddedDocumentField(fiftyone.core.metadata.Metadata)






Accessing Samples in View
-------------------------

In order to look at `Samples` in a `View`, use `first()` to get the frst sample
in a `View` or `take(x)` to get a new `View` containing `x` random `Samples`::
    first_sample = dataset.view().first()

    new_view = dataset.view().take(2)
    print(len(new_view))

    Out: 2

Ranges of `Samples` can be accessed using `skip()` and `limit()` or through
array slicing::
    # Skip the first 2 samples and take the next 3
    view = dataset.view()

    view.skip(2).limit(3)

    view()[2:5]

For efficiency, slicing only works if a `:` is 
provided::
    view[0]

    Out:
        KeyError: "Accessing samples by numeric index is not supported. Use sample IDs or slices"


As with `Datasets`, `Samples` in a `View` can be accessed by ID and `Views`
are iterable::
    sample = view[sample.id]

    for sample in view:
        print(sample)

`Views` can be created by matching lists of `Sample` IDs, either to only
include given `Samples` or to include all but the given `Samples`::
    sample_ids = [sample1.id, sample2.id]
    included = dataset.view().select(sample_ids)
    excluded = dataset.view().exclude(sample_ids)


A `View` can also be filtered to only include `Samples` for which a given
`Field` exists and is not `None`::
    metadata_view = dataset.view().exists("metadata")



Sorting
-------

The `Samples` in a `View` can be sorted (forward or in reverse) by any 
`Field`::
    view = dataset.view().sort_by("filepath")
    view = dataset.view().sort_by("id", reverse=True)


Querying
---------

`Views` can be queried using `match()`. The syntax follows 
`MongoDB queries <https://docs.mongodb.com/manual/tutorial/query-documents/>`_::
    # Get only samples with the tag "train"
    view = dataset.view().match({"tags": "train"})


Chaining Operations
-------------------

All of the aformentioned operations can be chained 
together::
    complex_view = (
        dataset.view()
        .match({"tags": "test"})
        .exists("metadata")
        .sort_by("filepath")[:3]
        .take(2)
    )


Modify a Dataset
--------------

A `Dataset` can then be updated to remove all `Samples` in a given 
`View`::
    dataset.remove_samples(view)
