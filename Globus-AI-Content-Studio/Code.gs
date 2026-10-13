/**
 * GLOBUS AI CONTENT STUDIO - ALL-IN-ONE Code.gs
 * Paste this ONE file into Apps Script. Delete every other .gs file (keep appsscript.json).
 * Contains: Config, Log, Setup, Gemini, Research, Article, Menu.
 */

// ============================================================
// Config
// ============================================================
/**
 * Globus AI Content Studio — Config.gs — the ONE place for shared settings and names.
 * Secrets (API keys) are NOT stored here. They go in
 * Project Settings > Script Properties (added in later phases).
 */
var CFG = {
  VERSION: '2026-10-13 all-in-one v4.2',
  SHEET_NAME: 'Content',          // worksheet used by the studio
  HEADER_ROW: 1,
  FIRST_DATA_ROW: 2,
  VALIDATION_LAST_ROW: 1000,      // status dropdown applied to rows 2..1000
  HEADERS: [
    'Topic',              // A
    'SEO Title',          // B
    'Meta Description',   // C
    'Article Content',    // D
    'Image URL',          // E
    'Keywords',           // F
    'Status',             // G
    'Blogger Post URL',   // H
    'Publish Date'        // I
  ],
  LOG_SHEET_NAME: 'Logs',
  LOG_HEADERS: ['Time', 'Level', 'Function', 'Row', 'Message'],
  GEMINI_DEFAULT_MODEL: 'gemini-flash-latest', // override with Script Property GEMINI_MODEL
  GEMINI_FALLBACK_MODEL: 'gemini-flash-lite-latest', // used if the main model stays overloaded (Script Property GEMINI_FALLBACK_MODEL overrides)
  USE_GROUNDING: false,                     // Phase 4: Google Search research. OFF by default: free keys hit quota (429). Set true only if Test Research passes.
  MAX_SOURCES_CHECKED: 8,                   // max source links tested per article
  GEMINI_MAX_ATTEMPTS: 5,                   // retries for 429/500/503 (waits 3s, 6s, 12s, 24s)
  GEMINI_MAX_OUTPUT_TOKENS: 12000,
  ARTICLE_MIN_WORDS: 1000,
  MAX_EXPAND_ATTEMPTS: 2,                   // if the draft is only too short, ask Gemini to expand it (max times)
  // Topics about a specific real person: the tool has no verified facts, so it would invent a biography. Refused.
  PERSON_TOPIC_REGEX: '(^\\s*who\\s+(is|was)\\b(?!\\s+(eligible|liable|responsible|required|entitled|exempt|allowed|affected|covered|taxed)\\b)|\\bbiography\\b|\\bnet\\s+worth\\b|\\bwiki\\b|\\bage\\s+and\\s+family\\b)',
  PLACEHOLDER_MARK: '[[ADD',                // editor placeholders left in the article for current figures
  MAX_PLACEHOLDERS: 8,
  // Topics that need LIVE market data. Without verified data the tool refuses (it would have to invent stock names/prices).
  REALTIME_TOPIC_REGEX: '(today|tomorrow|this week|live|upper circuit stocks|lower circuit stocks|top gainers|top losers|stocks to buy|price target|current price|share price)',
  SAMPLE_TOPIC: 'How Inflation Affects the Indian Stock Market'
};

/** Column numbers (1 = A). Use these names instead of raw numbers. */
var COL = {
  TOPIC: 1, SEO_TITLE: 2, META: 3, ARTICLE: 4, IMAGE: 5,
  KEYWORDS: 6, STATUS: 7, POST_URL: 8, PUBLISH_DATE: 9
};

/** Workflow statuses. Always use these constants, never typed text. */
var STATUS = {
  TOPIC: 'TOPIC',
  GENERATING: 'GENERATING',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  READY: 'READY',
  DRAFT_CREATED: 'DRAFT_CREATED',
  PUBLISHED: 'PUBLISHED',
  ERROR: 'ERROR'
};

// ============================================================
// Log
// ============================================================
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

// ============================================================
// Setup
// ============================================================
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

  if (ensureLogSheet_()) report.push('Created worksheet "' + CFG.LOG_SHEET_NAME + '" for error logs.');

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

// ============================================================
// Gemini
// ============================================================
/**
 * Globus AI Content Studio — Gemini.gs — talks to the Gemini API (REST).
 * The API key lives ONLY in Script Properties (GEMINI_API_KEY). It is sent in
 * a request header, never in the URL, and never written to the sheet or logs.
 */
