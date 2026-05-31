**Findings**

- **High** - Integration likely will not load after HACS install as documented.  
  [manifest.json](custom_components/linked_cards/manifest.json:5) has `"config_flow": false`, and [README.md](README.md:35) only says install/restart/add resource. Home Assistant will not set up this integration just because HACS installed it, so `/linked-cards/linked-card.js` and the API can 404.  
  **Fix:** either document `linked_cards:` in `configuration.yaml`, or preferably add a minimal config flow plus `async_setup_entry` so users can add it from Devices & Services.

- **High** - Any authenticated HA user can create, overwrite, or delete global templates.  
  [__init__.py](custom_components/linked_cards/__init__.py:60) only sets `requires_auth = True`; [post/delete](custom_components/linked_cards/__init__.py:62) do not check admin privileges. A non-admin user with an HA token can alter cards shown to other users.  
  **Fix:** keep `GET` available if normal users must render linked cards, but require admin for `POST` and `DELETE` using the HA request user, returning `403` for non-admins. Also make the README security text explicit.

- **Medium** - Frontend renders untrusted/error text with `innerHTML`.  
  [linked-card.js](src/linked-card.js:19) interpolates `message` and `err.stack`; [linked-card.js](src/linked-card.js:122) interpolates `selected` into an HTML attribute. Some values can be controlled through dashboard config, card errors, or stored templates, creating XSS risk in the HA frontend.  
  **Fix:** build the error card with DOM nodes and `textContent`; set input/textarea values as properties after creating elements, or escape attributes completely.

- **Medium** - Template API has no size, depth, or count limits.  
  [__init__.py](custom_components/linked_cards/__init__.py:66) accepts arbitrary JSON and [saves it directly](custom_components/linked_cards/__init__.py:73). An authenticated caller can store very large or deeply nested payloads, bloating `.storage` or freezing dashboards during render.  
  **Fix:** enforce request/content length, max template count, max serialized template size, max depth, and require `card.type` to be a string.

- **Low** - Release/source hygiene includes Python cache artifacts.  
  `custom_components/linked_cards/__pycache__/*.pyc` is present, and [.gitignore](.gitignore:1) does not ignore `__pycache__/` or `*.pyc`. These can be accidentally shipped through HACS.  
  **Fix:** remove cache files and add `__pycache__/` plus `*.py[cod]` to `.gitignore`.

- **Low** - Build dependencies are not reproducibly declared.  
  [package.json](package.json:1) uses `"latest"` for dev dependencies. CI can change behavior unexpectedly even with a lockfile refresh.  
  **Fix:** pin normal semver ranges or exact dev dependency versions, and consider adding `hassfest`/HACS validation to CI.

**Verification**

I did not modify files. `npm test` could not run in this read-only sandbox because Vitest tried to create a temp SSR directory and failed with `EPERM`.