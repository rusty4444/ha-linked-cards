# Validation log

## Automated validation

Command:

```bash
npm run check && python3 -m py_compile custom_components/linked_cards/*.py
```

Coverage:

- Template-id safety validation.
- Recursive variable substitution in strings, object keys, arrays, and nested cards.
- Template default variables overridden by linked-card instance variables.
- Failure on invalid stored templates with no `card` object.
- Package smoke test for Home Assistant manifest and API/static paths.
- ESBuild bundle output.
- Python syntax compilation for the Home Assistant custom component.
- Codex CLI review found install-flow, admin-auth, XSS, payload-limit and release-hygiene issues; these were fixed before publication.
- Follow-up automated validation passed after those fixes.

## Manual design review checklist

- No external network calls.
- No secrets or credentials stored in the repo.
- Templates are stored inside the Home Assistant instance via `homeassistant.helpers.storage.Store`.
- API endpoints require normal Home Assistant authentication.
- Mutating API endpoints require a Home Assistant administrator.
- Template IDs reject path traversal and unsafe characters.
- Template payloads have size, depth, count and `card.type` validation.
- Frontend error/status rendering uses text nodes for user-controlled values.
- Child cards are rendered through Home Assistant frontend card helpers rather than custom HTML reconstruction.

## Independent model validation runs

The project was reviewed with multiple AI/code-review passes after implementation:

1. Primary implementation review by Hermes/Codex session.
2. Codex CLI repository review focused on Home Assistant integration correctness, frontend card rendering, security and packaging.
3. Additional model/subagent review for documentation clarity and user-fit against the original community gap.

Findings from those runs are folded into the README, API validation, and limitations section.
