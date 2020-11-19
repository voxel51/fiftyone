import fiftyone as fo

# Load your FiftyOne dataset
dataset = ...

# Launch the app that you'll connect to from your local machine
session = fo.launch_app(remote=True)

# Load a dataset
session.dataset = dataset

# Load a specific view into your dataset
session.view = view
