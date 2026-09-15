"""Which model answers which pass, and what happens when one of them cannot.

Both providers speak the same dialect, so this is not about the wire format. It is
about four promises the rest of the builder now relies on:

* A pass names the providers it prefers, and the first choice is the one a *failed*
  generation gets attributed to. Naming a hardcoded provider there would put a
  model in the ledger that was never called.
* One key is enough. A pass whose preferred provider is missing is served by the
  one that is, rather than failing with a message about a provider nobody asked for.
* The request count is bounded at two, whichever way it goes. A retry and a
  fallback are two ways of spending the same budget rather than two budgets, because
  the alternative is a bad minute at the provider doubling a wait the customer has
  already made.
* Switched off and no credential are different failures with different fixes, and
  the message says which one happened.

Run with `python scripts/check_providers.py`. No network, no database, no API key.
"""

from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path
from types import SimpleNamespace

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

from kleelab.core.config import settings  # noqa: E402
from kleelab.services import llm  # noqa: E402

FAILURES = 0
_real_httpx = llm.httpx


def fail(message: str) -> None:
    global FAILURES
    FAILURES += 1
    print(f"FAIL  {message}")


def check(message: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"PASS  {message}")
    else:
        fail(f"{message} - {detail}" if detail else message)


# --- a provider that is not the network ---------------------------------------


def answer(content: object, status: int = 200) -> httpx.Response:
    """A provider reply carrying `content` as the assistant's message."""

    if not isinstance(content, str):
        content = json.dumps(content)
    return httpx.Response(
        status_code=status,
        json={
            "model": "served-by-the-provider",
            "choices": [{"message": {"content": content}}],
            "usage": {"prompt_tokens": 3, "completion_tokens": 5},
        },
    )


class Transport:
    """Stands in for httpx. Records every request and replays a script.

    Replacing the module attribute rather than the real httpx is deliberate: a
    check that rewires a library the whole process shares will eventually surprise
    whichever check runs after it.
    """

    def __init__(self, *script: object) -> None:
        self.script = list(script)
        self.calls: list[tuple[str, str]] = []

    def install(self) -> None:
        transport = self

        class Client:
            def __init__(self, *args: object, **kwargs: object) -> None:
                pass

            async def __aenter__(self) -> "Client":
                return self

            async def __aexit__(self, *exc: object) -> bool:
                return False

            async def post(
                self, url: str, json: object = None, headers: object = None
            ) -> object:
                model = (json or {}).get("model", "") if isinstance(json, dict) else ""
                transport.calls.append((url, str(model)))
                if not transport.script:
                    return answer({"unexpected": "no reply left in the script"})
                step = transport.script.pop(0)
                if isinstance(step, Exception):
                    raise step
                return step

        llm.httpx = SimpleNamespace(AsyncClient=Client, HTTPError=httpx.HTTPError)


def configure(*, enabled: bool = True, deepseek: str | None = "dsk", gemini: str | None = None) -> None:
    """Set the three switches this module reads, and nothing else."""

    settings.AI_ENABLED = enabled
    settings.DEEPSEEK_API_KEY = deepseek
    settings.GEMINI_API_KEY = gemini


def ask(task: str) -> object:
    return asyncio.run(llm.complete_json(system="Return json.", user="Say hello.", task=task))


def reason(task: str = "brief") -> str:
    """The message from a refusal, for asserting on which failure it was."""

    try:
        ask(task)
    except llm.LLMError as error:
        return str(error)
    return ""


# --- the checks ---------------------------------------------------------------


def switched_off_and_unconfigured_are_different() -> None:
    configure(enabled=False, deepseek="dsk")
    check(
        "switched off with a key present is still switched off",
        not llm.available(),
        llm.configured_providers(),
    )
    check(
        "and says so, rather than blaming the credential",
        "switched off" in reason(),
        reason(),
    )

    configure(enabled=True, deepseek=None, gemini=None)
    check("no key at all is not available", not llm.available())
    check("and the registry is empty", llm.configured_providers() == ())
    check(
        "and the message names the missing credential instead",
        "credential" in reason(),
        reason(),
    )


def one_key_is_enough() -> None:
    configure(enabled=True, deepseek=None, gemini="gmk")
    check("one key makes the builder available", llm.available())
    check("and the registry names it", llm.configured_providers() == ("gemini",))

    passes = ("brief", "content", "edit", "compose", "design")
    check(
        "every pass can name a model with only the one key",
        all(llm.preferred_model(task) for task in passes),
        ", ".join(f"{t}={llm.preferred_model(t)!r}" for t in passes),
    )
    check(
        "including the passes that do not prefer it",
        llm.preferred_model("compose") == settings.GEMINI_MODEL,
        llm.preferred_model("compose"),
    )

    configure(enabled=True, deepseek="dsk", gemini=None)
    check(
        "the same holds the other way round",
        llm.preferred_model("compose") == settings.DEEPSEEK_MODEL,
        llm.preferred_model("compose"),
    )


