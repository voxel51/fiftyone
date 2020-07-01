import fiftyone as fo

# Load your FiftyOne dataset
dataset = ...

# Launch the app locally
# (if you're reading this from the app, you've already done this!)
session = fo.launch_app()

# Load a dataset
session.dataset = dataset

# Load a specific view into your dataset
session.view = view
