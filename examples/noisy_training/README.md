# Finding Label Mistakes During Model Training with FiftyOne

This walkthrough provides an example of how FiftyOne can be used to help you
find mistakes in your labels during a model-training procedure. It covers the
following concepts:

-   Integrating your existing model-training loop with FiftyOne
-   Adding predictions from your model to your FiftyOne dataset
-   Computing insights into your dataset relating to possible problems with the
    datasets
-   Visualizing the problems in the FiftyOne Dashboard

## Setup

Install `torch` and `torchvision`, if necessary:

```
pip install torch
pip install torchvision
```

## Dataset download

In this walkthrough, we'll train a model on the CIFAR-10 dataset, which you can
download from the FiftyOne Dataset Zoo to `~/fiftyone/cifar10` via the
following command:

```
fiftyone zoo download cifar10
```

We use CIFAR-10 here as an illustrative example. However, this is not a
requirement for using FiftyOne. You can use your own datasets no matter where
they are. Refer to the other, data-related walkthroughs for more examples.

## Manipulating the data

For this walkthrough, we will artificially perturb the existing dataset with
mistakes on the labels to create a noisy-training scenario. Of course, in your
normal workflow, you would not add labeling mistakes; this is only for the sake
of the walkthrough. So, let's manipulate the dataset and then we will actually
train the model using the bad labels.

Let's continue to use the CIFAR-10 dataset in the FiftyOne zoo for ease, but
without loss of generality.

```py
%run -i setup_data.py
```

## Train a model

Using the simple model provided in `simple_resnet.py`, let's now train a model
and save it to disk. We will train the model using the FiftyOne dataset we made
above. This is a lightweight wrapper around the original dataset. Of course, in
your work, you might choose to interact with your data prior to it being
wrapped by FiftyOne; all good, FiftyOne will work with you on your terms.

```py
%run -i train.py
```

## Add predictions on the dataset

Using the model we just trained, let's now add predictions to the dataset so
that we can explore some of FiftyOne's capabilities in identifying hard samples
and possible mistakes in the labels, which we know are there because we added
them!

```py
%run -i predict.py
```

## Analyze the data

Now we can run a method from FiftyOne that estimate the hardness of the samples
we processed. We can use this to find possible label mistakes both in the code
and in the visualization.

```py
import fiftyone.brain as fob

# Retrieve samples that we processed
h_view = dataset.view().match_tag("processed")

# Compute sample hardness
fob.compute_hardness(h_view, "walkthrough")

# Compute sample mistakenness
fob.compute_mistakenness(h_view, "walkthrough")

# Launch the FiftyOne Dashboard
session = fo.launch_dashboard()

# Open your dataset in the dashboard
session.dataset = dataset

# Show only the samples that were processed
view = dataset.view().match_tag("processed")
session.view = view

# Show only the samples for which we added label mistakes
view = dataset.view().match_tag("mistake")
session.view = view

# Show the samples we processed in rank order by the hardness
hardness_view = h_view.sort_by("hardness", reverse=True)
session.view = hardness_view

# Show the samples we processed in rank order by the hardness
mistakennness_view = h_view.sort_by("mistakenness", reverse=True)
session.view = mistakenness_view
```

You could easily drop these findings into an iterative loop that attempts to
sequentially fix the mistakes, or remove them from training. FiftyOne lets you
do this by integrating within your model training loop or via an export
procedure.
