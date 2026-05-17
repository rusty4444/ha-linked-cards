# Research note: reusable Home Assistant dashboard cards

## Community gap

Users repeatedly ask for reusable or linked dashboard cards in Home Assistant UI mode. The pain is not simply "can I template YAML?"; the pain is that the UI editor is useful, but repeated cards become unmaintainable across phone, tablet, wall-panel, admin, and room dashboards.

Representative community request:

- WTH Reusable, or linked Dashboard-Cards (Master-Card): https://community.home-assistant.io/t/wth-reusable-or-linked-dashboard-cards-master-card/807782

Core user ask:

> Create a primary/master card, then place copies around views and dashboards so changing the primary updates all copies.

## Existing options and remaining hole

| Option | Helps | Gap |
|---|---|---|
| `decluttering-card` | Reusable YAML card templates | YAML/raw-config oriented; awkward for storage/UI-mode users |
| `streamline-card` | Modern Lovelace templating | Still a custom-card templating workflow, not global HA storage/UI manager |
| Copy/paste cards | Easy at first | Creates drift and repeated edits |
| Dashboard raw editor | Powerful | Loses much of the point of UI mode |

## This project’s hypothesis

A small Home Assistant custom integration can provide the missing shared storage layer. A frontend card can then render any Lovelace child card from a stored master template.

This makes linked cards possible across dashboards without requiring a large frontend rewrite or a fork of Home Assistant core.
