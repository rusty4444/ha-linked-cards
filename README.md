# Linked Cards for Home Assistant

Reusable, storage-backed dashboard cards for Home Assistant UI-mode dashboards.

Linked Cards fills the gap between Home Assistant's friendly visual dashboard editor and YAML-only reuse tools such as `decluttering-card`. Define a **master card template** once, then place lightweight linked instances anywhere. When the master template changes, every linked instance renders the new card configuration after refresh.

![Linked Cards overview](docs/screenshots/linked-cards-overview.svg)

## Why this exists

Home Assistant users often maintain several dashboards: wall tablet, phone, admin, energy, room-specific views, guest views. The same room card, security card, navigation card, or status stack is copied repeatedly. Today that means:

- edit the same card YAML in multiple places;
- risk inconsistent versions across dashboards;
- use YAML-heavy `decluttering-card` / `streamline-card`; or
- give up the UI dashboard editor.

Community requests repeatedly ask for native "master card", "linked card", or "reusable card" support in UI mode. This project is a practical HACS-friendly implementation of that missing layer.

## What it provides

- `custom:linked-card` — renders a stored master card by template id.
- `custom:linked-card-manager` — dashboard card for creating/editing templates from the Home Assistant UI.
- Home Assistant custom integration storage under `.storage/linked_cards.templates`.
- Safe variable substitution using `${variable}` placeholders.
- Any Lovelace card can be the child card: tile, grid, entities, custom cards, etc.
- Static JS resource served by the integration at `/linked-cards/linked-card.js`.
- REST API for advanced users and future UI tooling.

## Installation

### HACS custom repository

1. HACS → Integrations → ⋮ → Custom repositories.
2. Add this repository URL.
3. Category: **Integration**.
4. Install **Linked Cards**.
5. Restart Home Assistant.
6. Go to **Settings → Devices & services → Add integration** and add **Linked Cards**.
7. Add the frontend resource:

```yaml
url: /linked-cards/linked-card.js
type: module
```

Or add it from **Settings → Dashboards → Resources**.

### Manual install

Copy this folder into Home Assistant:

```text
custom_components/linked_cards
```

Restart Home Assistant, add **Linked Cards** from **Settings → Devices & services**, then add the resource:

```text
/linked-cards/linked-card.js
```

## Quick start

### 1. Add a manager card to an admin-only dashboard

```yaml
type: custom:linked-card-manager
template: room-summary
```

Paste and save this master template:

```json
{
  "description": "Reusable room summary grid with a light and climate tile.",
  "variables": {
    "area": "Living Room",
    "light": "light.living_room",
    "climate": "climate.living_room"
  },
  "card": {
    "type": "grid",
    "title": "${area}",
    "columns": 2,
    "square": false,
    "cards": [
      {
        "type": "tile",
        "entity": "${light}",
        "name": "Lights",
        "features": [{ "type": "light-brightness" }]
      },
      {
        "type": "tile",
        "entity": "${climate}",
        "name": "Climate",
        "features": [{ "type": "target-temperature" }]
      }
    ]
  }
}
```

### 2. Place linked instances anywhere

Living room:

```yaml
type: custom:linked-card
template: room-summary
variables:
  area: Living Room
  light: light.living_room
  climate: climate.living_room
```

Bedroom:

```yaml
type: custom:linked-card
template: room-summary
variables:
  area: Bedroom
  light: light.bedroom
  climate: climate.bedroom
```

Kitchen with a fallback if the template is missing:

```yaml
type: custom:linked-card
template: room-summary
variables:
  area: Kitchen
  light: light.kitchen
  climate: climate.kitchen
fallback:
  type: markdown
  content: Linked card template is not available.
```

## Template format

```json
{
  "description": "Optional human-readable notes.",
  "variables": {
    "default_name": "Default values are optional"
  },
  "card": {
    "type": "tile",
    "entity": "${entity}",
    "name": "${name}"
  }
}
```

Rules:

- `card` is required and must be a Lovelace card object.
- `variables` is optional and supplies defaults.
- Instance variables override template defaults.
- Placeholders work in strings and object keys: `${area}`, `${entity}`, `${nested.value}`.
- Missing variables render as an empty string so a broken template is visible rather than silently using stale values.
- Template ids may contain letters, numbers, `.`, `_`, and `-` only.

## API

All endpoints require normal Home Assistant authentication.

### List templates

```http
GET /api/linked_cards/templates
```

Response:

```json
{
  "templates": {
    "room-summary": {
      "variables": {},
      "card": { "type": "tile", "entity": "light.example" }
    }
  }
}
```

### Save template

```http
POST /api/linked_cards/templates/room-summary
Content-Type: application/json

{
  "variables": { "entity": "light.example" },
  "card": { "type": "tile", "entity": "${entity}" }
}
```

### Delete template

```http
DELETE /api/linked_cards/templates/room-summary
```

## Example patterns

### Shared navigation card

Create one navigation grid and reuse it on every dashboard. Update paths/icons once.

```json
{
  "card": {
    "type": "grid",
    "columns": 4,
    "square": false,
    "cards": [
      { "type": "button", "name": "Home", "icon": "mdi:home", "tap_action": { "action": "navigate", "navigation_path": "/lovelace/home" } },
      { "type": "button", "name": "Lights", "icon": "mdi:lightbulb", "tap_action": { "action": "navigate", "navigation_path": "/lovelace/lights" } },
      { "type": "button", "name": "Energy", "icon": "mdi:lightning-bolt", "tap_action": { "action": "navigate", "navigation_path": "/energy" } },
      { "type": "button", "name": "Security", "icon": "mdi:shield-home", "tap_action": { "action": "navigate", "navigation_path": "/lovelace/security" } }
    ]
  }
}
```

### Shared device-status card

Use one template for routers, servers, NAS devices, or 3D printers.

```json
{
  "variables": {
    "name": "Device",
    "power": "sensor.device_power",
    "status": "binary_sensor.device_online"
  },
  "card": {
    "type": "entities",
    "title": "${name}",
    "entities": ["${status}", "${power}"]
  }
}
```

## Security and privacy

- Templates are stored locally in Home Assistant storage.
- The integration does not call external services.
- Normal Home Assistant auth protects the API.
- Template reads are available to authenticated users so linked cards can render.
- Template create/update/delete actions require a Home Assistant administrator account.
- Template ids, size, nesting depth, count and `card.type` are validated server-side.
- Do not store secrets in card templates. Treat template JSON like dashboard YAML.

## Limitations

- Dashboards must be refreshed to pick up saved template changes in already-rendered views.
- This is not a full visual drag-and-drop card editor yet; the manager edits JSON.
- Variables are string interpolation, not arbitrary JavaScript or Jinja. This is intentional for safety and portability.
- Cross-dashboard use works because templates are stored globally by the integration, not inside a single dashboard config.

## Roadmap

- Visual template picker/editor.
- Import duplicated existing dashboard cards as templates.
- Live update event after saving a template.
- Template export/import.
- Per-template usage search across dashboards.
- Optional variable schema so instances get a proper UI form.

## Development

```bash
npm install
npm test
npm run build
```

Build output is copied to:

```text
custom_components/linked_cards/www/linked-card.js
```

## Validation performed

- Vitest unit tests for template id validation, recursive variable rendering, default/override behaviour, and package layout.
- ESBuild bundle generation.
- Python syntax compilation for the Home Assistant custom component.
- Independent model/code-review validation notes are in `docs/validation.md`.

## License

MIT
