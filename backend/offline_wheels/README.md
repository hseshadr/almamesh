# Offline wheels (skyfield stack)

Pure-Python (`py3-none-any`) wheels vendored so the in-browser Pyodide engine can
boot the skyfield stack **offline** after first sync. They are shipped inside the
signed edge-proc bundle under `wheels/<filename>.whl` (see
`src/almamesh/edge/bundle.py::gather_offline_wheels`).

Pinned versions:

| Wheel | Version | Tag |
|-------|---------|-----|
| `jplephem` | 2.23 | `py3-none-any` |
| `sgp4` | 2.25 | `py3-none-any` (MUST be the pure wheel, not a platform binary) |
| `skyfield` | 1.53 | `py3-none-any` |

`sgp4` publishes platform-specific binary wheels (e.g. `cp313-*-macosx`). Pyodide
cannot load those — it needs the pure `py3-none-any` wheel. Always confirm the tag.

Pyodide's own runtime + numpy ship as app static assets, NOT in this bundle.

## Refresh

```bash
pip download --no-deps --only-binary=:all: \
  --python-version 3.13 --implementation py --abi none --platform any \
  -d backend/offline_wheels \
  skyfield==1.53 jplephem==2.23 sgp4==2.25
```

`--platform any --abi none --implementation py` forces the pure-Python wheels.
After refreshing, update the version table above and the pins in `bundle.py` tests.
