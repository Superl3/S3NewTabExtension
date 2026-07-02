function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function getNotificationApi(notificationApi) {
  if (notificationApi) {
    return notificationApi;
  }
  return globalThis.Notification;
}

export function isAlarmEventContract(value) {
  if (!value || typeof value !== "object") {
    return false;
  }

  return (
    isNonEmptyString(value.key) &&
    Number.isFinite(value.at) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.body)
  );
}

export function assertAlarmEventContract(value) {
  if (!isAlarmEventContract(value)) {
    throw new TypeError("Alarm event must include key, at, title, and body.");
  }

  return {
    key: value.key.trim(),
    at: value.at,
    title: value.title.trim(),
    body: value.body.trim()
  };
}

export function dispatchAlarmNotification(event, deps = {}) {
  const notificationApi = getNotificationApi(deps.notificationApi);
  const normalizedEvent = assertAlarmEventContract(event);

  if (typeof notificationApi === "undefined" || notificationApi?.permission !== "granted") {
    return null;
  }

  return new notificationApi(normalizedEvent.title, {
    body: normalizedEvent.body,
    tag: normalizedEvent.key
  });
}
