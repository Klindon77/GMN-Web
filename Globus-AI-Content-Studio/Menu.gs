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
