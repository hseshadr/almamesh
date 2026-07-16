"""``define_errors()`` — registry construction + duplicate-code rejection."""

from __future__ import annotations

import pytest

from shared_libs_python.errors import (
    CatalogEntry,
    Category,
    DuplicateCodeError,
    define_errors,
    starter_pack,
)


def test_should_expose_registered_codes_in_order() -> None:
    # Given a two-code catalog
    reg = define_errors(
        {
            "a.b.c": CatalogEntry(category=Category.INTERNAL, en="x"),
            "d.e.f": CatalogEntry(category=Category.NETWORK, en="y"),
        }
    )
    # When the registry is inspected
    # Then codes are exposed in registration order and membership is queryable
    assert reg.codes == ("a.b.c", "d.e.f")
    assert reg.has("a.b.c") is True
    assert reg.has("nope") is False


def test_should_expose_the_entry_via_get() -> None:
    # Given a registry over the starter pack
    reg = define_errors(starter_pack)
    # When an entry is fetched
    entry = reg.get("ai.provider.out_of_credits")
    # Then its category is available
    assert entry is not None
    assert entry.category == Category.PROVIDER


def test_should_return_none_from_get_for_an_unregistered_code() -> None:
    # Given a registry over the starter pack
    reg = define_errors(starter_pack)
    # When an unregistered code is fetched
    # Then None is returned
    assert reg.get("not.a.code") is None


def test_should_raise_duplicate_code_error_across_fragments() -> None:
    # Given the starter pack plus a fragment that re-declares one of its codes
    # When merged
    # Then a duplicate-code error is raised
    with pytest.raises(DuplicateCodeError):
        define_errors(
            starter_pack,
            {"internal.unknown": CatalogEntry(category=Category.INTERNAL, en="dupe")},
        )


def test_should_name_the_offending_code_in_the_duplicate_error() -> None:
    # Given two fragments that both declare x.y
    # When merged
    # Then the offending code is named in the message
    with pytest.raises(DuplicateCodeError, match=r"x\.y"):
        define_errors(
            {"x.y": CatalogEntry(category=Category.INTERNAL)},
            {"x.y": CatalogEntry(category=Category.NETWORK)},
        )


def test_should_merge_non_overlapping_fragments_cleanly() -> None:
    # Given two disjoint fragments
    reg = define_errors(
        {"one.a": CatalogEntry(category=Category.INTERNAL, en="1")},
        {"two.b": CatalogEntry(category=Category.NETWORK, en="2")},
    )
    # When merged
    # Then both codes are present in order
    assert reg.codes == ("one.a", "two.b")


def test_should_accept_declared_params_on_describe_and_create() -> None:
    # Given a code that declares typed params
    reg = define_errors(
        {
            "pay.declined": CatalogEntry(
                category=Category.PROVIDER,
                params=("amount", "currency"),
                en="Declined: {amount} {currency}.",
            ),
            "internal.unknown": CatalogEntry(
                category=Category.INTERNAL, en="Something went wrong."
            ),
        }
    )
    # When describe() and create() are given those params
    text = reg.describe("pay.declined", {"amount": 42, "currency": "USD"})
    err = reg.create("pay.declined", {"amount": 42, "currency": "USD"})
    # Then both honour the params
    assert text == "Declined: 42 USD."
    assert err.code == "pay.declined"
    assert err.params == {"amount": 42, "currency": "USD"}
    assert err.category == Category.PROVIDER
