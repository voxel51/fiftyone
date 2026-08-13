# inject

The injection namespace connects concrete adapters to the format-neutral
runtime and registers application-facing views. Composition root.

It may connect adapters, runtime capabilities, and views. Nothing else should
depend on it, and it should be super minimal.
