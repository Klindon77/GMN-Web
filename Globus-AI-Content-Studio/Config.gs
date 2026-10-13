/**
 * Globus AI Content Studio — Config.gs — the ONE place for shared settings and names.
 * Secrets (API keys) are NOT stored here. They go in
 * Project Settings > Script Properties (added in later phases).
 */
var CFG = {
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
