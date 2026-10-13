/**
 * Globus AI Content Studio — Log.gs — error/event log in a "Logs" worksheet.
 * Messages are scrubbed so API keys can never be written to the sheet.
 */

/** Creates the Logs sheet if missing. Returns true if it was created. */
function ensureLogSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getSheetByName(CFG.LOG_SHEET_NAME)) return false;
  var sh = ss.insertSheet(CFG.LOG_SHEET_NAME);
  sh.getRange(1, 1, 1, CFG.LOG_HEADERS.length).setValues([CFG.LOG_HEADERS]);
  sh.setFrozenRows(1);
  return true;
}

/** Removes anything that looks like a secret from text. */
function scrub_(text) {
  var s = String(text);
  try {
    var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
    if (key) s = s.split(key).join('[REDACTED]');
  } catch (e) { /* ignore */ }
  return s.replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[REDACTED]');
}

/** level: INFO | WARN | ERROR */
function logEvent_(level, func, row, message) {
  var msg = scrub_(message);
  Logger.log('[' + level + '] ' + func + ' row ' + row + ': ' + msg);
  try {
    ensureLogSheet_();
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.LOG_SHEET_NAME)
      .appendRow([new Date(), level, func, row || '', msg.substring(0, 1000)]);
  } catch (e) {
    Logger.log('Could not write log row: ' + scrub_(e.message));
  }
}
