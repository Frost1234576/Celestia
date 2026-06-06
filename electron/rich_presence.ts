import { ipcMain } from "electron";

async function setupRichPresence() {
  const DiscordRPC = await import('discord-rpc');

  const clientId = '1512915399514128554';
  const client = new DiscordRPC.Client({ transport: 'ipc' });

  const openedTime = Date.now();
  let isReady = false;

  client.on('ready', () => {
    isReady = true;
    client.setActivity({
      details: 'Browsing Projects...',
      startTimestamp: openedTime,
      largeImageKey: 'celestia-logo-tiny_1_',
      largeImageText: 'Celestia IDE',
    });
  });

  await client.login({ clientId });

  ipcMain.on('rich-presence:set', async (_event, { details, state, projectName, smallImageKey }) => {
    if (!isReady) return;
    client.setActivity({
      details,
      state,
      startTimestamp: openedTime,
      largeImageKey: 'celestia-logo-tiny_1_',
      largeImageText: 'Celestia IDE' + (projectName ? ` - ${projectName}` : ''),
      smallImageKey: smallImageKey || undefined,
      smallImageText: smallImageKey ? projectName || 'Project' : undefined,
    });
  });

  ipcMain.on('rich-presence:clear', async () => {
    if (!isReady) return;
    client.clearActivity();
  });
}

setupRichPresence().catch(console.error);