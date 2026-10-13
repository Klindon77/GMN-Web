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
