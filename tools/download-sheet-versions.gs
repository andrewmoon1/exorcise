/**
 * Saves every past version of a Google Sheet as an .xlsx file in a new
 * Google Drive folder, so the old, overwritten numbers can be imported
 * into the Exorcise app.
 *
 * How to use (once):
 *   1. Go to https://script.google.com and click "New project".
 *   2. Replace the code there with this whole file.
 *   3. In the left bar, click + next to "Services", pick "Drive API", click Add.
 *   4. Paste the link of each sheet between the quotes in SHEET_LINKS below.
 *   5. Pick "downloadAllVersions" in the menu at the top and click Run.
 *      Google asks for permission the first time. The script runs in your own
 *      account and sends nothing anywhere else.
 *   6. When it ends, the log at the bottom shows a folder link for each sheet.
 *      If the log says "Stopped early", click Run again: it carries on.
 *   7. In Google Drive, right-click the folder and pick Download.
 *
 * Note: Google keeps fewer versions in its API than the Version history panel
 * sometimes shows, because it merges older small edits. Every version it
 * still has is saved.
 */

const SHEET_LINKS = [
  'PASTE THE LINK TO YOUR SHEET HERE',
  // 'PASTE A SECOND SHEET LINK HERE, IF YOU HAVE ONE',
];

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const TIME_LIMIT_MS = 5 * 60 * 1000; // Apps Script stops a run after 6 minutes.

function downloadAllVersions() {
  const started = Date.now();
  for (const link of SHEET_LINKS) {
    const match = String(link).match(/\/d\/([\w-]+)/);
    if (!match) {
      Logger.log(`Skipped "${link}": this is not a Google Sheets link.`);
      continue;
    }
    const fileId = match[1];
    const file = DriveApp.getFileById(fileId);
    const folder = folderFor(`${file.getName()} - all versions`);
    const saved = new Set();
    const files = folder.getFiles();
    while (files.hasNext()) saved.add(files.next().getName());

    let pageToken;
    let added = 0;
    let total = 0;
    do {
      const page = Drive.Revisions.list(fileId, {
        fields: 'nextPageToken, revisions(id, modifiedTime, exportLinks)',
        pageSize: 200,
        pageToken,
      });
      for (const rev of page.revisions || []) {
        total++;
        const name = `${rev.modifiedTime.slice(0, 19).replace(/:/g, '-')} version ${rev.id}.xlsx`;
        if (saved.has(name)) continue;
        if (Date.now() - started > TIME_LIMIT_MS) {
          Logger.log(`Stopped early to stay inside Google's time limit. Click Run again to carry on. Folder: ${folder.getUrl()}`);
          return;
        }
        const url = rev.exportLinks && rev.exportLinks[XLSX];
        if (!url) continue;
        folder.createFile(fetchWithRetry(url).setName(name));
        saved.add(name);
        added++;
        Utilities.sleep(300);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
    Logger.log(`${file.getName()}: ${total} versions, ${added} saved now. Folder: ${folder.getUrl()}`);
  }
  Logger.log('Done. Download each folder from Google Drive.');
}

function folderFor(name) {
  const found = DriveApp.getFoldersByName(name);
  return found.hasNext() ? found.next() : DriveApp.createFolder(name);
}

function fetchWithRetry(url) {
  for (let attempt = 1; ; attempt++) {
    const res = UrlFetchApp.fetch(url, {
      headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
      muteHttpExceptions: true,
    });
    if (res.getResponseCode() === 200) return res.getBlob();
    if (attempt >= 5) throw new Error(`Google refused a download (${res.getResponseCode()}). Click Run again later.`);
    Utilities.sleep(2000 * attempt); // Google limits how fast files can be exported.
  }
}
