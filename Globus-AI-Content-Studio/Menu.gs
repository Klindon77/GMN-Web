/**
 * Globus AI Content Studio — Menu.gs — adds the "Globus AI Studio" menu when the Sheet opens.
 * Only items that exist and are tested are listed. More arrive in later phases.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Globus AI Studio')
    .addItem('Setup Content Studio', 'setupContentStudio')
    .addItem('Test Connections', 'testConnections')
    .addToUi();
}

/** Runs every connection test that exists so far. */
function testConnections() {
  testSheetsConnection();
  // Phase 3 will add testGeminiConnection(); Phase 6 testBloggerConnection().
}
