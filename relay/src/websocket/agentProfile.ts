import type { AppContext } from "../appContext.js";
import { DEFAULT_DEVICE_ACTIONS, type DevicePlatform } from "../protocol/actions.js";
import type { AuthMessage } from "../protocol/messages.js";

export type AgentProfile = {
  platform: DevicePlatform | null;
  actions: string[];
};

export function agentProfileFromAuth(message: AuthMessage): AgentProfile {
  return {
    platform: message.platform ?? null,
    actions:
      message.actions === undefined ? [...DEFAULT_DEVICE_ACTIONS] : [...message.actions],
  };
}

export function rememberAgentProfile(
  ctx: AppContext,
  deviceId: string,
  message: AuthMessage,
): AgentProfile {
  const profile = agentProfileFromAuth(message);
  if (message.app_version !== undefined) {
    ctx.devices.recordAppVersion(deviceId, message.app_version);
  }
  ctx.devices.recordAgentProfile(deviceId, profile);
  return profile;
}
