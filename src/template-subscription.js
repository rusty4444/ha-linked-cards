// Home Assistant only lets administrators subscribe to custom bus events; for everyone else
// the websocket API rejects the request and logs a server ERROR. Non-admins are skipped (they
// see template changes after a full reload), and a rejected attempt is never retried because
// `hass` is set on every state update.

export class TemplateSubscription {
  constructor(eventType, onEvent) {
    this._eventType = eventType;
    this._onEvent = onEvent;
    this._generation = 0;
    this._requested = false; // an attempt is pending, active, or was rejected
    this._unsubscribe = null;
  }

  ensure(hass) {
    if (this._requested) return;
    if (!hass?.connection?.subscribeEvents) return;
    // `hass.user` is null until Home Assistant has loaded it; the next `set hass` retries.
    if (!hass.user?.is_admin) return;

    this._requested = true;
    const generation = ++this._generation;
    hass.connection.subscribeEvents(this._onEvent, this._eventType)
      .then((unsubscribe) => {
        if (generation !== this._generation) safeUnsubscribe(unsubscribe);
        else this._unsubscribe = unsubscribe;
      })
      .catch(() => {});
  }

  release() {
    this._generation++;
    this._requested = false;
    const unsubscribe = this._unsubscribe;
    this._unsubscribe = null;
    if (unsubscribe) safeUnsubscribe(unsubscribe);
  }
}

// The websocket library's unsubscribe is async and rejects if the connection is already gone.
function safeUnsubscribe(unsubscribe) {
  Promise.resolve(unsubscribe()).catch(() => {});
}
