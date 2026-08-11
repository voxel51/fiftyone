# MCAP worker host

This directory owns main-thread coordination for MCAP workers: worker
construction, request routing, result ownership, cancellation, and grid-preview
pooling. It may report adapter-level diagnostics because it runs on the host.

The sibling `worker/` directory owns code that executes in worker contexts and
the transport contracts shared with those workers. Keep browser-facing host
policy here so the worker implementation remains headless.
