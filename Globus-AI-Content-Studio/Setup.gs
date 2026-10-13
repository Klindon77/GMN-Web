/**
 * Globus AI Content Studio — Setup.gs — Phase 1/2: creates and checks the "Content" worksheet.
 * Safe to run many times. It never deletes or overwrites your data.
 */

/** Show a message box if possible, otherwise just log it. */
function notify_(title, message) {
  Logger.log(title + '\n' + message);
  try {
    SpreadsheetApp.getUi().alert(title, message, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // No UI available (e.g. running from a trigger). The log is enough.
  }
}

/** Returns the Content sheet, or null if it does not exist. */
function getContentSheet_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CFG.SHEET_NAME);
}

/**
 * Compares row 1 with the required headers.
 * Returns {state: 'EMPTY'|'OK'|'MISMATCH', problems: [..]}
 */
function checkHeaders_(sheet) {
  var n = CFG.HEADERS.length;
  var width = Math.max(sheet.getLastColumn(), n);
  var row = sheet.getRange(CFG.HEADER_ROW, 1, 1, width).getValues()[0];
  var nonEmpty = row.some(function (v) { return String(v).trim() !== ''; });
  if (!nonEmpty) return { state: 'EMPTY', problems: [] };

  var problems = [];
  for (var i = 0; i < n; i++) {
    var found = String(row[i]).trim();
    if (found !== CFG.HEADERS[i]) {
      problems.push('Column ' + columnLetter_(i + 1) + ': expected "' +
        CFG.HEADERS[i] + '" but found "' + found + '"');
    }
  }
  return { state: problems.length ? 'MISMATCH' : 'OK', problems: problems };
}

function columnLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/** Does any data row (row 2+) contain anything? */
function hasDataRows_(sheet) {
  var last = sheet.getLastRow();
  if (last < CFG.FIRST_DATA_ROW) return false;
  var vals = sheet.getRange(CFG.FIRST_DATA_ROW, 1, last - CFG.FIRST_DATA_ROW + 1, CFG.HEADERS.length).getValues();
  return vals.some(function (r) { return r.some(function (c) { return String(c).trim() !== ''; }); });
}

/** Header look, frozen row, Status dropdown. Never touches cell contents below row 1. */
function applyFormatting_(sheet) {
  var n = CFG.HEADERS.length;
  sheet.getRange(CFG.HEADER_ROW, 1, 1, n)
    .setFontWeight('bold').setBackground('#0a2342').setFontColor('#ffffff');
  sheet.setFrozenRows(CFG.HEADER_ROW);

  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(STATUS).map(function (k) { return STATUS[k]; }), true)
    .setAllowInvalid(true) // existing values are never blocked or erased
    .build();
  var rows = CFG.VALIDATION_LAST_ROW - CFG.FIRST_DATA_ROW + 1;
  sheet.getRange(CFG.FIRST_DATA_ROW, COL.STATUS, rows, 1).setDataValidation(rule);

  sheet.setColumnWidth(COL.TOPIC, 280);
  sheet.setColumnWidth(COL.SEO_TITLE, 260);
  sheet.setColumnWidth(COL.META, 260);
  sheet.setColumnWidth(COL.ARTICLE, 320);
  sheet.setColumnWidth(COL.STATUS, 140);
}

/**
 * MAIN SETUP. Creates the worksheet/headers if missing, adds the status
 * dropdown, and adds the sample topic only to a sheet with no data.
 */
function setupContentStudio() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var report = [];
  var sheet = ss.getSheetByName(CFG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CFG.SHEET_NAME);
    report.push('Created worksheet "' + CFG.SHEET_NAME + '".');
  } else {
    report.push('Worksheet "' + CFG.SHEET_NAME + '" already exists (kept as is).');
  }

  var h = checkHeaders_(sheet);
  if (h.state === 'EMPTY') {
    sheet.getRange(CFG.HEADER_ROW, 1, 1, CFG.HEADERS.length).setValues([CFG.HEADERS]);
    report.push('Wrote the 9 column headers.');
  } else if (h.state === 'OK') {
    report.push('Headers are already correct.');
  } else {
    // Do NOT overwrite: the user may have real data under different headings.
    report.push('STOPPED: headers do not match, so nothing was changed.');
    report = report.concat(h.problems);
    report.push('Fix row 1 by hand (or rename/move that sheet) and run setup again.');
    notify_('Setup needs your attention', report.join('\n'));
    return { ok: false, report: report };
  }

  applyFormatting_(sheet);
  report.push('Applied header style, frozen header row and Status dropdown.');

  if (!hasDataRows_(sheet)) {
    sheet.getRange(CFG.FIRST_DATA_ROW, COL.TOPIC).setValue(CFG.SAMPLE_TOPIC);
    sheet.getRange(CFG.FIRST_DATA_ROW, COL.STATUS).setValue(STATUS.TOPIC);
    report.push('Added sample topic: "' + CFG.SAMPLE_TOPIC + '" (status TOPIC).');
  } else {
    report.push('Sheet already has data, so no sample topic was added.');
  }

  notify_('Setup complete', report.join('\n'));
  return { ok: true, report: report };
}

/**
 * TEST 1 + 2: Sheets connection and worksheet structure.
 * Read-only: changes nothing.
 */
function testSheetsConnection() {
  var lines = [];
  var ok = true;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('No active spreadsheet. This script must be created from the Sheet via Extensions > Apps Script.');
    lines.push('PASS  Connected to spreadsheet: "' + ss.getName() + '"');
    lines.push('      Worksheets: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));

    var sheet = ss.getSheetByName(CFG.SHEET_NAME);
    if (!sheet) {
      ok = false;
      lines.push('FAIL  Worksheet "' + CFG.SHEET_NAME + '" not found. Run Setup Content Studio.');
    } else {
      lines.push('PASS  Worksheet "' + CFG.SHEET_NAME + '" exists.');
      var h = checkHeaders_(sheet);
      if (h.state === 'OK') {
        lines.push('PASS  Headers A-I are correct.');
      } else {
        ok = false;
        lines.push('FAIL  Headers: ' + (h.state === 'EMPTY' ? 'row 1 is empty. Run Setup Content Studio.' : h.problems.join('; ')));
      }
      var last = sheet.getLastRow();
      lines.push('INFO  Data rows: ' + Math.max(0, last - CFG.HEADER_ROW));
    }
  } catch (e) {
    ok = false;
    lines.push('FAIL  ' + e.message);
  }
  lines.push(ok ? '\nRESULT: Sheets test PASSED.' : '\nRESULT: Sheets test FAILED.');
  notify_('Test: Google Sheets', lines.join('\n'));
  return ok;
}
