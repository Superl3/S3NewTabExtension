import {
  connectWithAuthConnector,
  formatAuthConnectorErrorMessage
} from "./authConnector.js";

export const MONDAY_CONNECT_REQUIRED_MESSAGE =
  "Add a connector URL or Monday access token in settings before connecting.";
export const MONDAY_CONNECT_ENABLE_MESSAGE =
  "Add a connector URL or Monday access token in settings to enable Monday connection.";
export const MONDAY_CONNECT_UNABLE_TOKEN_MESSAGE =
  "Unable to obtain Monday connector token. Check the connector URL or add a Monday access token in settings.";
export const MONDAY_CONNECT_CANCELLED_MESSAGE = "Monday connection was cancelled.";
export const MONDAY_DISCONNECT_CONFIGURED_TOKEN_MESSAGE =
  "Remove Monday access token in Global settings to disconnect.";
export const MONDAY_SYNC_CONNECT_REQUIRED_MESSAGE =
  "Add a connector URL or Monday access token in settings before syncing.";

export function connectWithMondayAuthConnector({
  connectorUrl = "",
  accessToken = "",
  getIdentityApi = () => null
} = {}) {
  return connectWithAuthConnector({
    connectorUrl,
    configuredAccessToken: accessToken,
    provider: "monday",
    providerLabel: "Monday",
    unableTokenMessage: MONDAY_CONNECT_UNABLE_TOKEN_MESSAGE,
    getIdentityApi
  });
}

export function formatMondayAuthConnectorErrorMessage(error) {
  return formatAuthConnectorErrorMessage(error, {
    cancelledMessage: MONDAY_CONNECT_CANCELLED_MESSAGE
  });
}
