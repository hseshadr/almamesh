"""``starter_pack`` — the 18 universal codes, and TS/Python parity.

The parity contract: the Python ``starter_pack`` must carry exactly the same 18
codes, categories, HTTP statuses and params as the TS ``@edgeproc/errors``
``starterPack`` (both transcribed from ``errors-registry.json``), so a failure
classifies to the same code in a browser and in a Python backend.
"""

from __future__ import annotations

from shared_libs_python.errors import CatalogEntry, Category, define_errors, starter_pack

# The canonical 18 — the single source of truth both languages transcribe.
EXPECTED_CODES = frozenset(
    {
        "ai.config.no_key",
        "ai.provider.unauthorized",
        "ai.provider.out_of_credits",
        "ai.provider.rate_limited",
        "ai.provider.server_error",
        "ai.model.unavailable",
        "ai.request.timeout",
        "ai.request.cancelled",
        "ai.privacy.violation",
        "net.unreachable",
        "bundle.download_failed",
        "bundle.integrity_failed",
        "bundle.quota_exceeded",
        "bundle.device_unsupported",
        "bundle.timeout",
        "config.missing",
        "config.invalid",
        "internal.unknown",
    }
)


def test_should_transcribe_exactly_the_18_registry_codes() -> None:
    # Given the starter pack
    # When its codes are read
    # Then they are exactly the canonical 18 (TS/Python parity)
    assert len(starter_pack) == 18
    assert frozenset(starter_pack) == EXPECTED_CODES


def test_should_carry_category_and_default_english_on_every_code() -> None:
    # Given every starter-pack entry
    for entry in starter_pack.values():
        # Then it has a category and a default-English string
        assert isinstance(entry.category, Category)
        assert isinstance(entry.en, str)


def test_should_preserve_the_params_contract_from_the_registry() -> None:
    # Given codes that declare interpolation params
    # When their params are read
    # Then they match the registry contract
    assert starter_pack["ai.provider.out_of_credits"].params == (
        "creditsLeft",
        "creditsTotal",
        "currency",
    )
    assert starter_pack["bundle.quota_exceeded"].params == ("requiredBytes", "availableBytes")


def test_should_register_the_documented_http_statuses() -> None:
    # Given codes that map from HTTP statuses
    # When their statuses are read
    # Then they match the documented statuses
    assert starter_pack["ai.provider.unauthorized"].http_status == (401, 403)
    assert starter_pack["ai.provider.server_error"].http_status == (500, 502, 503, 504)


def test_should_be_registerable_and_extendable_with_a_consumers_own_codes() -> None:
    # Given the starter pack spread into a consumer catalog
    reg = define_errors(
        {**dict(starter_pack), "shop.out_of_stock": CatalogEntry(category=Category.PROVIDER)}
    )
    # When used
    # Then both the consumer code and the starter codes are live
    assert reg.has("shop.out_of_stock") is True
    assert reg.has("ai.provider.out_of_credits") is True
    assert reg.classify({"status": 402}) == "ai.provider.out_of_credits"
