/**
 * Config.gs — the ONE place for shared settings and names.
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
