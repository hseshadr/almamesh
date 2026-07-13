"""Import-boundary smoke tests."""

import importlib
import inspect


def test_should_import_calculations_without_suppressed_late_imports() -> None:
    # Given / When
    module = importlib.import_module("almamesh.calculations")

    # Then
    assert callable(module.calculate_sidereal_context)
    assert "# noqa: E402" not in inspect.getsource(module)
