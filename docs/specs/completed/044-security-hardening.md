# Feature Specification: Security Hardening

**Feature Branch**: `044-security-hardening`
**Created**: 2026-01-11
**Status**: Draft
**Priority**: HIGH
**Overrides**: None

> **Precedence Rule**: Newer specs override older specs when there are contradictions. See SPEC-COMPLETION-TRACKING.md for governance rules.

---

## 1. Summary

Comprehensive security hardening of the AlmaMesh API to address CORS wildcard exposure, missing security headers, insufficient rate limiting granularity, and other security hygiene improvements. This spec focuses on defense-in-depth measures that complement existing authentication (Spec 023) and PII protection (Spec 015).

---

## 2. Requirements

### Must Have
- [ ] Replace `CORS=*` with explicit allowed origins in production
- [ ] Add security headers middleware (CSP, HSTS, X-Frame-Options, etc.)
- [ ] Implement per-endpoint and per-user rate limiting
- [ ] Enforce Pydantic strict mode on all API models
- [ ] Set maximum request body size limits
- [ ] Remove sensitive data from error responses in production
- [ ] Validate required secrets on startup

### Should Have
- [ ] Add audit logging for security-relevant events
- [ ] Configure session/token timeout policies
- [ ] Add Slowloris protection via timeout configuration
- [ ] Secret rotation support documentation

### Out of Scope
- Zero-trust architecture (covered in Spec 037)
- PII encryption at rest (covered in Spec 015)
- Clerk auth implementation details (covered in Spec 023)
- WAF/DDoS protection (infrastructure-level concern)

---

## 3. Technical Design

### 3.1 CORS Hardening

**Current State**: `backend/src/vedic_core/api/main.py` lines 520-556 show CORS configured via `config.get("cors_origins", ["*"])`. The `api/settings.py` defaults to `["*"]` for development convenience.

**Problem**: Wildcard CORS allows any origin to make authenticated requests, enabling CSRF-like attacks against authenticated users.

**Solution**: Enforce explicit origin whitelist in production.

#### Files to Modify

| File | Change |
|------|--------|
| `backend/src/vedic_core/api/settings.py` | Add `cors_origins_production` with strict defaults |
| `backend/src/vedic_core/api/main.py` | Fail startup if CORS=* in production (not just warn) |
| `backend/.env.example` | Document required CORS configuration |

#### Code Example: CORS Origin Validation

```python
# backend/src/vedic_core/api/settings.py

class APISettings(BaseSettings):
    # Development origins (used when environment != production)
    cors_origins_dev: list[str] = [
        "http://localhost:3000",
        "http://localhost:8081",
        "http://localhost:19006",
    ]

    # Production origins (MUST be set via VEDIC_CORS_ORIGINS in production)
    cors_origins: list[str] = ["*"]  # Sentinel - must be overridden

    @field_validator("cors_origins", mode="after")
    @classmethod
    def validate_cors_production(cls, v: list[str], info) -> list[str]:
        """Validate CORS origins are properly configured."""
        env = os.getenv("ALMAMESH_ENVIRONMENT",
                       os.getenv("VEDIC_ENVIRONMENT", "development"))
        if env.lower() == "production" and "*" in v:
            raise ValueError(
                "SECURITY ERROR: VEDIC_CORS_ORIGINS must be set to explicit "
                "origins in production. Wildcard (*) is not allowed. "
                "Example: VEDIC_CORS_ORIGINS=https://app.almamesh.com,https://almamesh.com"
            )
        return v
```

```python
# backend/src/vedic_core/api/main.py - in create_app()

# SECURITY: Fail fast if wildcard CORS in production
if (
    isinstance(cors_origins, list)
    and "*" in cors_origins
    and environment == "production"
):
    raise RuntimeError(
        "SECURITY ERROR: Cannot start with CORS=* in production. "
        "Set VEDIC_CORS_ORIGINS environment variable to an explicit allowlist."
    )
```

### 3.2 Security Headers Middleware

**Current State**: No security headers are set. Responses lack CSP, HSTS, X-Frame-Options.

**Solution**: Add a new security headers middleware.

#### New Files

| File | Purpose |
|------|---------|
| `backend/src/vedic_core/api/middleware/security_headers.py` | Security headers middleware |

#### Security Headers Configuration

