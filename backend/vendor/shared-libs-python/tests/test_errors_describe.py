"""``describe()`` — i18n resolution + default-English interpolation fallback."""

from __future__ import annotations

from shared_libs_python.errors import CatalogEntry, Category, Params, define_errors, starter_pack

registry = define_errors(starter_pack)


def test_should_call_t_with_the_error_key_and_params_and_return_its_output() -> None:
    # Given a consumer-provided i18next-style translator
    calls: list[tuple[str, Params]] = []

    def translate(key: str, params: Params) -> str:
        calls.append((key, params))
        return f"[{key}] credits={params.get('creditsLeft', '?')}"

    # When describe() resolves a code with params through it
    out = registry.describe("ai.provider.out_of_credits", {"creditsLeft": 0}, translate)
    # Then t is called with errors.<code> + params, and its output is returned
    assert calls == [("errors.ai.provider.out_of_credits", {"creditsLeft": 0})]
    assert out == "[errors.ai.provider.out_of_credits] credits=0"


def test_should_fall_back_to_default_english_when_t_returns_the_key_unchanged() -> None:
    # Given a translator that echoes the key (i18next's missing-resource behaviour)
    def echo_key(key: str, _params: Params) -> str:
        return key

    # When describe() resolves through it
    out = registry.describe("ai.provider.out_of_credits", {}, echo_key)
    # Then the catalog default English is used instead
    assert out == "Your provider account is out of credits. Add credits and try again."


def test_should_return_default_english_when_no_translator_supplied() -> None:
    # Given no translator
    # When describe() resolves a code
    # Then the catalog default English is returned
    assert registry.describe("net.unreachable") == (
        "Couldn't reach the server. Check your connection and try again."
    )


def test_should_interpolate_single_brace_params_into_default_english() -> None:
    # Given a code whose default English has a {field} placeholder
    # When describe() is given that param
    # Then the placeholder is filled
    assert registry.describe("config.missing", {"field": "apiKey"}) == (
        "A required setting is missing: apiKey."
    )


def test_should_leave_placeholder_untouched_when_its_param_is_absent() -> None:
    # Given a code with a placeholder but no param supplied
    # When describe() resolves it
    # Then the placeholder is left verbatim
    assert registry.describe("config.missing") == "A required setting is missing: {field}."


def test_should_return_the_code_as_last_resort_when_no_default_english() -> None:
    # Given a bare code with no default English
    reg = define_errors({"app.bare": CatalogEntry(category=Category.INTERNAL)})
    # When describe() resolves it
    # Then the code itself is the last-resort text
    assert reg.describe("app.bare") == "app.bare"


def test_should_use_a_registered_i18n_key_override() -> None:
    # Given a code with an explicit i18n key override
    reg = define_errors(
        {"app.x": CatalogEntry(category=Category.INTERNAL, i18n_key="custom.key", en="X")}
    )
    seen: list[str] = []

    def translate(key: str, _params: Params) -> str:
        seen.append(key)
        return "translated"

    # When describe() resolves through a translator
    out = reg.describe("app.x", {}, translate)
    # Then the override key is used, not errors.<code>
    assert seen == ["custom.key"]
    assert out == "translated"
