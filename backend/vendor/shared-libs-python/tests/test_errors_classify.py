"""Classifier truth table — mirrors ``@edgeproc/errors`` classify.test.ts exactly.

Python raws are exceptions / mappings / response-like objects rather than JS
``Error``s, but the code each failure maps to is identical across both languages.
"""

from __future__ import annotations

import pytest

from shared_libs_python.errors import CatalogEntry, Category, define_errors, starter_pack

registry = define_errors(starter_pack)


class PrivacyViolationError(Exception):
    """Stand-in for an egress-guard block (matched by class name)."""


class AbortError(Exception):
    """Stand-in for an aborted request (matched by class name)."""


@pytest.mark.parametrize(
    ("status", "code"),
    [
        (401, "ai.provider.unauthorized"),
        (403, "ai.provider.unauthorized"),
        (402, "ai.provider.out_of_credits"),
        (404, "ai.model.unavailable"),
        (429, "ai.provider.rate_limited"),
        (500, "ai.provider.server_error"),
        (502, "ai.provider.server_error"),
        (503, "ai.provider.server_error"),
        (504, "ai.provider.server_error"),
    ],
)
def test_should_map_http_status_to_code(status: int, code: str) -> None:
    # Given a response-like raw carrying an HTTP status
    # When classified
    # Then the status maps to its canonical code
    assert registry.classify({"status": status}) == code


def test_should_read_status_even_when_a_message_is_also_present() -> None:
    # Given a 402 raw that also carries a body message
    raw = {"status": 402, "message": "Insufficient credits on account"}
    # When classified
    # Then the status still drives the code
    assert registry.classify(raw) == "ai.provider.out_of_credits"


def test_should_map_abort_error_to_request_timeout() -> None:
    # Given an aborted request (name-based, no HTTP status)
    # When classified
    # Then it maps to the timeout code
    assert registry.classify(AbortError("aborted")) == "ai.request.timeout"


def test_should_map_timeout_error_to_request_timeout() -> None:
    # Given a built-in TimeoutError
    # When classified
    # Then it maps to the timeout code
    assert registry.classify(TimeoutError("deadline exceeded")) == "ai.request.timeout"


def test_should_map_timed_out_message_to_request_timeout() -> None:
    # Given a raw whose text says it timed out
    # When classified
    # Then it maps to the timeout code
    assert registry.classify({"message": "The request timed out"}) == "ai.request.timeout"


def test_should_map_failed_to_fetch_to_net_unreachable() -> None:
    # Given a fetch failure with no HTTP status
    # When classified
    # Then it maps to net.unreachable
    assert registry.classify({"message": "Failed to fetch"}) == "net.unreachable"


def test_should_map_load_failed_to_net_unreachable() -> None:
    # Given a Safari "Load failed" with no HTTP status
    # When classified
    # Then it maps to net.unreachable
    assert registry.classify({"message": "Load failed"}) == "net.unreachable"


def test_should_map_networkerror_body_to_net_unreachable() -> None:
    # Given a NetworkError body with no HTTP status
    # When classified
    # Then it maps to net.unreachable
    assert registry.classify({"body": "NetworkError when fetching"}) == "net.unreachable"


def test_should_map_connection_failure_to_net_unreachable() -> None:
    # Given a Python ConnectionError (no HTTP status)
    # When classified
    # Then the "connection" text maps to net.unreachable
    assert registry.classify(ConnectionError("Connection refused")) == "net.unreachable"


def test_should_not_treat_a_500_that_mentions_network_as_net_unreachable() -> None:
    # Given a 500 whose text happens to mention the network
    raw = {"status": 500, "message": "networkerror upstream"}
    # When classified
    # Then the status wins over the text rule
    assert registry.classify(raw) == "ai.provider.server_error"


def test_should_map_privacy_violation_error_by_name() -> None:
    # Given a pre-egress privacy block
    # When classified
    # Then it maps to the privacy code
    assert (
        registry.classify(PrivacyViolationError("blocked before egress")) == "ai.privacy.violation"
    )


def test_should_fall_back_to_internal_unknown_for_unrecognised_failure() -> None:
    # Given an unrecognised exception
    # When classified
    # Then it falls back to internal.unknown
    assert registry.classify(Exception("something odd")) == "internal.unknown"


@pytest.mark.parametrize("raw", ["boom", None])
def test_should_fall_back_to_internal_unknown_for_non_object_raw(raw: object) -> None:
    # Given a non-object raw
    # When classified
    # Then it falls back to internal.unknown
    assert registry.classify(raw) == "internal.unknown"


def test_should_ignore_a_non_numeric_status() -> None:
    # Given a raw whose status is a string
    # When classified
    # Then it is not treated as an HTTP status
    assert registry.classify({"status": "402"}) == "internal.unknown"


def test_should_fall_back_when_status_is_not_registered() -> None:
    # Given a status no code registers
    # When classified
    # Then it falls back to internal.unknown
    assert registry.classify({"status": 418}) == "internal.unknown"


def test_should_keep_starter_priority_when_a_caller_adds_the_same_status() -> None:
    # Given a caller catalog that also claims 402
    app = define_errors(
        starter_pack,
        {"billing.card_declined": CatalogEntry(category=Category.PROVIDER, http_status=(402,))},
    )
    # When a 402 is classified
    # Then the first-registered starter code keeps priority (codes are stable)
    assert app.classify({"status": 402}) == "ai.provider.out_of_credits"


def test_should_honour_a_caller_supplied_match_predicate() -> None:
    # Given a caller catalog with a custom match rule
    def is_maintenance(raw: object) -> bool:
        return isinstance(raw, dict) and raw.get("code") == "MAINTENANCE"

    app = define_errors(
        {
            "app.maintenance": CatalogEntry(category=Category.PROVIDER, match=is_maintenance),
            "internal.unknown": CatalogEntry(category=Category.INTERNAL),
        }
    )
    # When a matching raw is classified
    # Then the custom predicate claims it
    assert app.classify({"code": "MAINTENANCE"}) == "app.maintenance"
