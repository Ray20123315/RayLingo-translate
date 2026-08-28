import puppeteer from 'puppeteer';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';

const extensionPath = path.resolve(process.argv[2] || 'release-work/chromium');
const html = '<!doctype html><meta charset="utf-8"><p id="probe">RayLingo runtime selection probe text.</p>';
const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
});
await new Promise((resolve, reject) => server.listen(8123, '127.0.0.1', err => err ? reject(err) : resolve()));

const browser = await puppeteer.launch({
  headless: 'new',
  pipe: true,
  enableExtensions: [extensionPath],
});

async function waitValue(page, fn, timeout = 15000) {
  await page.waitForFunction(fn, { timeout });
  return page.evaluate(fn);
}

try {
  const workerTarget = await browser.waitForTarget(
    target => target.type() === 'service_worker' && target.url().endsWith('/service-worker.js'),
    { timeout: 20000 },
  );
  const extensionId = new URL(workerTarget.url()).host;
  if (!extensionId) throw new Error('Extension ID unavailable');

  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
  await waitValue(popup, () => document.documentElement.dataset.integrity === 'verified');
  const popupIds = [
    'selectionMode','selectionSourceLanguage','selectionTargetLanguage','typingEffectToggle',
    'floatingWidgetEnabled','floatingWidgetHoverExpand','floatingWidgetStartCollapsed',
    'translationProvider','multimodalFile','videoSubtitleEnabled','videoTranscriptButton',
  ];
  const popupState = await popup.evaluate(ids => ({
    version: chrome.runtime.getManifest().version,
    integrity: document.documentElement.dataset.integrity,
    ids: ids.map(id => [id, Boolean(document.getElementById(id))]),
  }), popupIds);
  if (popupState.version !== '0.7.1' || popupState.integrity !== 'verified' || popupState.ids.some(([, ok]) => !ok)) {
    throw new Error(`Popup gate failed: ${JSON.stringify(popupState)}`);
  }

  await popup.evaluate(async () => {
    await chrome.storage.local.set({
      floatingWidgetEnabled: false,
      selectionMode: 'auto',
      remoteFallbackEnabled: false,
    });
  });

  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#probe');
  if (await page.$('#__raylingo_root__')) throw new Error('Selection-only mode mounted root before selection');
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.getElementById('probe'));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
  await page.waitForSelector('#__raylingo_root__', { timeout: 15000 });

  await popup.evaluate(async () => {
    await chrome.storage.local.set({
      floatingWidgetEnabled: true,
      floatingWidgetHoverExpand: true,
      floatingWidgetStartCollapsed: true,
      floatingWidgetCollapsed: true,
      selectionMode: 'off',
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#__raylingo_root__', { timeout: 15000 });

  const stored = await popup.evaluate(async () => chrome.storage.local.get([
    'floatingWidgetEnabled','floatingWidgetHoverExpand','floatingWidgetStartCollapsed','floatingWidgetCollapsed','selectionMode',
  ]));
  if (!stored.floatingWidgetEnabled || !stored.floatingWidgetHoverExpand || !stored.floatingWidgetStartCollapsed || !stored.floatingWidgetCollapsed || stored.selectionMode !== 'off') {
    throw new Error(`Persistent widget preferences failed: ${JSON.stringify(stored)}`);
  }

  const workspace = await browser.newPage();
  await workspace.goto(`chrome-extension://${extensionId}/workspace.html`, { waitUntil: 'domcontentloaded' });
  await waitValue(workspace, () => document.documentElement.dataset.integrity === 'verified');
  const workspaceIds = ['geminiModel','geminiApiKey','deepseekModel','deepseekApiKey','geminiTestButton','deepseekTestButton','remoteMediaConsent'];
  const workspaceState = await workspace.evaluate(ids => ids.map(id => [id, Boolean(document.getElementById(id))]), workspaceIds);
  if (workspaceState.some(([, ok]) => !ok)) throw new Error(`Workspace AI gate failed: ${JSON.stringify(workspaceState)}`);

  console.log(`Chromium/Puppeteer runtime PASS ${extensionId}`);
} finally {
  await browser.close().catch(() => {});
  await new Promise(resolve => server.close(resolve));
}