```python
# backend/src/vedic_core/api/middleware/security_headers.py
"""
Security Headers Middleware for AlmaMesh API.

Implements OWASP security header recommendations.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Enable XSS filter (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions policy (disable unnecessary features)
        response.headers["Permissions-Policy"] = (
            "accelerometer=(), camera=(), geolocation=(), "
            "gyroscope=(), magnetometer=(), microphone=(), "
            "payment=(), usb=()"
        )

        # Content Security Policy (API only - no scripts)
        response.headers["Content-Security-Policy"] = (
            "default-src 'none'; "
            "frame-ancestors 'none'; "
            "form-action 'none'"
        )

        # HSTS - only in production with HTTPS
        # Note: This header is ignored over HTTP
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        return response
```

### 3.3 Rate Limiting Enhancement

**Current State**: `backend/src/vedic_core/api/rate_limiting.py` provides basic IP-based rate limiting via slowapi.

**Enhancement**: Add per-user rate limiting and endpoint-specific limits.

#### Files to Modify

| File | Change |
|------|--------|
| `backend/src/vedic_core/api/rate_limiting.py` | Add user-aware key function, endpoint limits config |
| `backend/src/vedic_core/api/routers/*.py` | Apply endpoint-specific rate limits |

#### Rate Limit Configuration

```python
# backend/src/vedic_core/api/rate_limiting.py

from vedic_core.api.clerk_auth import get_current_user_optional

def get_rate_limit_key(request: Request) -> str:
    """
    Get rate limit key based on user ID or IP address.

    Authenticated users get per-user limits.
    Anonymous requests use IP-based limits.
    """
    # Try to get user from request state (set by auth middleware)
    user_id = getattr(request.state, "user_id", None)
    if user_id:
        return f"user:{user_id}"

    # Fall back to IP address
    client = getattr(request, "client", None)
    return f"ip:{getattr(client, 'host', '127.0.0.1')}"


# Endpoint-specific rate limits
RATE_LIMITS = {
    # Chart generation is expensive
    "charts.generate": "10/minute",
    "charts.ask": "30/minute",

    # Auth endpoints need stricter limits
    "users.login": "5/minute",
    "users.register": "3/minute",
    "users.forgot_password": "3/minute",

    # Chat is rate-limited per user
    "chat.send": "60/minute",

    # Health checks exempt
    "health.*": None,

    # Default for unlisted endpoints
    "default": "100/minute",
}
```

### 3.4 Input Validation Hardening

**Current State**: Pydantic models exist but not all use strict mode.

**Solution**: Enable strict mode on all API request/response models and set max request body size.

#### Files to Modify

| File | Change |
|------|--------|
| `backend/src/vedic_core/api/models/*.py` | Add `model_config = ConfigDict(strict=True)` |
| `backend/src/vedic_core/api/main.py` | Add request body size limit middleware |

#### Request Body Size Limit

```python
# backend/src/vedic_core/api/middleware/request_size.py
"""Request body size limit middleware."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# 1MB default, configurable via environment
MAX_REQUEST_BODY_SIZE = int(os.getenv("MAX_REQUEST_BODY_BYTES", 1_048_576))


class RequestSizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests with bodies larger than the configured limit."""

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")

        if content_length and int(content_length) > MAX_REQUEST_BODY_SIZE:
            return JSONResponse(
                status_code=413,
                content={
                    "success": False,
                    "message": "Request body too large",
                    "error_type": "payload_too_large",
                    "max_bytes": MAX_REQUEST_BODY_SIZE,
                },
            )

        return await call_next(request)
```

### 3.5 Error Response Sanitization

**Current State**: Exception handlers in `main.py` may expose sensitive context in production.

**Solution**: Sanitize error responses in production to prevent information disclosure.

#### Files to Modify

| File | Change |
|------|--------|
| `backend/src/vedic_core/api/main.py` | Conditionally hide error details in production |

#### Sanitized Error Response

```python
# In exception handlers, check environment before including details

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle unexpected exceptions."""
    logger.error(f"Unexpected error in {request.url}: {exc}", exc_info=True)

    # Only include details in non-production
    is_production = environment == "production"

    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "message": "Internal server error" if is_production else str(exc),
            "error_type": "server_error",
            # Never expose stack traces or exception details in production
        },
    )
```

### 3.6 Secrets Validation on Startup

**Current State**: Missing secrets may cause cryptic runtime errors.

