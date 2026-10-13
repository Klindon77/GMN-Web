/**
 * Globus AI Content Studio — Menu.gs — adds the "Globus AI Studio" menu when the Sheet opens.
 * Only items that exist and are tested are listed. More arrive in later phases.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Globus AI Studio')
    .addItem('Setup Content Studio', 'setupContentStudio')
    .addItem('Set Gemini API Key', 'setGeminiApiKey')
    .addItem('Test Connections', 'testConnections')
    .addItem('Generate Article', 'generateArticleForSelectedRow')
    .addToUi();
}

/** Runs every connection test that exists so far. */
function testConnections() {
  testSheetsConnection();
  testGeminiConnection();
  // Phase 6 will add testBloggerConnection().
}
