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
    'NO RESEARCH BRIEF IS AVAILABLE: do not state any specific current figure at all. Stay qualitative and tell readers where to check the latest numbers.'
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
