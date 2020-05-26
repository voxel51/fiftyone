import fiftyone as fo

# Load your FiftyOne dataset
dataset = ...

# Launch your dashboard locally
# (if you're reading this from your dashboard, you've already done this!)
session = fo.launch_dashboard()

# Load a dataset
session.dataset = dataset

# Load a specific view into your dataset
session.view = view