**Solution**: Validate required secrets exist and are non-empty at startup.

#### New Files

| File | Purpose |
|------|---------|
| `backend/src/vedic_core/infrastructure/secrets_validator.py` | Startup secrets validation |

#### Secrets Validation

```python
# backend/src/vedic_core/infrastructure/secrets_validator.py
"""
Secrets validation for startup safety.

Ensures all required secrets are configured before the application starts,
preventing cryptic runtime errors.
"""

import os
import sys
from typing import NamedTuple


class SecretRequirement(NamedTuple):
    """Secret requirement specification."""
    name: str
    required_in_production: bool
    description: str


# Required secrets by environment
REQUIRED_SECRETS = [
    SecretRequirement(
        "CLERK_SECRET_KEY",
        required_in_production=True,
        description="Clerk authentication secret key",
    ),
    SecretRequirement(
        "DATABASE_URL",
        required_in_production=True,
        description="PostgreSQL connection URL",
    ),
    SecretRequirement(
        "VEDIC_CORS_ORIGINS",
        required_in_production=True,
        description="Allowed CORS origins (comma-separated)",
    ),
    SecretRequirement(
        "OPENROUTER_API_KEY",
        required_in_production=True,
        description="OpenRouter API key for LLM access",
    ),
]


def validate_secrets(environment: str) -> list[str]:
    """
    Validate required secrets are present.

    Args:
        environment: Current environment (production, development, etc.)

    Returns:
        List of missing secret names (empty if all present)
    """
    is_production = environment.lower() in ("production", "prod")
    missing = []

    for secret in REQUIRED_SECRETS:
        if is_production and secret.required_in_production:
            value = os.getenv(secret.name)
            if not value or value.strip() == "":
                missing.append(f"{secret.name}: {secret.description}")

    return missing


def validate_secrets_or_exit(environment: str) -> None:
    """
    Validate secrets and exit with error if missing in production.

    Args:
        environment: Current environment
    """
    missing = validate_secrets(environment)

    if missing:
        print(
            "[STARTUP ERROR] Missing required secrets:",
            file=sys.stderr,
        )
        for secret in missing:
            print(f"  - {secret}", file=sys.stderr)
        print(
            "\nSet these environment variables before starting the application.",
            file=sys.stderr,
        )
        sys.exit(1)
```

### 3.7 Audit Logging

**Current State**: Logging exists but lacks structured security event tracking.

**Solution**: Add security-specific audit logging.

#### Files to Modify

| File | Change |
|------|--------|
| `backend/src/vedic_core/logging_utils.py` | Add security audit logger |
| `backend/src/vedic_core/api/routers/users/*.py` | Log auth events |

#### Security Audit Events

```python
# Security events to log:
# - LOGIN_SUCCESS: User authenticated successfully
# - LOGIN_FAILURE: Authentication failed (with reason)
# - LOGOUT: User logged out
# - TOKEN_REFRESH: Token was refreshed
# - RATE_LIMIT_HIT: Rate limit exceeded
# - AUTH_BYPASS_ATTEMPT: Suspicious auth patterns
# - CORS_VIOLATION: Request from non-allowed origin
# - ADMIN_ACTION: Administrative operations
```

---

## 4. Implementation Checkpoints

**CRITICAL: Follow these checkpoints IN ORDER. Test after EACH checkpoint.**

| # | Checkpoint | Files Changed | Test Command | Pass Criteria |
|---|------------|---------------|--------------|---------------|
| 1 | CORS origin whitelist | 2 files | `pytest tests/test_api/test_cors.py -xvs` | Tests pass, startup fails with CORS=* in prod mock |
| 2 | Security headers middleware | 2 files | `pytest tests/test_api/test_security_headers.py -xvs` | All headers present in responses |
| 3 | Rate limiting enhancement | 2 files | `pytest tests/core/test_rate_limiting_slowapi.py -xvs` | Per-user limits work |
| 4 | Request size limit | 2 files | `pytest tests/test_api/test_request_size.py -xvs` | 413 returned for oversized requests |
| 5 | Pydantic strict mode | 5+ files | `pytest tests/test_api/ -xvs` | No type coercion in models |
| 6 | Error response sanitization | 1 file | `pytest tests/test_api/test_error_handling.py -xvs` | No details in prod errors |
| 7 | Secrets validation | 2 files | `pytest tests/test_api/test_startup.py -xvs` | Startup fails with missing secrets in prod |
| 8 | Full integration test | - | `make test` | All tests pass |
| 9 | Security review | - | `Task(security-auditor)` | No blockers |

