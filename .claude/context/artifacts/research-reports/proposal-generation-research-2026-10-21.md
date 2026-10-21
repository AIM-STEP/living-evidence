<!-- Agent: Codex | Task: Proposal reliability/performance | Session: 2026-10-21 -->
# Proposal generation: current-service configuration

## Executive summary
The current 31B local model runs with an actual 16,384-token context. The previous browser pipeline required a planning request and seven chapter batches, plus small-packet summarization and retries. The revised browser configuration removes the separate plan, uses three fixed-key chapter batches and at most two concurrent requests, and enlarges safe source packets. The current backend already accepts JSON schemas, so these changes require only website deployment and refresh. The user explicitly requested no service restart; proposed backend changes were withdrawn.

## Method and sources
Five focused queries covered Ollama structured outputs, API completion metrics, context sizing, parallel/KV-cache memory, and Gemma prompting. Existing proposal modules, context collection, local server implementation, deployment instructions and service logs were inspected. No internal research report already covered this proposal pipeline.

- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs): submit JSON schema in `format`, describe the schema in the prompt, and validate the response. The existing service forwards schemas; no new framework is needed.
- [Ollama chat API](https://docs.ollama.com/api/chat): provides completion reasons, token counts and timing on native responses. The current bridge strips these fields; browser timing cannot be confused with native generation timing.
- [Ollama context length](https://docs.ollama.com/context-length): allocated context and memory matter, not just the model's advertised maximum. The running model reports 16,384 tokens; retain that budget rather than blindly increasing it.
- [Ollama FAQ](https://docs.ollama.com/faq): parallel requests increase context memory. Existing project service configuration already supports four slots; cap this browser pipeline at two and do not alter global runtime settings.
- [Gemma 4 prompt formatting](https://ai.google.dev/gemma/docs/core/prompt-formatting-gemma4): system instructions are supported and reasoning behavior is configurable. Retain the existing no-thinking server setting.

## Decisions and existing patterns
| Decision | Reason/evidence |
|---|---|
| Fixed chapter keys, required/nonempty strings | Array item enums cannot require every chapter ID exactly once. Schema guidance: Ollama structured outputs. Runtime still validates and accepts legacy arrays. |
| Three groups, two workers | Remove an unnecessary model-written plan and serial request overhead while preserving all 14 sections. Concurrency follows existing four-slot service configuration and Ollama FAQ memory guidance. |
| Stable system prompt, source data before variable section/schema suffix | Makes repeated source prefixes reusable where runtime caching supports them. No cache-hit or latency guarantee is claimed. |
| Raw input budget 7,000 estimated tokens; packets 5,000 | Leave room for instructions, schema and 4,096-token output inside actual 16K context. Existing conservative Unicode cost estimator is retained. |
| No backend restart/model installation/global tuning | Existing format support is sufficient; matches user's explicit constraint. Model and service remain unchanged. |
| Retain checkpoints, source-change guards, cancellation and storage rollback | Existing workflow invariants; lower latency must not silently overwrite changed input or lose work. |

## Validation and practical limits
- 41 proposal tests pass; one optional full real-model test is skipped in the regular suite. Added fixed-key, capped concurrency, stable-system-prompt and token-limit recovery cases.
- Native real-model short-output smoke: four required chapter keys, `done_reason=stop`, 147 output tokens, 19.64 seconds total, 16.88 tokens/s during decode. This is a short synthetic smoke, not full-proposal speed.
- Current unchanged local bridge also returned all four nonempty chapter fields in a synthetic short-output smoke, validated by the actual browser parser and section validator.
- A full-size request through the bridge exceeded the execution tool's 30-second network allowance, so full real-model PDF generation latency remains unmeasured. Do not claim it passed.
- Normal input model calls decrease from eight to three (62.5% fewer requests); this is not a measured 62.5% latency improvement. Long inputs and retries still add calls.

## Risks and mitigations
Larger chapter groups can hit output limits: keep instructions concise, require every key and fall back to individual missing sections. Two concurrent requests can compete with other active tools: cap workers at two and propagate Stop/failure to sibling browser requests. Larger raw budgets can overflow unusually token-dense input: retain conservative Unicode estimation and bounded reduction. Client cancellation does not guarantee cancellation of an already running request in the unchanged legacy server.

## Implementation roadmap
Deploy the browser modules; refresh when no generation task is running. Repeat the optional full-model acceptance run in an execution environment that permits a connection longer than 30 seconds. Use a representative synthetic long-material fixture and measure total time, retries and all chapter fields before making performance claims.

## Academic references
No academic performance claims are used; implementation is based on the primary vendor documentation above and project-specific measurements.
