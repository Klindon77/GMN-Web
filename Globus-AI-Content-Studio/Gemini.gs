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
    Utilities.sleep(2000 * Math.pow(2, i - 1)); // 2s, 4s
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
