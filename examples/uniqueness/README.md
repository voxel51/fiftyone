# Exploring Image Uniqueness with FiftyOne

In this walkthrough, we explore how FiftyOne's image uniqueness tool can be
used to analyze and extract insights from raw (unlabeled) datasets.

This walkthrough covers the following concepts:

-   Loading a dataset from the FiftyOne Dataset Zoo
-   Applying FiftyOne's sample uniqueness algorithm to your dataset
-   Launching the FiftyOne dashboard and visualizing/exploring your data
-   Identifying duplicate and near-duplicate images in your dataset
-   Identifying the most unique/representative images in your dataset

## Part 1: Finding duplicate and near-duplicate images

A common problem in dataset creation is duplicated data. Although this could be
found using file-hashing---as in the `file_hashing` walkthrough---it is less
possible when small manipulations have occurred in the data. Even more critical
for workflows involving model training is the need to get as much power out of
each data samples as possible; near-duplicates, which are samples that are
exceptionally similar to one another, are intrinsically less valuable for the
training scenario. Let's see if we can find such duplicates and near-duplicates
in a common dataset: CIFAR-10.

### Load the dataset

Open an IPython shell to begin. We will use the CIFAR-10 dataset, which is
available in the FiftyOne Dataset Zoo.

```py
import fiftyone as fo
import fiftyone.zoo as foz

# Load the test split (automatically download if needed)
dataset = foz.load_zoo_dataset("cifar10", split="test")
```

### Compute uniqueness

Now we can process the entire dataset for uniqueness. This is a fairly
expensive operation, but should finish in a few minutes at most. We are
processing through all samples in the dataset, then building a representation
that relates the samples to each other. Finally, we analyze this representation
to output uniqueness.

```py
import fiftyone.brain as fob

fob.compute_uniqueness(dataset)
```

The above method populates a `uniqueness` field on each sample that contains
the sample's uniqueness score. Let's confirm this by printing some information
about the dataset:

```py
# Now the samples have a "uniqueness" field on them
print(dataset.summary())
print(dataset.view().first())
```

### Visualize to find duplicate and near-duplicate images

Now, let's visually inspect the output to see if we are able to identify

```py
# Sort in increasing order of uniqueness (least unique first)
dups_view = dataset.view().sort_by("uniqueness")

# Launch the dashboard
session = fo.launch_dashboard(view=dups_view)
```

You will easily see some near-duplicates in the GUI. It surprised us that there
are duplicates in CIFAR-10, too!

Of course, in this scenario, near duplicates are identified from visual
inspection. So, how do we get the information out of FiftyOne and back into
your working environment. Easy! The `session` variable provides a bidirectional
bridge between the GUI and your Python environment. In this case, we will use
the `session.selected` bridge. So, in the GUI, click on the checkmark in the
upper-left of some of the duplicates and near-duplicates. Then, execute the
following code in the IPython shell.

```py
# Get currently selected images from dashboard
dup_ids = session.selected

# Mark as duplicates
dups_view = dataset.view().select(dup_ids)
for sample in dups_view:
    sample.add_tag("dup")
    sample.save()

# Visualize duplicates-only in dashboard
session.view = dups_view
```

And the GUI will only show these samples now. We can, of course access the
file-paths and other information about these samples programmatically so you
can act on the findings. But, let's do that at the end of Part 2 below!

## Part 2: Finding unique samples

When building a dataset, it is important to create a diverse dataset with
unique and representative samples. Here, we explore FiftyOne's ability to help
identify the most unique samples in a raw dataset.

### Download some images

This walkthrough will process a directory of images and compute their
uniqueness. The first thing we need to do is get some images. Let's get some
images from Flickr, to keep this interesting!

You need a Flickr API key to do this. If you already have a Flickr API key,
then skip the next steps.

1. Go to <https://www.flickr.com/services/apps/create/>
2. Click on Request API Key.
   (<https://www.flickr.com/services/apps/create/apply/>) You will need to
   login (create account if needed, free).
3. Click on "Non-Commercial API Key" (this is just for a test usage) and fill
   in the information on the next page. You do not need to be very descriptive;
   your API will automatically appear on the following page.
4. Install the Flickr API: `pip install flickrapi`

Next, let's download three sets of images to process together. I suggest using
three distinct object-nouns like "badger", "wolverine", and "kitten". For the
actual downloading, we will use the provided `query_flickr.py` script:

```shell
# Your credentials here
KEY=XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SECRET=YYYYYYYYYYYYYYYY

python query_flickr.py $KEY $SECRET "badger"
python query_flickr.py $KEY $SECRET "wolverine"
python query_flickr.py $KEY $SECRET "kitten"
```

The rest of this walkthrough assumes you've downloaded some images to your
local `.data/` directory.

### Load the data into FiftyOne

In an IPython shell, let's now work through getting this data into FiftyOne and
working with it.

```py
import fiftyone as fo

dataset = fo.Dataset.from_images_dir(
    "data", recursive=True, name="flickr-images"
)

print(dataset.summary())
print(dataset.view().first())
```

The above command uses factory method on the `Dataset` class to traverse a
directory of images (including subdirectories) and generate a dataset instance
in FiftyOne containing those images.

Note that the images are not loaded from disk, so this operation is fast. The
first argument is the path to the directory of images on disk, and the third is
a name for the dataset.

With the dataset loaded into FiftyOne, we can easily launch a dashboard and
visualize it:

```py
session = fo.launch_dashboard(dataset=dataset)
```

Please refer to the `fifteen_to_fiftyone` and other walkthroughs for more
useful things you can do with the dataset and dashboard.

### Compute uniqueness and analyze

Now, let's analyze the data. For example, we may want to understand what are
the most unique images among the data as they may inform or harm model
training; we may want to discover duplicates or redundant samples.

Continuing in the same IPython session, let's compute and visualize uniqueness.

```py
import fiftyone.brain as fob

fob.compute_uniqueness(dataset)

# Now the samples have a "uniqueness" field on them
print(dataset.summary())
print(dataset.view().first())

# Sort by uniqueness (most unique first)
rank_view = dataset.view().sort_by("uniqueness", reverse=True)

# Visualize in the dashboard
session.view = rank_view
```

Now, just visualizing the samples is interesting, but we want more. We want to
get the most unique samples from our dataset so that we can use them in our
work. Let's do just that. In the same IPython session, execute the following
code.

```py
# Verify that the most unique sample has the maximal uniqueness of 1.0
print(rank_view.first())

# Extract paths to 10 most unique samples
ten_best = [x.filepath for x in rank_view.limit(10)]

for filepath in ten_best:
    print(filepath)

# Then you can do what you want with these.
# Output to csv or json, send images to your annotation team, seek additional
# similar data, etc.
```

## Copyright

Copyright 2017-2020, Voxel51, Inc.<br> voxel51.com
