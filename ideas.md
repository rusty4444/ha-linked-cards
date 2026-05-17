# Home Assistant build ideas backlog

This file captures researched product gaps so future build-idea searches start from prior findings before going back online.

## Research sources used

- Home Assistant Community feature requests and WTH threads.
- r/homeassistant wish-list discussions.
- GitHub/HACS searches for existing implementations and workarounds.

## Top opportunities

### 1. Real-time power / EMS dashboard

**Problem:** Home Assistant's Energy dashboard is excellent for historical kWh, but users want live W/kW power visibility and actionability.

**Demand evidence:** WTH thread had about 245 votes and 11.3k views.

**What people ask for:**

- real-time whole-home draw;
- solar, battery, grid import/export;
- per-phase, per-breaker, socket and appliance hierarchy;
- capacity/demand tariff peak prediction;
- EV charging and battery/load automation.

**Existing workarounds:** Power Flow Card Plus, energy-sankey, manual helpers/templates.

**Build angle:** Integration + dashboard cards + tariff-aware automations.

### 2. Reusable / linked dashboard cards for UI-mode dashboards

**Problem:** Users duplicate the same dashboard cards across views/dashboards. YAML tools exist, but UI-mode users want a master-card/linked-card workflow.

**Demand evidence:** WTH thread had about 30 votes, with older related requests around 75 votes.

**Existing workarounds:** decluttering-card, streamline-card, raw config editor.

**Build angle:** `ha-linked-cards`: global card-template storage + linked instances + UI manager card.

### 3. Entity/device action explorer and automation builder

**Problem:** Home Assistant makes it easy to browse Action → entities, but not Entity/device → possible actions.

**Demand evidence:** WTH thread plus repeated beginner frustration around AI/YAML generation.

**Build angle:** Custom panel/add-on that shows supported actions for an entity/device, schemas, examples, and generates validated automations/scripts.

### 4. Apple bridge: Reminders, Find My, AirTags, iCloud-ish data

**Problem:** Apple APIs are constrained; HA users rely on Shortcuts, OCR, Mac helpers, and fragmented projects.

**Demand evidence:** Reddit wish-list: AirTags/FindMy had 179 upvotes; Reminders/iCal had 30. Apple Reminders feature request had 49 votes. AirTag workaround thread had about 93k views.

**Build angle:** macOS companion/LaunchAgent using local Apple APIs where possible, publishing to HA over MQTT/REST/WebSocket.

### 5. Whole-room light effects / virtual WLED string for arbitrary HA lights

**Problem:** Users want Hue/WLED-style effects across normal Zigbee/Z-Wave/Wi-Fi lights in a room.

**Demand evidence:** Reddit wish-list comment had 104 upvotes.

**Build angle:** `ha-lightfx`: define room layouts, map lights to virtual positions, run ambient effects, provide dashboard card and automation hooks.

## Honourable mentions

### Nanit baby monitor

Strong demand and long-running thread, but vendor/API brittleness and existing partial reverse engineering make it riskier.

### Generic virtual devices

Useful but likely more appropriate for Home Assistant core unless built as a helper/integration suite.

### Whiteboard / family notes card

Useful wall-tablet feature but weaker demand signal than the top five.

## Future research process

When asked for build ideas again:

1. Read this file first.
2. Check whether any ideas have since been built or superseded.
3. Search current Home Assistant Community, Reddit, GitHub, and HACS for new demand.
4. Prefer ideas with both explicit user demand and awkward/no existing solution.
5. Update this file with new findings.