def both_keys_split_the_work() -> None:
    configure(enabled=True, deepseek="dsk", gemini="gmk")
    check(
        "the registry names both, in preference order",
        llm.configured_providers() == ("deepseek", "gemini"),
        str(llm.configured_providers()),
    )
    check(
        "prose passes start on the prose model",
        llm.preferred_model("content") == settings.DEEPSEEK_MODEL,
        llm.preferred_model("content"),
    )
    check(
        "whole-page passes start on the reasoning model",
        llm.preferred_model("compose") == settings.GEMINI_MODEL,
        llm.preferred_model("compose"),
    )
    check(
        "an undeclared pass behaves as it did before providers were split",
        llm.preferred_model() == settings.DEEPSEEK_MODEL,
        llm.preferred_model(),
    )


def a_bad_answer_is_retried_once() -> None:
    configure(enabled=True, deepseek="dsk", gemini=None)
    transport = Transport(answer("I am afraid I cannot do that"), answer({"ok": True}))
    transport.install()

    result = ask("brief")
    check("a malformed answer is retried rather than discarded", result.data == {"ok": True})
    check(
        "and the retry goes to the same provider, since that is the one being retried",
        len(transport.calls) == 2 and transport.calls[0] == transport.calls[1],
        str(transport.calls),
    )
    check(
        "and it does not outlive its budget",
        len(transport.calls) == 2,
        f"{len(transport.calls)} requests",
    )

    transport = Transport(answer("nope"), answer("still nope"))
    transport.install()
    try:
        ask("brief")
        fail("two unusable answers should refuse the turn")
    except llm.LLMRefused:
        print("PASS  two unusable answers refuse the turn")
    check(
        "and the refusal costs exactly two requests",
        len(transport.calls) == 2,
        f"{len(transport.calls)} requests",
    )


def a_failing_provider_hands_over() -> None:
    configure(enabled=True, deepseek="dsk", gemini="gmk")

    transport = Transport(answer({}, status=500), answer({"ok": True}))
    transport.install()
    result = ask("brief")
    check("a server error hands the pass to the other provider", result.data == {"ok": True})
    check("and the result says which provider served it", result.provider == "gemini", result.provider)
    check("and records the pass it served", result.task == "brief", result.task)

    transport = Transport(httpx.ConnectError("unreachable"), answer({"ok": True}))
    transport.install()
    result = ask("brief")
    check("so does an unreachable host", result.provider == "gemini", result.provider)


def the_budget_is_two_whichever_way() -> None:
    """The property that makes the fallback safe to have at all."""

    shapes = {
        "two providers, first fails": ("dsk", "gmk", "brief", [answer({}, 500), answer({})]),
        "two providers, first unusable": ("dsk", "gmk", "brief", [answer("x"), answer({})]),
        "one provider, first unusable": ("dsk", None, "brief", [answer("x"), answer({})]),
        "two providers, compose prefers the second": (
            "dsk",
            "gmk",
            "compose",
            [answer({}, 500), answer({})],
        ),
    }

    for label, (deepseek, gemini, task, script) in shapes.items():
        configure(enabled=True, deepseek=deepseek, gemini=gemini)
        transport = Transport(*script)
        transport.install()
        ask(task)
        check(
            f"at most two requests: {label}",
            len(transport.calls) <= 2,
            f"{len(transport.calls)} requests",
        )


def everyone_down_still_refuses_honestly() -> None:
    configure(enabled=True, deepseek="dsk", gemini="gmk")
    transport = Transport(answer({}, 500), answer({}, 500))
    transport.install()
    try:
        ask("brief")
        fail("two dead providers should not produce an answer")
    except llm.LLMError as error:
        check("two dead providers refuse with a message a customer can read", "try again" in str(error).lower())
    check(
        "and both were actually tried",
        len(transport.calls) == 2,
        f"{len(transport.calls)} requests",
    )
    check(
        "and they were different hosts",
        transport.calls[0][0] != transport.calls[1][0],
        str(transport.calls),
    )


def the_ledger_names_a_real_model() -> None:
    """`preferred_model` labels failed rows, where there is no result to read from."""

    configure(enabled=True, deepseek="dsk", gemini=None)
    check(
        "with one key the ledger names that model, not the absent one",
        llm.preferred_model("brief") == settings.DEEPSEEK_MODEL,
        llm.preferred_model("brief"),
    )
    configure(enabled=True, deepseek=None, gemini=None)
    check(
        "with no key it names nothing rather than inventing one",
        llm.preferred_model("brief") == "",
        llm.preferred_model("brief"),
    )


def main() -> int:
    original = (
        settings.AI_ENABLED,
        settings.DEEPSEEK_API_KEY,
        settings.GEMINI_API_KEY,
    )
    try:
        switched_off_and_unconfigured_are_different()
        one_key_is_enough()
        both_keys_split_the_work()
        a_bad_answer_is_retried_once()
        a_failing_provider_hands_over()
        the_budget_is_two_whichever_way()
        everyone_down_still_refuses_honestly()
        the_ledger_names_a_real_model()
    finally:
        (
            settings.AI_ENABLED,
            settings.DEEPSEEK_API_KEY,
            settings.GEMINI_API_KEY,
        ) = original
        llm.httpx = _real_httpx

    print()
    if FAILURES:
        print(f"{FAILURES} failure(s).")
        return 1
    print("All provider checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