### Checkpoint Details

#### Checkpoint 1: CORS Origin Whitelist

```
What to do:
- Add field_validator to APISettings to reject CORS=* in production
- Update main.py to raise RuntimeError instead of just warning
- Add VEDIC_CORS_ORIGINS to .env.example with documentation

Test:
$ ALMAMESH_ENVIRONMENT=production VEDIC_CORS_ORIGINS=* pytest tests/test_api/test_cors.py -xvs

Expected: Startup validation error raised
```

#### Checkpoint 2: Security Headers Middleware

```
What to do:
- Create backend/src/vedic_core/api/middleware/security_headers.py
- Add middleware to main.py create_app()
- Create test file for header validation

Test:
$ pytest tests/test_api/test_security_headers.py -xvs

Expected: All security headers present in response
```

#### Checkpoint 3: Rate Limiting Enhancement

```
What to do:
- Add user-aware key function to rate_limiting.py
- Configure endpoint-specific limits
- Update test to verify per-user limits

Test:
$ pytest tests/core/test_rate_limiting_slowapi.py -xvs

Expected: Different users get separate rate limit buckets
```

#### Checkpoint 4: Request Size Limit

```
What to do:
- Create request_size.py middleware
- Add to main.py middleware stack
- Create test with oversized request body

Test:
$ pytest tests/test_api/test_request_size.py -xvs

Expected: 413 response for bodies > MAX_REQUEST_BODY_SIZE
```

#### Checkpoint 5: Pydantic Strict Mode

```
What to do:
- Add model_config = ConfigDict(strict=True) to request models
- Update any models relying on implicit type coercion
- Fix tests that send wrong types

Test:
$ pytest tests/test_api/ -xvs

Expected: All tests pass with strict validation
```

#### Checkpoint 6: Error Response Sanitization

```
What to do:
- Update exception handlers to check environment
- Remove exc.context from production responses
- Add tests for production vs development error responses

Test:
$ ALMAMESH_ENVIRONMENT=production pytest tests/test_api/test_error_handling.py -xvs

Expected: No stack traces or detailed errors in production responses
```

#### Checkpoint 7: Secrets Validation

```
What to do:
- Create secrets_validator.py
- Call validate_secrets_or_exit() in lifespan startup
- Add test for missing secrets detection

Test:
$ pytest tests/test_api/test_startup.py -xvs

Expected: Startup aborts with clear error for missing secrets
```

---

## 5. Testing Strategy

### Unit Tests
- [ ] `tests/test_api/test_cors.py`: CORS validation in production
- [ ] `tests/test_api/test_security_headers.py`: All headers present
- [ ] `tests/test_api/test_request_size.py`: Size limit enforcement
- [ ] `tests/test_api/test_error_handling.py`: Error sanitization

### Integration Tests
- [ ] `tests/integration/test_security_middleware.py`: Full middleware stack
- [ ] `tests/integration/test_rate_limiting.py`: Per-user rate limits

### Manual Verification
- [ ] Deploy to staging with production CORS config
- [ ] Verify security headers with `curl -I https://api.staging.almamesh.com/api/v1/health`
- [ ] Test rate limiting with repeated requests
- [ ] Verify startup fails without required secrets

---

## 6. Rollback Plan

If issues arise:

1. **CORS breaks frontend**: Temporarily add frontend origin to VEDIC_CORS_ORIGINS
2. **Rate limiting too aggressive**: Adjust limits in RATE_LIMITS config
3. **Security headers break clients**: Remove problematic header from middleware
4. **Startup validation blocks deploy**: Set all required secrets in environment

Emergency bypass (temporary only):
```bash
# NOT FOR PRODUCTION - development/debugging only
export ALMAMESH_ENVIRONMENT=development
```

---

## 7. Definition of Done

- [ ] All checkpoints completed and tested
- [ ] Full test suite passes (`make test`)
- [ ] Security audit passed (no BLOCK findings)
- [ ] Code quality checks pass (ruff, mypy)
- [ ] `.env.example` updated with all new required variables
- [ ] CORS properly configured in staging and production environments
- [ ] Security headers verified with external scanner (e.g., securityheaders.com)
- [ ] PR reviewed and merged