var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

function getGeminiKey_() {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    throw new Error('Gemini API key is missing. Use menu Globus AI Studio > Set Gemini API Key.');
  }
  return key.trim();
}

function getGeminiModel_() {
  var m = PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL');
  return (m && m.trim()) || CFG.GEMINI_DEFAULT_MODEL;
}

/** Menu: stores the key in Script Properties (hidden from the sheet). */
function setGeminiApiKey() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.prompt('Set Gemini API Key',
    'Paste your key from Google AI Studio. It is stored in Script Properties, not in the sheet.',
    ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var key = r.getResponseText().trim();
  if (key.length < 20) { ui.alert('That does not look like an API key. Nothing was saved.'); return; }
  PropertiesService.getScriptProperties().setProperty('GEMINI_API_KEY', key);
  ui.alert('Key saved. Now run Globus AI Studio > Test Connections.');
}

/** Turns an HTTP error into a plain-English message (no secrets). */
function rawGeminiDetail_(text) {
  try { return JSON.parse(text).error.message || ''; } catch (e) { return String(text).substring(0, 200); }
}

function explainGeminiError_(code, text) {
  var detail = rawGeminiDetail_(text);
  var hint = {
    400: 'Bad request or invalid API key.',
    403: 'Key not allowed for this API, or your region/account is restricted.',
    404: 'Model not found. Run Test Connections to see the models your key can use, then set Script Property GEMINI_MODEL.',
    429: 'Quota or rate limit reached (free tier). Wait and retry, or check limits in Google AI Studio.',
    500: 'Google server error. Try again later.',
    503: 'Gemini is overloaded. Try again later.'
  }[code] || 'Unexpected response.';
  return scrub_('Gemini API error ' + code + ': ' + hint + ' ' + detail);
}

/** Low-level call with limited retries for 429/500/503. Returns parsed JSON. */
function geminiRequest_(method, path, bodyObj) {
  var opts = {
    method: method,
    headers: { 'x-goog-api-key': getGeminiKey_() },
    muteHttpExceptions: true
  };
  if (bodyObj) { opts.contentType = 'application/json'; opts.payload = JSON.stringify(bodyObj); }
  var attempts = CFG.GEMINI_MAX_ATTEMPTS, last = '';
  for (var i = 1; i <= attempts; i++) {
    var resp = UrlFetchApp.fetch(GEMINI_BASE + path, opts);
    var code = resp.getResponseCode(), text = resp.getContentText();
    if (code === 200) return JSON.parse(text);
    last = explainGeminiError_(code, text);
    var retryable = (code === 429 || code === 500 || code === 503);
    if (!retryable || i === attempts) { var err = new Error(last); err.httpCode = code; err.rawDetail = scrub_(rawGeminiDetail_(text)); throw err; }
    Utilities.sleep(3000 * Math.pow(2, i - 1)); // 3s, 6s, 12s, 24s
  }
  throw new Error(last);
}

/** Calls generateContent and returns the text answer. */
function geminiGenerateText_(requestBody, model) {
  var data = geminiRequest_('post', '/models/' + encodeURIComponent(model || getGeminiModel_()) + ':generateContent', requestBody);
  if (data.promptFeedback && data.promptFeedback.blockReason) {
    throw new Error('Gemini blocked the prompt: ' + data.promptFeedback.blockReason);
  }
  var cand = data.candidates && data.candidates[0];
  if (!cand || !cand.content || !cand.content.parts) {
    throw new Error('Gemini returned no content' + (cand && cand.finishReason ? ' (finishReason ' + cand.finishReason + ')' : '') + '.');
  }
  if (cand.finishReason === 'MAX_TOKENS') {
    throw new Error('Gemini output was cut off (MAX_TOKENS). Try again or raise GEMINI_MAX_OUTPUT_TOKENS in Config.gs.');
  }
  return cand.content.parts.map(function (p) { return p.text || ''; }).join('');
}

/** Name of the model that actually answered the last article call (for logs). */
var lastModelUsed_ = '';

/**
 * Tries the main model; if it is overloaded / over quota / unavailable even after
 * retries, tries the fallback model once. Keeps the real error if both fail.
 */
