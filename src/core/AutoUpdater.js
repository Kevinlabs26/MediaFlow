const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const { ipcMain, app } = require('electron');

/**
 * Auto Updater Configuration and Logic
 */

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Auto-download is true by default, but explicit is better
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const FOCUS_CHECK_COOLDOWN_MS = 5 * 60 * 1000;
let initialized = false;
let updateCheckTimer = null;
let updateCheckPromise = null;
let lastUpdateCheckAt = 0;
let downloadedUpdateInfo = null;

/**
 * Initialize the Auto Updater
 * @param {BrowserWindow} mainWindow - The main application window to send events to
 */
function initAutoUpdater(mainWindow) {
    if (!mainWindow || initialized) return;
    initialized = true;

    // --- Updater Event Handlers ---

    autoUpdater.on('checking-for-update', () => {
        log.info('Checking for update...');
        // Optional: send status to renderer if you want to show a spinner
        // mainWindow.webContents.send('updater:status', 'checking');
    });

    autoUpdater.on('update-available', (info) => {
        log.info('Update available.', info);
        mainWindow.webContents.send('updater:available', info);
        // Toast is handled in renderer
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('Update not available.', info);
        // mainWindow.webContents.send('updater:not-available', info);
    });

    autoUpdater.on('error', (err) => {
        log.error('Error in auto-updater. ' + err);
        mainWindow.webContents.send('updater:error', err.toString());
    });

    autoUpdater.on('download-progress', (progressObj) => {
        let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
        log.info(log_message);

        // Send progress to renderer to show a progress bar if desired
        mainWindow.webContents.send('updater:progress', progressObj);
    });

    autoUpdater.on('update-downloaded', (info) => {
        log.info('Update downloaded and ready to install.', info);
        // Keep the result until the renderer asks for it. The download can
        // finish before the renderer has finished booting and subscribed to
        // the event, especially on fast/local update sources.
        downloadedUpdateInfo = info;

        // Let the user choose when to restart; autoInstallOnAppQuit still
        // installs it automatically on the next normal quit.
        mainWindow.webContents.send('updater:downloaded', info);
    });

    const runUpdateCheck = (reason = 'scheduled') => {
        if (!app.isPackaged) {
            log.info(`Skipping auto-update check in unpacked/dev mode (${reason}).`);
            return Promise.resolve(null);
        }
        if (updateCheckPromise) return updateCheckPromise;

        lastUpdateCheckAt = Date.now();
        updateCheckPromise = (reason === 'manual'
            ? autoUpdater.checkForUpdates()
            : autoUpdater.checkForUpdatesAndNotify())
            .catch((error) => {
                log.error(`Failed to check for updates (${reason}):`, error);
                return null;
            })
            .finally(() => {
                updateCheckPromise = null;
            });

        return updateCheckPromise;
    };

    // --- IPC Handlers for User Interaction ---

    // Triggered when user clicks "Check for Updates" manually (if you add such button)
    ipcMain.handle('updater:check', async () => {
        return runUpdateCheck('manual');
    });

    // Renderer startup may happen after update-downloaded. Expose the last
    // downloaded update so the UI can show the install prompt reliably.
    ipcMain.handle('updater:get-downloaded', () => downloadedUpdateInfo);

    // Triggered when user clicks "Restart Now" on the update prompt
    ipcMain.on('updater:quit-and-install', () => {
        autoUpdater.quitAndInstall();
    });

    // Check once after startup, then while the app remains open. A focus check
    // makes an update visible soon after the user returns to the desktop app.
    setTimeout(() => runUpdateCheck('startup'), 3000);
    updateCheckTimer = setInterval(() => runUpdateCheck('interval'), UPDATE_CHECK_INTERVAL_MS);
    updateCheckTimer.unref?.();

    const handleWindowFocus = () => {
        if (Date.now() - lastUpdateCheckAt >= FOCUS_CHECK_COOLDOWN_MS) {
            void runUpdateCheck('focus');
        }
    };
    app.on('browser-window-focus', handleWindowFocus);
    app.once('before-quit', () => {
        if (updateCheckTimer) clearInterval(updateCheckTimer);
        updateCheckTimer = null;
        app.removeListener('browser-window-focus', handleWindowFocus);
    });
}

module.exports = { initAutoUpdater };
