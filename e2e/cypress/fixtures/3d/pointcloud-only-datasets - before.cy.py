import fiftyone as fo

# note, using __file__ won't work because this is a cypress fixture that gets renamed in runtime
dataset = fo.Dataset(name="pointcloud-only-datasets")
pcd_sample = fo.Sample("cypress/fixtures/3d/resources/cone.pcd")
dataset.add_sample(pcd_sample)
session = fo.launch_app(dataset, address="0.0.0.0", remote=True)
