"""Tests for ``CanonicalError`` and ``registry.create`` (mirror the TS surface)."""

from __future__ import annotations

import pytest

from shared_libs_python.errors import (
    CanonicalError,
    Category,
    define_errors,
    starter_pack,
)


def test_should_carry_code_category_and_params_when_constructed() -> None:
    # Given a canonical error constructed at a throw-site
    err = CanonicalError("bundle.quota_exceeded", Category.DEVICE, {"requiredBytes": 1024})
    # When its fields are read
    # Then it is a real Exception carrying the canonical triple
    assert isinstance(err, Exception)
    assert isinstance(err, CanonicalError)
    assert err.code == "bundle.quota_exceeded"
    assert err.category == Category.DEVICE
    assert err.params == {"requiredBytes": 1024}
    # The code IS the message so it stays greppable in logs.
    assert str(err) == "bundle.quota_exceeded"


def test_should_default_params_to_empty_mapping_when_omitted() -> None:
    # Given a canonical error with no params
    err = CanonicalError("internal.unknown", Category.INTERNAL)
    # When params is read
    # Then it is an empty mapping, never None
    assert err.params == {}


def test_should_be_catchable_by_code_when_raised() -> None:
    # Given a raised canonical error
    # When caught
    with pytest.raises(CanonicalError) as caught:
        raise CanonicalError("ai.request.cancelled", Category.INTERNAL)
    # Then its code is preserved through the raise/catch
    assert caught.value.code == "ai.request.cancelled"


def test_should_construct_with_registered_category_when_created_via_registry() -> None:
    # Given a registry over the starter pack
    registry = define_errors(starter_pack)
    # When create() is called for a known code
    err = registry.create("bundle.quota_exceeded", {"requiredBytes": 2048, "availableBytes": 100})
    # Then the category is looked up from the catalog
    assert isinstance(err, CanonicalError)
    assert err.category == Category.DEVICE
    assert err.params == {"requiredBytes": 2048, "availableBytes": 100}


def test_should_fall_back_to_internal_category_when_code_unknown() -> None:
    # Given a registry over the starter pack
    registry = define_errors(starter_pack)
    # When create() is called for an unregistered code
    err = registry.create("not.registered")
    # Then the category falls back to internal
    assert err.category == Category.INTERNAL
