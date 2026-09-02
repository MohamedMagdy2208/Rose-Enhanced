export const ipcChannels = {
  getSnapshot: "summonerkit:get-snapshot",
  dispatch: "summonerkit:dispatch",
  saveProfile: "summonerkit:save-profile",
  diagnostics: "summonerkit:diagnostics",
  createRemotePairing: "summonerkit:create-remote-pairing",
  getUpdateState: "summonerkit:get-update-state",
  checkForUpdates: "summonerkit:check-for-updates",
  restartToUpdate: "summonerkit:restart-to-update",
  event: "summonerkit:event",
} as const;
