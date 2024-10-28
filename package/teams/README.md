FiftyOne Teams embedded API server for
[FiftyOne](https://pypi.org/project/fiftyone).

### Configuration

In addition to SDK configuration, the embedded server requires the auth secret
defined by the
[Teams CAS](https://github.com/voxel51/voxel-hub/tree/develop/cas).

```
export FIFTYONE_AUTH_SECRET=secret
```

### Running the API server

To avoid `PYTHONPATH` issues in a developer install, the `hypercorn` server
should be run in this README's directory.

```
hypercorn fiftyone.teams.app:app --bind 0.0.0.0:5151 --reload
```
