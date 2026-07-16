"""The optional 18-code starter pack, transcribed from ``errors-registry.json``.

It is an OPTIONAL starter pack, not a mandate: a site may
``define_errors({**dict(starter_pack), **own_codes})`` to avoid re-declaring the
common ones, then add its own. Three codes carry the AlmaMesh-proven ``match``
rules for failures that have no HTTP status: an aborted/timed-out request, a
network/connection failure, and a pre-egress privacy block.

The codes, categories, HTTP statuses and params here are the Python side of the
TS/Python parity contract — they must stay identical to ``@edgeproc/errors``.
"""

from __future__ import annotations

import re
from typing import Final

from shared_libs_python.errors.raw import error_name_of, error_text_of, http_status_of
from shared_libs_python.errors.types import Catalog, CatalogEntry, Category

_NETWORK_TEXT: Final[re.Pattern[str]] = re.compile(
    r"failed to fetch|load failed|networkerror|connection", re.IGNORECASE
)
_TIMEOUT_TEXT: Final[re.Pattern[str]] = re.compile(r"timeout|timed out", re.IGNORECASE)
_TIMEOUT_NAMES: Final[frozenset[str]] = frozenset({"AbortError", "TimeoutError"})


def _is_timeout(raw: object) -> bool:
    """An aborted or timed-out request: by exception name or by text."""
    if error_name_of(raw) in _TIMEOUT_NAMES:
        return True
    return bool(_TIMEOUT_TEXT.search(error_text_of(raw)))


def _is_privacy_violation(raw: object) -> bool:
    """A pre-egress privacy block, matched by the guard's exception name."""
    return error_name_of(raw) == "PrivacyViolationError"


def _is_network(raw: object) -> bool:
    """A network/connection failure that carries no HTTP status."""
    return http_status_of(raw) is None and bool(_NETWORK_TEXT.search(error_text_of(raw)))


#: The 18 universal codes (``ai.*``, ``net.*``, ``bundle.*``, ``config.*``, ``internal``).
starter_pack: Catalog = {
    "ai.config.no_key": CatalogEntry(
        category=Category.CONFIG,
        en="No AI provider key is set. Add your key in Settings → AI to turn on "
        "the optional AI features.",
    ),
    "ai.provider.unauthorized": CatalogEntry(
        category=Category.CONFIG,
        http_status=(401, 403),
        en="Your AI provider key was rejected. Check the key in Settings → AI.",
    ),
    "ai.provider.out_of_credits": CatalogEntry(
        category=Category.PROVIDER,
        http_status=(402,),
        params=("creditsLeft", "creditsTotal", "currency"),
        en="Your provider account is out of credits. Add credits and try again.",
    ),
    "ai.provider.rate_limited": CatalogEntry(
        category=Category.PROVIDER,
        http_status=(429,),
        params=("retryAfter",),
        en="The AI provider is rate-limiting requests. Wait a moment and try again.",
    ),
    "ai.provider.server_error": CatalogEntry(
        category=Category.PROVIDER,
        http_status=(500, 502, 503, 504),
        en="The AI provider had a server error. Try again shortly.",
    ),
    "ai.model.unavailable": CatalogEntry(
        category=Category.CONFIG,
        http_status=(404,),
        params=("model",),
        en="The selected model isn't available. Pick another model in Settings → AI.",
    ),
    "ai.request.timeout": CatalogEntry(
        category=Category.TIMEOUT,
        en="The AI request timed out. Try again.",
        match=_is_timeout,
    ),
    "ai.request.cancelled": CatalogEntry(
        category=Category.INTERNAL,
        en="The AI request was cancelled.",
    ),
    "ai.privacy.violation": CatalogEntry(
        category=Category.CONFIG,
        en="The request was blocked to protect your private data before it left this device.",
        match=_is_privacy_violation,
    ),
    "net.unreachable": CatalogEntry(
        category=Category.NETWORK,
        en="Couldn't reach the server. Check your connection and try again.",
        match=_is_network,
    ),
    "bundle.download_failed": CatalogEntry(
        category=Category.NETWORK,
        en="Couldn't download the data bundle. Check your connection and retry.",
    ),
    "bundle.integrity_failed": CatalogEntry(
        category=Category.INTEGRITY,
        params=("chunk",),
        en="A downloaded file failed its integrity check. Retry to re-fetch it.",
    ),
    "bundle.quota_exceeded": CatalogEntry(
        category=Category.DEVICE,
        params=("requiredBytes", "availableBytes"),
        en="Not enough free storage to load the data on this device. Free up space "
        "and retry, or use a desktop browser.",
    ),
    "bundle.device_unsupported": CatalogEntry(
        category=Category.DEVICE,
        params=("reason",),
        en="This device or browser can't run the local engine. Try a recent desktop browser.",
    ),
    "bundle.timeout": CatalogEntry(
        category=Category.TIMEOUT,
        en="Loading the data timed out. Retry, or try on a desktop browser.",
    ),
    "config.missing": CatalogEntry(
        category=Category.CONFIG,
        params=("field",),
        en="A required setting is missing: {field}.",
    ),
    "config.invalid": CatalogEntry(
        category=Category.CONFIG,
        params=("field",),
        en="A setting is invalid: {field}.",
    ),
    "internal.unknown": CatalogEntry(
        category=Category.INTERNAL,
        en="Something went wrong. Try again.",
    ),
}