function geminiGenerateWithFallback_(requestBody) {
  var main = getGeminiModel_();
  var fb = PropertiesService.getScriptProperties().getProperty('GEMINI_FALLBACK_MODEL') || CFG.GEMINI_FALLBACK_MODEL;
  try {
    lastModelUsed_ = main;
    return geminiGenerateText_(requestBody, main);
  } catch (e) {
    var swappable = [404, 429, 500, 503].indexOf(e.httpCode) !== -1;
    if (!swappable || !fb || fb === main) throw e;
    logEvent_('WARN', 'geminiGenerateWithFallback_', '', 'Main model "' + main + '" failed (' + e.httpCode + '). Trying fallback "' + fb + '".');
    lastModelUsed_ = fb;
    return geminiGenerateText_(requestBody, fb);
  }
}

/** Lists models this key can use for generateContent. */
function listGeminiModels_() {
  var data = geminiRequest_('get', '/models?pageSize=200');
  return (data.models || []).filter(function (m) {
    return (m.supportedGenerationMethods || []).indexOf('generateContent') !== -1;
  }).map(function (m) { return m.name.replace(/^models\//, ''); });
}

/** TEST 3: Gemini connection. Sends one tiny request. */
function testGeminiConnection() {
  var lines = [], ok = true, model = getGeminiModel_();
  try {
    getGeminiKey_();
    lines.push('PASS  API key found in Script Properties.');
    var models = listGeminiModels_();
    lines.push('PASS  Key accepted. ' + models.length + ' models support text generation.');
    var flash = models.filter(function (m) { return /flash/.test(m); }).slice(0, 20);
    lines.push('INFO  Some Flash models: ' + (flash.join(', ') || 'none found'));
    if (models.indexOf(model) === -1) {
      ok = false;
      lines.push('FAIL  Configured model "' + model + '" is not in your list. Set Script Property GEMINI_MODEL to one above.');
    } else {
      var reply = geminiGenerateText_({
        contents: [{ parts: [{ text: 'Reply with exactly the single word: OK' }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 200 }
      }, model);
      lines.push('PASS  Model "' + model + '" replied: ' + reply.trim().substring(0, 40));
    }
  } catch (e) {
    ok = false;
    lines.push('FAIL  ' + scrub_(e.message));
  }
  lines.push(ok ? '\nRESULT: Gemini test PASSED.' : '\nRESULT: Gemini test FAILED.');
  notify_('Test: Gemini API', lines.join('\n'));
  return ok;
}

// ============================================================
// Research
// ============================================================
/**
 * Globus AI Content Studio — Research.gs — Phase 4: facts and sources.
 *  1. geminiResearch_(): asks Gemini WITH Google Search to collect current facts.
 *     The real web pages it used come back as "grounding" metadata (not made up by the model).
 *  2. verifySources_(): opens every source link and drops the ones that do not load.
 * If research fails (quota etc.) the article is still written, but with NO current figures,
 * and the reviewer note says so. Nothing is ever invented to fill the gap.
 */

/** Calls generateContent with the Google Search tool. Main model first, then fallback. Returns the full JSON. */
function geminiGroundedCall_(body) {
  var main = getGeminiModel_();
  var fb = PropertiesService.getScriptProperties().getProperty('GEMINI_FALLBACK_MODEL') || CFG.GEMINI_FALLBACK_MODEL;
  function run(model) {
    return geminiRequest_('post', '/models/' + encodeURIComponent(model) + ':generateContent', body);
  }
  try {
    return run(main);
  } catch (e) {
    if ([404, 429, 500, 503].indexOf(e.httpCode) === -1 || !fb || fb === main) throw e;
    return run(fb);
  }
}

/** Follows one redirect (Google wraps grounding links) to find the real page address. */
function resolveRedirect_(url) {
  try {
    var r = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
    var code = r.getResponseCode();
    if (code >= 300 && code < 400) {
      var h = r.getHeaders();
      var loc = h['Location'] || h['location'];
      if (loc) return loc;
    }
  } catch (e) { /* keep original */ }
  return url;
}

/**
 * Research step. Returns {ok:true, brief, sources:[{title,url,note}]} or {ok:false, error}.
 */
function geminiResearch_(topic) {
  var prompt = [
    'You are a research assistant for a finance education blog about Indian and global markets.',
    'Use Google Search to find CURRENT, verifiable facts for an article on: "' + topic + '".',
    'Prefer official sources: RBI, SEBI, NSE, BSE, MOSPI/NSO, Ministry of Finance, company filings, major exchanges.',
    'Return a short plain-text brief of 8 to 14 bullet points. For every number or event include: the figure, the date or period it refers to, and the source name.',
    'If you cannot find a current figure, write "NOT FOUND" for it. Never guess or estimate.',
    'Do not give investment advice.'
  ].join('\n');
  try {
    var data = geminiGroundedCall_({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4000 }
    });
    var cand = data.candidates && data.candidates[0];
    var text = cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('').trim() : '';
    if (!text) return { ok: false, error: 'Research returned no text.' };
    var chunks = (cand.groundingMetadata && cand.groundingMetadata.groundingChunks) || [];
    var seen = {}, sources = [];
    chunks.forEach(function (c) {
      if (!c.web || !c.web.uri || sources.length >= CFG.MAX_SOURCES_CHECKED) return;
      var real = resolveRedirect_(c.web.uri);
      if (seen[real]) return;
      seen[real] = true;
      sources.push({ title: c.web.title || real, url: real, note: 'Used in research' });
    });
    if (!sources.length) return { ok: false, error: 'Research found no web sources (grounding returned none).' };
    return { ok: true, brief: text.substring(0, 6000), sources: sources };
  } catch (e) {
    return { ok: false, error: scrub_(e.message) };
  }
}

/** Opens one link. Returns 'OK', 'BLOCKED' (site refuses bots, cannot tell) or 'DEAD'. */
function checkUrl_(url) {
  try {
    var r = UrlFetchApp.fetch(url, {
      method: 'get', followRedirects: true, muteHttpExceptions: true,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GlobusContentStudio/1.0)' }
    });
    var c = r.getResponseCode();
    if (c >= 200 && c < 400) return 'OK';
    if (c === 401 || c === 403 || c === 405 || c === 406 || c === 429 || c === 999) return 'BLOCKED';
    return 'DEAD';
  } catch (e) {
    return 'DEAD';
  }
}

/**
 * Tests every source. Keeps OK and BLOCKED (with a note), drops DEAD.
 * Returns {kept:[...], notes:[...]}.
 */
function verifySources_(sources) {
  var kept = [], notes = [], seen = {}, n = 0;
  sources.forEach(function (s) {
    if (!s || typeof s.url !== 'string' || !/^https:\/\/[^\s]+\.[^\s]+$/.test(s.url) || seen[s.url]) return;
    seen[s.url] = true;
    if (n >= CFG.MAX_SOURCES_CHECKED) return;
    n++;
    var st = checkUrl_(s.url);
    if (st === 'OK') kept.push(s);
    else if (st === 'BLOCKED') { kept.push(s); notes.push('Source could not be auto-checked (site blocks bots): ' + s.url + ' - open it yourself.'); }
    else notes.push('Dropped dead/unreachable source: ' + s.url);
  });
  return { kept: kept, notes: notes };
}

/** TEST: does Google Search research work on your key (free tier)? Sends one small request. */
function testResearchConnection() {
  var lines = [], ok = true;
  try {
    var r = geminiResearch_('RBI repo rate (latest policy announcement)');
    if (r.ok) {
      lines.push('PASS  Research worked. ' + r.sources.length + ' web sources returned.');
      lines.push('INFO  Sources: ' + r.sources.map(function (s) { return s.url.replace(/^https?:\/\//, '').split('/')[0]; }).join(', '));
      lines.push('INFO  Brief starts: ' + r.brief.substring(0, 200).replace(/\s+/g, ' '));
      var v = verifySources_(r.sources);
      lines.push('INFO  Link check: ' + v.kept.length + ' kept, ' + (r.sources.length - v.kept.length) + ' dropped.');
    } else {
      ok = false;
      lines.push('FAIL  ' + r.error);
      lines.push('INFO  Articles still work without research, but will contain no current figures. If this is a quota (429) message, wait or turn research off: Config.gs USE_GROUNDING: false.');
    }
  } catch (e) {
    ok = false;
    lines.push('FAIL  ' + scrub_(e.message));
  }
  lines.push(ok ? '\nRESULT: Research test PASSED.' : '\nRESULT: Research test FAILED.');
  notify_('Test: Research (Google Search)', lines.join('\n'));
  return ok;
}

// ============================================================
// Article
// ============================================================
/**
 * Globus AI Content Studio — Article.gs — writes one article into one row.
 * Rule: generated rows always end as REVIEW_REQUIRED (a human checks facts
 * before anything is READY). Nothing here publishes to Blogger.
 */

var ARTICLE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    seoTitle: { type: 'STRING' },
    metaDescription: { type: 'STRING' },
    keywords: { type: 'ARRAY', items: { type: 'STRING' } },
    articleHtml: { type: 'STRING' },
    sources: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: {
        title: { type: 'STRING' }, url: { type: 'STRING' }, note: { type: 'STRING' } },
        required: ['title', 'url'] }
    },
    claimsToVerify: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['seoTitle', 'metaDescription', 'keywords', 'articleHtml', 'sources', 'claimsToVerify']
};

function buildArticlePrompt_(topic, brief) {
  var researchBlock = brief ? [
    '',
    'RESEARCH BRIEF (gathered with Google Search; the ONLY source of specific figures you may use):',
    brief,
    'Rules for the brief: you may quote a figure only if it appears above, and you must name its source and the date/period it refers to in the sentence (e.g. "according to RBI, as of ..."). Skip anything marked NOT FOUND. Everything else must stay qualitative.'
  ] : [
    '',
    'NO RESEARCH BRIEF IS AVAILABLE: do not state any specific current figure at all. Where a latest figure would normally be quoted (a policy rate, an inflation reading, an index level), write an editor placeholder exactly like [[ADD latest repo rate from RBI]] (at most 5 placeholders, each naming the figure and the official source). Everywhere else stay qualitative.'
  ];
  return [
    'You are an editor for "Globus Market Nexus", a financial education and market-analysis blog read mainly by retail investors in India and globally.',
    'Write one complete article in clear, natural, professional English on this topic: "' + topic + '"',
    '',
    'STRICT RULES:',
    '- Educational explanation and analysis only. Never give personal investment advice or tell readers to buy/sell specific securities.',
    '- Do NOT invent statistics, prices, index levels, percentages, dates, quotes, news events, or studies. If a number is needed, describe the concept qualitatively and tell the reader which official source to check for the latest figure.',
    '- Clearly separate: established concepts/historical patterns, your analysis (use words like "may", "can", "often"), and current data (which you cannot know; say it must be checked).',
    '- Sources: list ONLY well-known official or reputable organisations and give their main website address (for example the central bank, market regulator, stock exchange, statistics office). Do NOT make up deep links to specific pages or reports.',
    '- In "claimsToVerify" list every statement a human editor should fact-check before publishing.',
    '- Avoid filler and repetition. Original wording.',
    '- Write like an experienced finance writer explaining to an intelligent friend: varied sentence length, concrete everyday examples (clearly labelled as hypothetical, e.g. "Suppose an investor holds..."), short paragraphs, plain words, no hype.',
    '- Do NOT invent personal experience, anecdotes about yourself, credentials, interviews, or quotes. Never write "in my 10 years of trading" or similar.',
    '- Avoid stock AI phrases such as "in today\'s fast-paced world", "delve", "it is important to note", "unlock", "navigating the landscape", "in conclusion".',
    '- Include a short "Key takeaways" bullet list near the end, and a practical "Common mistakes" section where it fits the topic.',
    '',
    'ARTICLE STRUCTURE (HTML for a blog post body, no <html>/<body>/<h1>):',
    '- An introduction paragraph, then 4 to 6 sections each starting with an <h2> heading (use <h3> sparingly), using <p>, <ul>, <li>, <strong>.',
    '- A final <h2>Conclusion</h2> section. Target 1200 to 1500 words (never fewer than 1100).',
    '- Do not include a sources list or a disclaimer inside articleHtml; those are added automatically.',
    '',
    'Also return: seoTitle (max 60 characters), metaDescription (max 155 characters), keywords (5 to 10 short phrases), sources, claimsToVerify.',
    'Return ONLY valid JSON matching the requested schema.'
  ].concat(researchBlock).join('\n');
}

/** Pulls a JSON object out of model text (handles ```json fences). */
function parseModelJson_(text) {
  var t = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(t);
}

/**
 * Asks Gemini to lengthen a draft that is ONLY too short. It must not add new facts.
 * Returns the parsed JSON of the expanded article.
 */
function expandArticle_(article, topic) {
  var words = countWords_(article.articleHtml);
  var prompt = [
    'Below is a finished draft article (JSON) for the finance blog "Globus Market Nexus" on the topic: "' + topic + '".',
    'It has only ' + words + ' words. Return the SAME JSON structure with articleHtml expanded to 1300-1500 words.',
    'Expand by explaining each section in more depth, adding clearly hypothetical worked examples ("Suppose..."), a "Common mistakes" section, and a short FAQ (3 questions) as <h2>/<p>.',
    'STRICT: do not add any new statistic, date, price, quote, news event or named study. Keep every existing [[ADD ...]] placeholder. Keep the HTML rules (no <h1>, no scripts). Do not add a sources list or disclaimer inside articleHtml.',
    'Keep seoTitle, metaDescription, keywords, sources and claimsToVerify (add to claimsToVerify only if you add a claim a human should check).',
    'Return ONLY valid JSON.',
    '',
    JSON.stringify(article)
  ].join('\n');
  var text = geminiGenerateWithFallback_({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.6, maxOutputTokens: CFG.GEMINI_MAX_OUTPUT_TOKENS,
      responseMimeType: 'application/json', responseSchema: ARTICLE_SCHEMA
    }
  });
  return parseModelJson_(text);
}

function countWords_(html) {
  var plain = String(html).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').trim();
  return plain ? plain.split(/\s+/).length : 0;
}

/**
 * Checks the model output. errors = must fix (row becomes ERROR).
 * warnings = allowed, but shown to the reviewer in a cell note.
 */
function validateArticle_(a) {
  var errors = [], warnings = [];
  if (!a || typeof a !== 'object') return { errors: ['Output is not a JSON object.'], warnings: [] };
  ['seoTitle', 'metaDescription', 'articleHtml'].forEach(function (k) {
    if (typeof a[k] !== 'string' || !a[k].trim()) errors.push('Missing "' + k + '".');
  });
  if (!Array.isArray(a.keywords) || a.keywords.length < 3) errors.push('Need at least 3 keywords.');
  if (!Array.isArray(a.sources)) errors.push('"sources" must be a list.');
  if (!Array.isArray(a.claimsToVerify)) a.claimsToVerify = [];
  if (errors.length) return { errors: errors, warnings: warnings };

  if (a.seoTitle.length > 70) warnings.push('SEO title is ' + a.seoTitle.length + ' characters (aim for 60 or fewer).');
  if (a.metaDescription.length > 160) warnings.push('Meta description is ' + a.metaDescription.length + ' characters (aim for 155 or fewer).');
  var words = countWords_(a.articleHtml);
  if (words < CFG.ARTICLE_MIN_WORDS) errors.push('Article too short: ' + words + ' words (minimum ' + CFG.ARTICLE_MIN_WORDS + ').');
  var h2 = (a.articleHtml.match(/<h2[\s>]/gi) || []).length;
  if (h2 < 3) errors.push('Article needs at least 3 <h2> sections (found ' + h2 + ').');
  if (/<\s*(script|iframe|style|object|embed)/i.test(a.articleHtml) || /\son\w+\s*=/i.test(a.articleHtml)) {
    errors.push('Article contains disallowed HTML (script/iframe/style or event handlers).');
  }
  var ph = (a.articleHtml.split(CFG.PLACEHOLDER_MARK).length - 1);
  if (ph > CFG.MAX_PLACEHOLDERS) errors.push('Too many editor placeholders (' + ph + ').');
  if (ph > 0) warnings.push('FILL BEFORE PUBLISHING: ' + ph + ' placeholder(s) marked ' + CFG.PLACEHOLDER_MARK + ' ... ]] need a real figure from an official source.');
  if (/<h1[\s>]/i.test(a.articleHtml)) warnings.push('Article contains an <h1>; Blogger already uses the post title as the main heading.');
  if (/\d+(\.\d+)?\s*%/.test(a.articleHtml)) warnings.push('Article contains percentage figures. Verify every number against an official source.');
  a.sources.forEach(function (s, i) {
    if (!s || typeof s.url !== 'string' || !/^https:\/\/[^\s]+\.[^\s]+$/.test(s.url)) {
      warnings.push('Source ' + (i + 1) + ' has no valid https URL and was dropped.');
    }
  });
  return { errors: errors, warnings: warnings };
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Adds the sources list and the standard disclaimer. */
function finalizeArticleHtml_(a) {
  var html = a.articleHtml.trim();
  var good = a.sources.filter(function (s) { return s && /^https:\/\/[^\s]+\.[^\s]+$/.test(s.url || ''); });
  if (good.length) {
    html += '\n<h2>Sources and further reading</h2>\n<ul>\n' + good.map(function (s) {
      return '<li><a href="' + escapeHtml_(s.url) + '" rel="noopener nofollow" target="_blank">' +
        escapeHtml_(s.title || s.url) + '</a>' + (s.note ? ' &ndash; ' + escapeHtml_(s.note) : '') + '</li>';
    }).join('\n') + '\n</ul>';
  }
  html += '\n<p><em>Disclaimer: This article is for educational purposes only and is not investment, tax or legal advice. ' +
    'Markets involve risk. Check current data with official sources and consult a qualified adviser before making decisions.</em></p>';
  return html;
}

/** Generates content for one row. Returns {ok, message}. */
function generateArticleForRow_(sheet, row) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    return { ok: false, message: 'Another run is in progress. Wait for it to finish and try again.' };
  }
  try {
    var topic = String(sheet.getRange(row, COL.TOPIC).getValue()).trim();
    var status = String(sheet.getRange(row, COL.STATUS).getValue()).trim();
    if (!topic) return { ok: false, message: 'Row ' + row + ' has no topic.' };
    if (new RegExp(CFG.PERSON_TOPIC_REGEX, 'i').test(topic)) {
      var msg = 'This topic is about a specific real person (biography / "who is ..."). The tool has no verified facts about people, so it would invent them. Not written. Write such pages (e.g. your About page) yourself from real facts, or choose a finance education topic.';
      sheet.getRange(row, COL.STATUS).setValue(STATUS.ERROR);
      logEvent_('ERROR', 'generateArticleForRow_', row, msg);
      return { ok: false, message: 'Row ' + row + ' refused: ' + msg };
    }
    if (status && status !== STATUS.TOPIC && status !== STATUS.ERROR) {
      return { ok: false, message: 'Row ' + row + ' has status ' + status + '. Only TOPIC or ERROR rows are generated (this prevents overwriting finished work).' };
    }

    sheet.getRange(row, COL.STATUS).setValue(STATUS.GENERATING);
    SpreadsheetApp.flush();

    try {
      var research = CFG.USE_GROUNDING ? geminiResearch_(topic) : { ok: false, error: 'research switched off in Config.gs' };
      var extraNotes = [];
      if (!research.ok) {
        extraNotes.push('NO LIVE DATA: ' + (CFG.USE_GROUNDING ? 'research step failed (' + research.error + ')' : 'research is switched off') + '. Article has no current figures - add them yourself from official sources.');
        if (CFG.USE_GROUNDING) logEvent_('WARN', 'generateArticleForRow_', row, 'Research failed: ' + research.error);
      }
      if (!research.ok && new RegExp(CFG.REALTIME_TOPIC_REGEX, 'i').test(topic)) {
        throw new Error('This topic needs live market data (prices, stock lists, today\'s moves) and no verified data source is connected, so the tool refuses to write it (it would have to invent names or numbers). Rewrite it as an educational topic, e.g. "What is an upper circuit and how does it work?", then set Status back to TOPIC.');
      }
      var body = {
        contents: [{ parts: [{ text: buildArticlePrompt_(topic, research.ok ? research.brief : '') }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: CFG.GEMINI_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
          responseSchema: ARTICLE_SCHEMA
        }
      };
      var text;
      try {
        text = geminiGenerateWithFallback_(body);
      } catch (e) {
        if (e.httpCode === 400 && !/api key/i.test(e.rawDetail || '')) {
          // Some models reject schemas: retry once with JSON mode only (prompt still demands the shape).
          delete body.generationConfig.responseSchema;
          text = geminiGenerateWithFallback_(body);
        } else { throw e; }
      }
      var article;
      try { article = parseModelJson_(text); }
      catch (pe) { throw new Error('Model did not return valid JSON: ' + pe.message); }

      var v = validateArticle_(article);
      var expandTries = 0;
      while (v.errors.length === 1 && /too short/.test(v.errors[0]) && expandTries < CFG.MAX_EXPAND_ATTEMPTS) {
        expandTries++;
        logEvent_('INFO', 'generateArticleForRow_', row, 'Draft too short (' + countWords_(article.articleHtml) + ' words). Expanding, attempt ' + expandTries + '.');
        article = expandArticle_(article, topic);
        v = validateArticle_(article);
      }
      if (v.errors.length) throw new Error('Validation failed: ' + v.errors.join(' | '));

      // Phase 4: merge research sources, open every link, drop dead ones.
      var verified = verifySources_((article.sources || []).concat(research.ok ? research.sources : []));
      article.sources = verified.kept;
      var notes = extraNotes.concat(v.warnings, verified.notes, article.claimsToVerify.map(function (c) { return 'VERIFY: ' + c; }));
      var html = finalizeArticleHtml_(article);

      // Write columns B-D in one go; F (keywords) and G (status). Column E (image) is untouched.
      sheet.getRange(row, COL.SEO_TITLE, 1, 3).setValues([[article.seoTitle.trim(), article.metaDescription.trim(), html]]);
      sheet.getRange(row, COL.KEYWORDS).setValue(article.keywords.join(', '));
      sheet.getRange(row, COL.ARTICLE).setNote(notes.length ? notes.join('\n').substring(0, 4000) : '');
      sheet.getRange(row, COL.STATUS).setValue(STATUS.REVIEW_REQUIRED);
      logEvent_('INFO', 'generateArticleForRow_', row, 'Generated ' + countWords_(article.articleHtml) + ' words with ' + lastModelUsed_ + '; ' + notes.length + ' review notes.');
      return { ok: true, message: 'Row ' + row + ' generated (' + countWords_(article.articleHtml) + ' words). Status: REVIEW_REQUIRED. Hover the Article cell for review notes.' };
    } catch (e) {
      sheet.getRange(row, COL.STATUS).setValue(STATUS.ERROR);
      logEvent_('ERROR', 'generateArticleForRow_', row, e.message);
      return { ok: false, message: 'Row ' + row + ' failed: ' + scrub_(e.message) + ' (see Logs sheet)' };
    }
  } finally {
    lock.releaseLock();
  }
}

/** Menu: generates the article for the row you have selected. */
function generateArticleForSelectedRow() {
  var sheet = SpreadsheetApp.getActiveSheet();
  if (sheet.getName() !== CFG.SHEET_NAME) {
    notify_('Generate Article', 'Click a cell in the "' + CFG.SHEET_NAME + '" tab first.');
    return;
  }
  var row = sheet.getActiveRange().getRow();
  if (row < CFG.FIRST_DATA_ROW) {
    notify_('Generate Article', 'Select a topic row (row 2 or lower), not the header.');
    return;
  }
  var res = generateArticleForRow_(sheet, row);
  notify_(res.ok ? 'Article generated' : 'Article not generated', res.message);
}

// ============================================================
// Menu
// ============================================================
/**
 * Globus AI Content Studio — Menu.gs — adds the "Globus AI Studio" menu when the Sheet opens.
 * Only items that exist and are tested are listed. More arrive in later phases.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Globus AI Studio')
    .addItem('Show Status (version check)', 'showStudioStatus')
    .addItem('Setup Content Studio', 'setupContentStudio')
    .addItem('Set Gemini API Key', 'setGeminiApiKey')
    .addItem('Test Connections', 'testConnections')
    .addItem('Test Research (Google Search)', 'testResearchConnection')
    .addItem('Generate Article', 'generateArticleForSelectedRow')
    .addToUi();
}

/** Runs every connection test that exists so far. */
function testConnections() {
  testSheetsConnection();
  testGeminiConnection();
  // Phase 6 will add testBloggerConnection().
}

/** Shows which version is installed and the key settings. Never shows the API key itself. */
function showStudioStatus() {
  var props = PropertiesService.getScriptProperties();
  var lines = [
    'Version: ' + CFG.VERSION,
    'Gemini API key saved: ' + (props.getProperty('GEMINI_API_KEY') ? 'YES' : 'NO (use Set Gemini API Key)'),
    'Main model: ' + getGeminiModel_(),
    'Fallback model: ' + (props.getProperty('GEMINI_FALLBACK_MODEL') || CFG.GEMINI_FALLBACK_MODEL),
    'Google Search research (USE_GROUNDING): ' + (CFG.USE_GROUNDING ? 'ON' : 'OFF'),
    'Article length target: 1200-1500 words (minimum accepted: ' + CFG.ARTICLE_MIN_WORDS + ')',
    'Worksheet "' + CFG.SHEET_NAME + '": ' + (getContentSheet_() ? 'found' : 'MISSING - run Setup Content Studio')
  ];
  notify_('Globus AI Content Studio - Status', lines.join('\n'));
}
