import fiftyone as fo

print("hello from fiftyone")
dataset = fo.Dataset()
session = fo.launch_app(dataset, remote=True)
session.wait()
