"""Integration: the REAL predictive entry point seals every domain strength.

WHY this exists: ``sign_domain_strength`` was built, unit-tested, and then never
called by anything but its own unit test — a signing seam that could rot silently
while the gate stayed green. This test drives the actual production entry point the
in-browser chart Worker calls (``almamesh.predictive.compute_predictive_contexts``,
via ``_almamesh_compute_predictive`` in chartWorker.ts) and proves a *verifiable*
receipt comes out the other side for every life domain.

The signing key is a REQUIRED keyword argument on the entry point — there is no
ambient lookup, no env var and no feature flag, so a caller cannot silently opt out
and leave the seam dead. Verification pins the signer's public key, exactly as an
offline holder would.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from avow import generate_signing_key, public_key_hex
from avow.errors import ReplayMismatch, SignatureInvalid

from almamesh.domains import DomainStrengthSubject, verify_domain_strength
from almamesh.predictive import compute_predictive_contexts
from almamesh.schemas.domains import LifeDomain

# One pinned instant so the payload is reproducible (no silent wall clock).
REFERENCE_INSTANT = datetime(2026, 6, 9, 12, 0, 0, tzinfo=UTC)
BIRTH = datetime(1990, 1, 15, 12, 0, 0, tzinfo=UTC)
LATITUDE = 28.6139  # Delhi — the canonical parity fixture
LONGITUDE = 77.2090


def _compute(signing_key: object) -> object:
    """Drive the real entry point at the pinned instant with an injected signer."""
    return compute_predictive_contexts(
        BIRTH, LATITUDE, LONGITUDE, REFERENCE_INSTANT, signing_key=signing_key
    )


def test_predictive_entry_seals_every_domain_with_a_verifiable_receipt() -> None:
    """Every life domain comes back with a receipt that verifies against the signer."""
    key = generate_signing_key()
    contexts = _compute(key)
    receipts = contexts.domain_strength_receipts

    assert set(receipts) == set(LifeDomain), "every domain must be sealed"
    for domain, receipt in receipts.items():
        assert isinstance(receipt.payload, DomainStrengthSubject)
        assert receipt.payload.domain is domain
        verify_domain_strength(receipt, expected_public_key=public_key_hex(key))


def test_receipt_seals_the_exact_computed_summary_no_new_number() -> None:
    """The sealed subject IS the computed summary — signing invents no new value."""
    key = generate_signing_key()
    contexts = _compute(key)
    for domain, forecast in contexts.domains_context.forecasts.items():
        sealed = contexts.domain_strength_receipts[domain].payload.summary
        assert sealed == forecast.strength_summary


def test_tampering_with_a_sealed_strength_pct_breaks_verification() -> None:
    """Inflating a sealed headline % fails the content hash — the covenant holds."""
    key = generate_signing_key()
    receipt = _compute(key).domain_strength_receipts[LifeDomain.CAREER]
    inflated = receipt.payload.summary.model_copy(update={"strength_pct": 99.0})
    forged = receipt.model_copy(
        update={"payload": receipt.payload.model_copy(update={"summary": inflated})}
    )
    with pytest.raises(ReplayMismatch):
        verify_domain_strength(forged, expected_public_key=public_key_hex(key))


def test_receipts_reject_an_unpinned_signer() -> None:
    """A receipt only verifies against the key that actually signed it."""
    receipt = _compute(generate_signing_key()).domain_strength_receipts[LifeDomain.CAREER]
    with pytest.raises(SignatureInvalid):
        verify_domain_strength(receipt, expected_public_key=public_key_hex(generate_signing_key()))


def test_signing_key_is_required_so_the_seam_cannot_go_dead() -> None:
    """Omitting the key is a TypeError — no ambient default, no silent opt-out."""
    with pytest.raises(TypeError):
        compute_predictive_contexts(BIRTH, LATITUDE, LONGITUDE, REFERENCE_INSTANT)  # type: ignore[call-arg]
