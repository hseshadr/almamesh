"""The signed strength receipt: the no-fake-precision covenant, now offline-verifiable.

AlmaMesh's calibrated ``strength_pct`` is a Layer-2 MODEL over exact BPHS inputs — the
covenant says a reader must always be able to see (and now PROVE) exactly what was
claimed. ``sign_domain_strength`` wraps ``avow.sign_payload`` around a frozen
``DomainStrengthSubject`` (domain + its full StrengthSummary, tier and note included),
producing an Ed25519 ``SignedReceipt`` any holder verifies offline against a pinned
public key — no network, no original chart inputs, no scientific stack (envelope only,
so the same kernel runs unmodified in Pyodide)."""

from __future__ import annotations

import pytest
from avow import generate_signing_key, public_key_hex
from avow.errors import ReplayMismatch, SignatureInvalid

from almamesh.constants.astrology import PlanetName
from almamesh.domains import (
    DomainStrengthSubject,
    sign_domain_strength,
    verify_domain_strength,
)
from almamesh.schemas.domains import LifeDomain, StrengthBand, StrengthSummary


def _summary() -> StrengthSummary:
    """A representative calibrated summary (career keyed on Saturn)."""
    return StrengthSummary(
        key_graha=PlanetName.SATURN,
        key_graha_rupas=6.2,
        key_graha_meets_minimum=True,
        sav_bindus=56,
        band=StrengthBand.MODERATE,
        shadbala_pct=72.0,
        sav_pct=50.0,
        strength_pct=50.0,
    )


def test_receipt_binds_domain_and_full_summary() -> None:
    """The signed subject carries the domain, headline %, tier and covenant note."""
    key = generate_signing_key()
    receipt = sign_domain_strength(LifeDomain.CAREER, _summary(), signing_key=key)
    subject = receipt.payload
    assert isinstance(subject, DomainStrengthSubject)
    assert subject.domain is LifeDomain.CAREER
    assert subject.summary.strength_pct == 50.0
    assert subject.summary.strength_tier == "model"  # never a measured fact
    assert subject.summary.approximated is True


def test_receipt_verifies_offline_against_pinned_key() -> None:
    """Holder + pinned public key suffice — verification needs nothing else."""
    key = generate_signing_key()
    receipt = sign_domain_strength(LifeDomain.CAREER, _summary(), signing_key=key)
    verify_domain_strength(receipt, expected_public_key=public_key_hex(key))


def test_receipt_rejects_unpinned_signer() -> None:
    """A receipt signed by any other key fails closed with a typed error."""
    receipt = sign_domain_strength(
        LifeDomain.CAREER, _summary(), signing_key=generate_signing_key()
    )
    other = public_key_hex(generate_signing_key())
    with pytest.raises(SignatureInvalid):
        verify_domain_strength(receipt, expected_public_key=other)


def test_receipt_detects_tampered_strength_pct() -> None:
    """Inflating the signed % breaks the content-hash — the covenant holds."""
    key = generate_signing_key()
    receipt = sign_domain_strength(LifeDomain.CAREER, _summary(), signing_key=key)
    inflated = receipt.payload.model_copy(
        update={"summary": _summary().model_copy(update={"strength_pct": 99.0})}
    )
    forged = receipt.model_copy(update={"payload": inflated})
    with pytest.raises(ReplayMismatch):
        verify_domain_strength(forged, expected_public_key=public_key_hex(key))


def test_identical_subjects_sign_deterministically() -> None:
    """No timestamps in the subject: same facts -> same hash and signature."""
    key = generate_signing_key()
    first = sign_domain_strength(LifeDomain.FINANCES, _summary(), signing_key=key)
    second = sign_domain_strength(LifeDomain.FINANCES, _summary(), signing_key=key)
    assert first.payload_hash == second.payload_hash
    assert first.signature == second.signature
