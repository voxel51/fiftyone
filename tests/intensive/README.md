# Intensive tests

The weekly intensive workflow runs the credential-free selection in
`scheduled.txt` on Linux and Python 3.13. The selection requires:

- the lock-backed full test environment;
- outbound HTTPS access for FiftyOne Zoo downloads;
- at least 10 GiB of free disk; and
- the cached `quickstart`, `quickstart-video`, and other Zoo assets requested
  by the selected tests.

Run the same selection locally with:

```shell
uv sync --locked --no-default-groups --extra multimodal --group test
uv run --locked --no-sync python tests/utils/setup_config.py
uv run --locked --no-sync python tests/utils/pytest_wrapper.py \
  $(grep -Ev '^[[:space:]]*(#|$)' tests/intensive/scheduled.txt) \
  --verbose \
  --timeout=600
```

Service-backed modules are intentionally outside the scheduled selection. They
require dedicated test services and credentials:

- `cvat_tests.py`: a reachable CVAT server plus the configured URL, username,
  and password;
- `labelbox_tests.py`: a Labelbox API key and test project;
- `labelstudio_tests.py`: `FIFTYONE_LABELSTUDIO_URL` and
  `FIFTYONE_LABELSTUDIO_API_KEY`; and
- `scale_tests.py`: Scale test assets and integration configuration.

The SAM, model-zoo, dataset-zoo, and Lightning Flash modules also remain manual
because they require model-specific dependencies, large assets, a GPU, or
third-party datasets beyond the scheduled lane's resource contract.
