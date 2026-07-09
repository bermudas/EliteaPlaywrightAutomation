import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  test as base,
  expect,
  type BrowserContext,
  type ConsoleMessage,
  type Page,
  type Response,
} from '@playwright/test';
import { env } from './fixtures/env';
import {
  ArtifactsPage,
  dragOverComposer,
  dropDraggedFile,
  expectComposerDragActiveBorder,
  extractUploadUuid,
  parseAttachmentUrl,
  pasteFromClipboard,
  trackAttachmentUploads,
  writeImageToClipboard,
  type AttachmentUploadEntry,
} from './pages/artifacts.page';
import { dismissAnnouncementBanner } from './pages/entityForm.page';

/**
 * @artifacts suite -- TC-030 through TC-043, implemented from the AFS files
 * at test-specs/artifacts/l*_*_TC-0{30..43}.md (analyst: qa-engineer,
 * implementer: test-automation-engineer). Module-per-spec-file per
 * `.agents/testing.md` § Structure. This is the FINAL module of the
 * WebQAPreExecuted batch (agents -> pipelines -> modal-handling ->
 * lazy-loading -> artifacts).
 *
 * Like `tests/agents.spec.ts`/`tests/pipelines.spec.ts`/
 * `tests/modal-handling.spec.ts`/`tests/lazy-loading.spec.ts` and UNLIKE
 * `tests/smoke.spec.ts`, this suite does NOT use `mode: 'serial'` -- every
 * one of the 14 AFS files in this batch independently creates its own
 * fresh, isolated conversation and cleans up (or deliberately doesn't, per
 * its own AFS) its own fixture, with no dependency on a sibling case's
 * end-state.
 *
 * **Architecture, per the module dispatch's explicit directives:**
 *   - `tests/pages/artifacts.page.ts` (existing, created for TC-062's
 *     empty/loading-state needs) is grown substantially here: file-chooser
 *     upload (`page.waitForEvent('filechooser')` + `fileChooser.setFiles()`,
 *     NOT raw `setInputFiles` -- 2 ambiguous `input[type=file]` elements
 *     exist), the plus-menu -> attach-files click sequencing, hover-reveal
 *     of `.attachActionButtons` (scoped to the container, NOT the inner
 *     image -- clicking the image times out, TC-037), download capture
 *     (`page.waitForEvent('download')`), delete-with-purge-checkbox, and the
 *     Artifacts bucket's S3-listing JSON endpoint for authoritative
 *     file-count/presence verification.
 *   - Drag-and-drop (TC-040) uses the verified technique: a synthesized
 *     `DataTransfer`+`File` via `page.evaluateHandle`, dispatching
 *     `dragenter`/`dragover`/`drop` on `getByTestId('chat-input')`.
 *   - Clipboard paste (TC-041) uses the verified technique: granted
 *     `clipboard-read`/`clipboard-write` context permissions,
 *     `page.evaluate()` decoding a base64 fixture into a `Blob` and calling
 *     `navigator.clipboard.write([new ClipboardItem(...)])`, then
 *     `Meta+V`/`Control+V`.
 *   - Batch uploads (TC-039/042/043) use `fileChooser.setFiles([...])` with
 *     an array of paths.
 *   - Every test creates its own fresh conversation (never a shared one) and
 *     uses the authoritative network response (`filepath`/`file_size` on
 *     upload, the S3-listing JSON for bucket state, `DELETE` response status
 *     for cleanup) over UI-only text checks, per every AFS's own explicit
 *     recommendation.
 *
 * **TC-035 -- `defect-found` (GH#114, Major, isolated, non-blocking).** The
 * GIF "first-frame-only" contract is violated in 2 of 3 render surfaces (the
 * chat message's own preview modal and the Artifacts bucket's preview panel
 * both auto-play the animation; only the inline chat thumbnail is correctly
 * static). Per Hard Rule 2's decision tree, the two affected assertions use
 * `expect.soft()` with a `// Known defect: GH#114` comment, asserting the
 * DOCUMENTED-CORRECT (static, first-frame-only) behavior -- never weakened
 * to match the buggy animated behavior (that would mask a future regression
 * as well as silently stop testing for the fix landing). See that test's own
 * comments for the two-screenshot(src)-apart technique used to prove
 * animation from a static-assertion harness.
 *
 * **Known-defect handling per each AFS's own disposition** (not a blanket
 * rule -- see the referenced test for the exact call):
 *   - GH#113 (TC-038, EXE upload): silent rejection with no error message is
 *     this case's own PASS condition (asserted as the live/confirmed
 *     contract), not soft-asserted.
 *   - GH#119 (TC-034): preview modal doesn't close on Escape -- `expect.soft()`
 *     on the ESC-dismiss sub-check only; X-button and backdrop-click are
 *     hard-asserted (both confirmed working).
 *   - GH#116/#109/#112/#115/#117/#118/#120/#121/#122: documentation/
 *     case-text-drift clarifications or informational findings with no
 *     required test-level handling beyond what each test below implements
 *     (e.g. GH#116's stray 404 is allow-listed specifically in TC-030's
 *     console-error check; GH#109/#112 reframe TC-032/TC-031 as positive
 *     upload-succeeds cases per the reverse-masking guard).
 *
 * Auth: same worker-scoped-storageState + test-scoped-context pattern as
 * every other WebQAPreExecuted-module spec file (see `tests/agents.spec.ts`'s
 * own doc comment for the full rationale). `trackConsoleErrors()` below is
 * duplicated for the SIXTH time (`tests/smoke.spec.ts` ->
 * `tests/agents.spec.ts` -> `tests/pipelines.spec.ts` ->
 * `tests/modal-handling.spec.ts` -> `tests/lazy-loading.spec.ts` -> here) --
 * per `.agents/testing.md` § Structure's own planned framework-scale
 * follow-up, this is the last occurrence before that dedicated extraction PR
 * (scheduled after all 5 modules are merged, per that section's own note).
 */

type StorageState = Awaited<ReturnType<BrowserContext['storageState']>>;

const test = base.extend<{ authenticatedPage: Page }, { artifactsStorageState: StorageState }>({
  artifactsStorageState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${env.BASE_URL}/app/chat/`);
      await page.getByRole('textbox', { name: 'Username or email' }).fill(env.ELITEA_EMAIL);
      await page.getByRole('textbox', { name: 'Password' }).fill(env.ELITEA_PASSWORD);
      await page.getByRole('button', { name: 'Sign In' }).click();
      await page.waitForURL(/\/app\/chat/);
      const storageState = await context.storageState();
      await context.close();
      await use(storageState);
    },
    // Same generous timeout rationale as every other module's own auth
    // fixture -- a real Keycloak round-trip observed anywhere from ~3s to
    // ~14s across implementation runs against the shared live environment.
    { scope: 'worker', timeout: 60_000 },
  ],
  authenticatedPage: async ({ browser, artifactsStorageState }, use) => {
    const context = await browser.newContext({ storageState: artifactsStorageState });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * Committed fixture files shared across this module -- `tests/fixtures/artifacts/`.
 *
 * **Post-merge review fix (PR #123 follow-up)**: this module originally
 * pointed at the gitignored, local-only
 * `Elitea-testing-WebQAPreExecuted/Elitea_test_data/artifacts/*` directory
 * (per `.agents/test-automation.yaml` § additional_sources) -- which meant
 * the fixtures this suite depends on were never committed, so the entire
 * `@artifacts` suite could not run in CI at all (every `fixturePath()` call
 * resolved to a path that didn't exist on a fresh checkout). Compounding
 * this, `.gitignore` carried a case-typo (`webQAPreExecuted` vs. the real
 * `WebQAPreExecuted`) that happened to make the gap invisible locally --
 * macOS defaults to a case-insensitive filesystem/git config
 * (`core.ignorecase=true`), so `git check-ignore` reported a match despite
 * the pattern being wrong; the project's actual CI runner (`ubuntu-latest`)
 * is case-sensitive, so the directory was never actually ignored there
 * either -- moot only because nothing referenced it from a committed path.
 * Fixed by establishing `tests/fixtures/artifacts/` as this project's first
 * committed-binary-fixture convention (no prior precedent existed) and
 * copying the byte-identical files the module actually needs (verified via
 * SHA-256 against the original WebQAPreExecuted copies) so `actions/
 * checkout` alone makes them available in CI -- no separate provisioning
 * step required. `test-large-image.png` (27MB, TC-033 only) is deliberately
 * NOT among the copied files -- see `buildOversizedImagePayload()` below.
 */
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'artifacts');

function fixturePath(fileName: string): string {
  return path.join(FIXTURES_DIR, fileName);
}

/**
 * Builds an in-memory oversized PNG `FilePayload` for TC-033's size-limit
 * rejection test, instead of committing a 27MB binary fixture to the repo.
 * Seeds from the genuinely-valid, already-committed `test-image-small.png`
 * and pads its raw bytes with zero-filled filler -- this app's own
 * size-limit check is confirmed (TC-033's AFS, § Network Behavior) to be an
 * immediate, client-side, no-server-round-trip rejection based on the
 * `File`/`Blob`'s own byte length, not on decoding pixel content, so a
 * decodable-past-IEND-or-not PNG makes no difference to the assertion under
 * test (the toast's exact wording/threshold-number is asserted via a shape
 * regex, per TC-033's own AFS Axis-2 addition, precisely so it doesn't
 * depend on today's specific enforced limit). `targetBytes` only needs to
 * clear whatever threshold is live (confirmed 3MB as of this AFS, previously
 * documented as high as 5MB/20MB depending on source -- see GH#115) with
 * comfortable margin; 4MB does that without the repo/CI cost of a
 * multi-megabyte fixture, committed or generated-to-disk.
 */
function buildOversizedImagePayload(fileName: string, targetBytes: number): { name: string; mimeType: string; buffer: Buffer } {
  const seed = fs.readFileSync(fixturePath('test-image-small.png'));
  const buffer = seed.length >= targetBytes ? seed : Buffer.concat([seed, Buffer.alloc(targetBytes - seed.length, 0)]);
  return { name: fileName, mimeType: 'image/png', buffer };
}

/**
 * Root-caused during implementation (not documented by any AFS -- every AFS
 * ran its own case exactly once): the shared `${TEST_USER}` account's chat
 * backend appears to route a "new conversation" first-message send to an
 * EXISTING conversation that already carries the identical literal message
 * text, rather than creating a genuinely new one -- confirmed via direct
 * reproduction (a fixed literal string reliably landed in a stale
 * conversation from an earlier run; an otherwise-identical send with a
 * unique string immediately created a fresh conversation). Every AFS's own
 * message text is a fixed literal (e.g. "Test image upload") because each
 * analyst executed their case exactly once -- automated re-runs (dev
 * iteration, CI, the orchestrator's independent 3-run gate) collide on that
 * literal every subsequent run. Appending a per-run-unique suffix sidesteps
 * this entirely, the same instinct already established project-wide via
 * `uniqueEntityName()` (`tests/fixtures/testData.ts`) for Agent/Pipeline
 * names -- not reused directly here since it enforces a 32-char cap that
 * doesn't apply to (and would truncate) a chat message string.
 */
function uniqueMessage(text: string): string {
  return `${text} ${Date.now()}`;
}

/** Suite-local helper: collects console `error`-level messages for the
 * duration it's attached. See this file's own doc comment on why this is
 * duplicated rather than extracted at this point (last occurrence before
 * the scheduled framework-scale extraction). */
function trackConsoleErrors(page: Page) {
  const errors: string[] = [];
  const listener = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  };
  page.on('console', listener);
  return {
    errors,
    stop: () => page.off('console', listener),
  };
}

/**
 * Sends the composer's current content (with whatever attachment is already
 * staged) and captures the authoritative upload response -- shared by every
 * single-attachment test in this module (Hard Rule 7 extraction; every AFS's
 * own step sequence converges on this exact "type text, click Send, assert
 * the `201`, capture filepath/file_size/uuid" shape). `expectedFileName`,
 * when given, cross-checks the response body against a caller-known
 * filename (most cases); omitted for clipboard-paste (TC-041), whose
 * server-generated filename isn't knowable in advance -- the returned
 * `fileName` is always derived straight from the response body either way.
 */
async function sendAndCaptureUpload(
  page: Page,
  artifacts: ArtifactsPage,
  messageText: string,
  expectedFileName?: string,
): Promise<{ projectId: string; conversationId: string; uuid: string; fileSize: number; fileName: string }> {
  await artifacts.typeMessage(messageText);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => /\/attachments\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.request().method() === 'POST' && r.status() === 201,
    ),
    artifacts.sendMessage(),
  ]);
  const body = (await response.json()) as AttachmentUploadEntry[];
  if (expectedFileName) {
    expect(body[0].filepath).toContain(expectedFileName);
  }
  const { projectId, conversationId } = parseAttachmentUrl(response.url());
  const uuid = extractUploadUuid(body[0].filepath);
  const fileName = path.basename(body[0].filepath);
  await expect(page).toHaveURL(new RegExp(`/app/chat/${conversationId}`));
  return { projectId, conversationId, uuid, fileSize: body[0].file_size, fileName };
}

/**
 * Attach-via-file-chooser + send, in one call -- the common shape for every
 * case that uploads through the composer's plus-menu (TC-030/031/032/034/
 * 035/036/037). Not used by TC-040 (drag-and-drop) / TC-041 (clipboard
 * paste), which stage the attachment through a different mechanism before
 * calling `sendAndCaptureUpload()` directly.
 */
async function attachFileAndSend(
  page: Page,
  artifacts: ArtifactsPage,
  filePath: string,
  messageText: string,
): Promise<{ projectId: string; conversationId: string; uuid: string; fileSize: number; fileName: string }> {
  const fileName = path.basename(filePath);
  await artifacts.attachFiles(filePath);
  await expect(artifacts.preSendChip(fileName)).toBeVisible();
  return sendAndCaptureUpload(page, artifacts, messageText, fileName);
}

/**
 * Row-checkbox + toolbar-delete-entity + confirm teardown, followed by an
 * authoritative S3-listing re-fetch proving the folder's own keys are gone
 * -- shared by every case whose own AFS asks for Artifacts-bucket-side
 * cleanup (TC-030/034/035/039/040/042). Not used for TC-036/037/041, whose
 * own AFS specifically requires the chat-message-side removal flow instead
 * (`ArtifactsPage.removeAttachmentFromChatMessage()`) -- see each of those
 * tests' own teardown for why (GH#122 in TC-041's case: the Artifacts-page-
 * only delete path does NOT cascade to the chat message that uploaded it).
 */
async function deleteArtifactAndVerify(
  artifacts: ArtifactsPage,
  bucket: string,
  projectId: string,
  uuid: string,
  fileNames: string[],
): Promise<void> {
  await artifacts.openBucketFolder(bucket, uuid);
  const rows = fileNames.map((name) => artifacts.artifactsFileRow(name));
  for (const row of rows) {
    await expect(row).toBeVisible({ timeout: 20_000 });
  }
  await artifacts.deleteViaRowCheckbox(rows);
  const listing = await artifacts.fetchBucketListing(bucket, projectId);
  expect(listing.contents?.some((c) => c.key.startsWith(`${uuid}/`)) ?? false).toBe(false);
}

test.describe('@artifacts', () => {
  // Real sequential network round-trips per case (attach, send, AI reply,
  // Artifacts bucket navigation, cleanup) against the shared live
  // environment -- same rationale as every other WebQAPreExecuted-module
  // suite's own describe-level timeout bump.
  test.describe.configure({ timeout: 120_000 });

  test('TC-030: upload a small image file via paperclip (PNG, < 1MB)', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    // Known defect GH#116: a stray, unqualified GET to the same
    // attachments-prompt_lib collection endpoint (no query params) 404s
    // shortly after every attachment-bearing message's AI reply finishes
    // rendering. Tracked via the network layer (not console-text matching,
    // which is a fragile proxy for browser-synthesized console messages) so
    // the console-error assertion can allow-list exactly this one known,
    // filed, non-blocking defect without masking any other regression.
    let gh116Fired = false;
    const gh116Listener = (r: Response) => {
      if (
        /\/attachments\/prompt_lib\/\d+\/\d+$/.test(r.url()) &&
        !r.url().includes('?') &&
        r.request().method() === 'GET' &&
        r.status() === 404
      ) {
        gh116Fired = true;
      }
    };
    page.on('response', gh116Listener);
    let upload: Awaited<ReturnType<typeof attachFileAndSend>> | undefined;
    const messageText = uniqueMessage('Test image upload');

    try {
      await test.step('1-3. Navigate to chat, dismiss the release-notes banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-7. Attach the fixture via the plus-menu file-chooser flow and send', async () => {
        upload = await attachFileAndSend(page, artifacts, fixturePath('test-image-small.png'), messageText);
        expect(upload.fileSize).toBe(8637);
      });

      await test.step('8. Sent message row shows the text and the attachment thumbnail', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.messageThumbnail('test-image-small.png', messageText)).toBeVisible();
      });

      await test.step("9. Assistant's reply demonstrably describes the actual uploaded image content", async () => {
        // Root-caused during implementation: the reply container mounts
        // (and passes a bare `toBeVisible()` check) before its actual text
        // streams in -- a one-shot `.textContent()` read right after
        // visibility raced an empty placeholder. `toContainText()` polls
        // until real content lands, the correct condition-wait here.
        //
        // Post-merge review fix: a bare `/\S/` regex only proves SOME text
        // arrived, not that the model genuinely processed the image -- this
        // AFS's own § Axis 2 explicitly calls for "the strongest available
        // proof the image was genuinely processed server-side," matching
        // TC-031/032/040/041's content-specific assertions. The fixture
        // (`test-image-small.png`, `generate_test_images.py`) renders the
        // literal text "Test Small" on a blue background -- a vision model
        // reading the image reliably transcribes that literal text (this
        // AFS's own observed run: "a solid blue background with the text
        // 'Test Small'... centered near the lower-middle area").
        await expect(artifacts.assistantReply(messageText)).toContainText(/Test Small/i, { timeout: 30_000 });
      });

      await test.step('10. Thumbnail is previewable via a forced click (GH#117 -- a plain click times out)', async () => {
        await artifacts.openThumbnailPreview('test-image-small.png', messageText);
        await expect(artifacts.previewModal()).toContainText('test-image-small.png');
        await artifacts.closePreviewModal();
      });

      await test.step('11-13. File appears in the Artifacts -> attachments bucket, correct Type/Size', async () => {
        await page.goto(`${env.BASE_URL}/app/artifacts`);
        await dismissAnnouncementBanner(page);
        await expect(artifacts.bucketRow('attach')).toBeVisible({ timeout: 20_000 });
        await expect(artifacts.bucketRow('attachments')).toBeVisible();
        await expect(artifacts.bucketRow('warranty')).toBeVisible();
        await artifacts.selectBucket('attachments');
        await expect(page).toHaveURL(/bucket=attachments/);
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow('test-image-small.png');
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('PNG Image');
        await expect(row).toContainText('8.4 KB');
      });

      await test.step('14. Bucket-info tooltip reports a non-zero file count (no persistent count badge exists)', async () => {
        const count = await artifacts.bucketFileCount();
        expect(count).toBeGreaterThan(0);
      });

      await test.step('15. Zero unexpected console errors (GH#116 stray 404 allow-listed if it fired)', async () => {
        const allowed = gh116Fired ? 1 : 0;
        expect(
          console_.errors.length,
          `expected at most ${allowed} console error(s) -- GH#116's stray 404 allow-listed: ${console_.errors.join(' | ')}`,
        ).toBeLessThanOrEqual(allowed);
      });
    } finally {
      console_.stop();
      page.off('response', gh116Listener);
      if (upload) {
        await test.step('Teardown: delete the uploaded file, verified via the authoritative S3 listing', async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', upload!.projectId, upload!.uuid, ['test-image-small.png']);
        });
      }
    }
  });

  test('TC-031: uploading a PDF document via chat succeeds and is read by the model (reframed positive, GH#112)', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-document.pdf');
    const messageText = uniqueMessage('Test PDF upload attempt');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step("4-5. Open the attach menu -- the accept allowlist is NOT image-only and explicitly lists .pdf (GH#112, case premise is stale)", async () => {
        const menu = await artifacts.openAttachMenu();
        const acceptValues = await artifacts.fileInputAcceptValues();
        for (const accept of acceptValues) {
          expect(accept).toContain('.pdf');
        }
        const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), artifacts.attachFilesMenuItem(menu).click()]);
        await fileChooser.setFiles(filePath);
      });

      await test.step('6. Attachment chip renders -- no rejection at the picker layer', async () => {
        await expect(artifacts.preSendChip('test-document.pdf')).toBeVisible();
      });

      let upload: Awaited<ReturnType<typeof sendAndCaptureUpload>>;
      await test.step('7-8. Type message, send -- 201, no rejection at any layer', async () => {
        upload = await sendAndCaptureUpload(page, artifacts, messageText, 'test-document.pdf');
        expect(upload.fileSize).toBe(606);
      });

      await test.step('9. Sent message shows the attachment card', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.attachmentFileCard(messageText, 'test-document.pdf')).toBeVisible();
      });

      await test.step("10-11. Assistant reply demonstrably quotes the PDF's own embedded text; no error/rejection UI anywhere", async () => {
        // toContainText() polls until the streamed reply lands -- a one-shot
        // textContent() read right after toBeVisible() raced an empty
        // placeholder (root-caused during implementation).
        await expect(artifacts.assistantReply(messageText)).toContainText(/Test PDF Document|PDFs not supported/i, {
          timeout: 30_000,
        });
        await expect(page.getByRole('alert')).toHaveCount(0);
      });

      await test.step('12. File appears in the attachments bucket, Type PDF Document, Size 606 B', async () => {
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow('test-document.pdf');
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('PDF Document');
        await expect(row).toContainText('606 B');
      });

      await test.step('13. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the PDF upload-and-read flow').toEqual([]);
      });
    } finally {
      console_.stop();
      // No cleanup -- this AFS's own explicit recommendation: additive,
      // non-destructive upload, same "chat history persists" precedent as
      // TC-001/TC-002 (`.agents/testing.md` § Test data strategy). A
      // delete-after-test step here adds one more concurrent mutation
      // against the shared account for no correctness benefit.
    }
  });

  test('TC-032: uploading a text file via chat succeeds and is read by the model (reframed positive, GH#109)', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-notes.txt');
    const messageText = uniqueMessage('Test text file upload attempt');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step("4-5. Open the attach menu -- the accept allowlist is NOT image-only and includes .txt (GH#109, case premise is stale)", async () => {
        const menu = await artifacts.openAttachMenu();
        const acceptValues = await artifacts.fileInputAcceptValues();
        for (const accept of acceptValues) {
          expect(accept).toContain('.txt');
        }
        const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), artifacts.attachFilesMenuItem(menu).click()]);
        await fileChooser.setFiles(filePath);
      });

      await test.step('6. Attachment chip renders -- no rejection at the picker layer', async () => {
        await expect(artifacts.preSendChip('test-notes.txt')).toBeVisible();
        // Post-merge review nit fix: this AFS's own step 4-5 Verify calls out
        // the "Attach Files (N left)" counter decrementing by exactly 1
        // (10 -> 9) -- `attachCounterText()` already exists and is used
        // correctly elsewhere in this module but wasn't called here.
        await expect(artifacts.attachCounterText()).toHaveAccessibleName(/9 left/);
      });

      let upload: Awaited<ReturnType<typeof sendAndCaptureUpload>>;
      await test.step('7-8. Type message, send -- 201, no rejection at any layer', async () => {
        upload = await sendAndCaptureUpload(page, artifacts, messageText, 'test-notes.txt');
        expect(upload.fileSize).toBe(45);
      });

      await test.step('9. Sent message shows the attachment card', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.attachmentFileCard(messageText, 'test-notes.txt')).toBeVisible();
      });

      await test.step("10-11. Assistant reply demonstrably quotes the file's own content; no error/rejection UI anywhere", async () => {
        await expect(artifacts.assistantReply(messageText)).toContainText(/This is a test text file/i, { timeout: 30_000 });
        await expect(page.getByRole('alert')).toHaveCount(0);
      });

      await test.step('12. File appears in the attachments bucket, Type Text, Size 45 B', async () => {
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow('test-notes.txt');
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('Text');
        await expect(row).toContainText('45 B');
      });

      await test.step('13. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the TXT upload-and-read flow').toEqual([]);
      });
    } finally {
      console_.stop();
      // No cleanup -- same explicit AFS recommendation as TC-031.
    }
  });

  test('TC-033: uploading an oversized image is rejected client-side with a size-limit error', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    // In-memory oversized-PNG payload -- see `buildOversizedImagePayload()`'s
    // own doc comment for why this replaced the previously-committed 27MB
    // `test-large-image.png` binary (post-merge review fix, PR #123
    // follow-up).
    const oversizedFile = buildOversizedImagePayload('test-large-image.png', 4 * 1024 * 1024);
    const messageText = uniqueMessage('Test large file rejection');
    // Native beforeunload dialog on navigating away from an active chat --
    // first confirmed on a Chat route (not just dirty Agent/Pipeline CRUD
    // forms, GH#68). Registered up front so it never blocks navigation.
    page.on('dialog', (d) => d.accept());

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      let uploadFired = false;
      const uploadListener = (r: Response) => {
        if (/\/attachments\/prompt_lib\/\d+\/\d+$/.test(r.url())) uploadFired = true;
      };
      page.on('response', uploadListener);

      await test.step('4-5. Select the oversized fixture -- immediate client-side rejection, no server round trip', async () => {
        const menu = await artifacts.openAttachMenu();
        const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), artifacts.attachFilesMenuItem(menu).click()]);
        await fileChooser.setFiles(oversizedFile);
        const toast = page.getByRole('alert');
        await expect(toast).toBeVisible();
        await expect(toast).toContainText(/exceeds the \d+(\.\d+)? MB image size limit/i);
        await expect(toast).toContainText('test-large-image.png');
        await expect(artifacts.preSendChip('test-large-image.png')).toHaveCount(0);
        // Root-caused during implementation: this ambient counter is exposed
        // ONLY via a literal `aria-label="Attach Files (N left)"` on an
        // always-in-DOM composer-toolbar span -- it carries no visible text
        // content at all (confirmed live), so it's located via `getByLabel()`
        // (not `getByText()`) and asserted via its accessible name (not
        // `toContainText()`). No menu-open precondition -- it's present
        // regardless of the plus-menu's open/closed state.
        await expect(artifacts.attachCounterText()).toHaveAccessibleName(/10 left/);
      });
      page.off('response', uploadListener);
      expect(uploadFired, 'the oversized file must never reach the attachments endpoint').toBe(false);

      await test.step('6-7. A plain text-only follow-up message still sends normally', async () => {
        await artifacts.typeMessage(messageText);
        await Promise.all([page.waitForURL(/\/app\/chat\/\d+/), artifacts.sendMessage()]);
      });

      await test.step('8. Sent message carries no attachment card', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.attachmentFileCard(messageText)).toHaveCount(0);
      });

      await test.step('9-10. Artifacts bucket has no trace of the oversized file', async () => {
        await page.goto(`${env.BASE_URL}/app/artifacts`);
        await dismissAnnouncementBanner(page);
        await artifacts.selectBucket('attachments');
        await expect(page.getByText('test-large-image.png')).toHaveCount(0);
      });

      await test.step('11. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the size-limit rejection flow').toEqual([]);
      });
    } finally {
      console_.stop();
      // No cleanup needed -- the oversized file never reaches the server;
      // this premise holds exactly as the case's own Teardown states.
    }
  });

  test('TC-034: preview an uploaded image file from a chat message', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    let upload: Awaited<ReturnType<typeof attachFileAndSend>> | undefined;
    const messageText = uniqueMessage('TC-034 preview test image');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-7. Attach the fixture and send', async () => {
        upload = await attachFileAndSend(page, artifacts, fixturePath('test-preview-image.png'), messageText);
        expect(upload.fileSize).toBe(7938);
      });

      let thumbnailBox: { width: number; height: number } | null = null;
      await test.step('8. Thumbnail renders at good visual quality', async () => {
        const thumbnail = artifacts.messageThumbnail('test-preview-image.png', messageText);
        await expect(thumbnail).toBeVisible();
        thumbnailBox = await thumbnail.boundingBox();
      });

      // Root-caused during this debugging pass (not documented by the AFS,
      // which never waits on the assistant before the repeated open/close
      // cycle): confirmed live via direct DOM inspection that the SAME
      // "open the preview" force-click reliably succeeds twice, then
      // reproducibly fails on a 3rd re-open right after the assistant's
      // reply is still streaming ("Wiring integrations..." placeholder
      // visible in the failure screenshot -- the reply had NOT finished).
      // Same class of race already root-caused for TC-037's own delete
      // flow: the assistant's still-in-flight reply appending new content
      // appears to trigger a broader message-list re-render that can land
      // mid-interaction with a sibling row's own elements. Waiting for the
      // assistant's reply to genuinely finish before the repeated
      // open/close cycle removes the race; every other single-attachment
      // test in this module (TC-030/035/036/037) already does this before
      // its own next interaction with the message row.
      await test.step("Wait for the assistant's reply to finish before repeatedly interacting with the message row (avoids racing an in-flight list re-render)", async () => {
        await expect(artifacts.assistantReply(messageText)).toContainText(/\S/, { timeout: 30_000 });
      });

      await test.step('9-10. Force-click opens a genuine preview dialog with filename, enlarged image (visibly larger than the inline thumbnail), and the three action buttons', async () => {
        await artifacts.openThumbnailPreview('test-preview-image.png', messageText);
        await expect(artifacts.previewModal()).toContainText('test-preview-image.png');
        const modalImage = artifacts.previewModal().getByRole('img', { name: 'test-preview-image.png' });
        await expect(modalImage).toBeVisible();
        // Post-merge review fix: the AFS claims "renders correctly at larger
        // size (not broken, full quality, visible in viewport)" and its own
        // Coverage Map / Automation Hints explicitly call for a "size
        // comparison vs. the inline thumbnail" as the concrete, falsifiable
        // proxy for "full size/zoom" -- previously only `toBeVisible()` was
        // implemented, which can't distinguish "larger" from "identical" or
        // "smaller." Comparing bounding boxes (not the AFS's own literal
        // observed pixel values, e.g. "260x146" vs "500x400" -- those are
        // this-run/this-viewport specific, not a portable contract) is the
        // real, run-independent proof the modal image is genuinely enlarged
        // relative to the thumbnail it was opened from.
        const modalBox = await modalImage.boundingBox();
        expect(thumbnailBox, 'thumbnail bounding box must be measurable before the preview opens').not.toBeNull();
        expect(modalBox, 'preview modal image bounding box must be measurable').not.toBeNull();
        expect(modalBox!.width, 'preview modal image should render wider than the inline thumbnail').toBeGreaterThan(
          thumbnailBox!.width,
        );
        expect(modalBox!.height, 'preview modal image should render taller than the inline thumbnail').toBeGreaterThan(
          thumbnailBox!.height,
        );
        await expect(artifacts.previewModalDownloadButton()).toBeVisible();
        await expect(artifacts.previewModalRemoveButton()).toBeVisible();
        await expect(artifacts.previewModalCloseButton()).toBeVisible();
      });

      await test.step('11. All three documented dismiss mechanisms tested independently -- X button and backdrop work; ESC does not (GH#119)', async () => {
        // X button -- confirmed working.
        await artifacts.closePreviewModal();

        // Backdrop click -- confirmed working.
        await artifacts.openThumbnailPreview('test-preview-image.png', messageText);
        await page.mouse.click(10, 10);
        await expect(artifacts.previewModal()).toHaveCount(0);

        // Known defect: GH#119 -- ESC does not close the image preview
        // modal. Asserts the documented-correct behavior (ESC closes the
        // dialog), not weakened to match the current buggy behavior.
        await artifacts.openThumbnailPreview('test-preview-image.png', messageText);
        await page.keyboard.press('Escape');
        await expect
          .soft(artifacts.previewModal(), 'Known defect: GH#119 (ESC key does not close the image preview modal)')
          .toHaveCount(0);
        // Recover regardless of the soft-assert outcome, via the confirmed-
        // reliable X button, so the rest of the test isn't blocked.
        if (await artifacts.previewModal().count()) {
          await artifacts.closePreviewModal();
        }
      });

      await test.step('12. Chat remains functional and genuinely interactive post-close (type -> read back -> clear)', async () => {
        await expect(artifacts.chatInput).toBeVisible();
        await artifacts.typeMessage('post-preview functional check');
        await expect(artifacts.composerTextarea()).toHaveValue('post-preview functional check');
        await page.keyboard.press('ControlOrMeta+a');
        await page.keyboard.press('Delete');
        await expect(artifacts.composerTextarea()).toHaveValue('');
      });

      await test.step('13. Zero console errors across the entire flow', async () => {
        expect(console_.errors, 'no console errors during the preview flow').toEqual([]);
      });
    } finally {
      console_.stop();
      if (upload) {
        await test.step('Teardown: remove the attachment with full storage purge via the chat-message path', async () => {
          const response = await artifacts.removeAttachmentFromChatMessage(true, 'test-preview-image.png');
          expect(response.status()).toBe(204);
          expect(response.url()).toContain('keep_in_storage=0');
        });
      }
    }
  });

  test('TC-035: upload and preview an animated GIF via chat (first frame only) [defect-found: GH#114]', async ({
    authenticatedPage: page,
  }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    let upload: Awaited<ReturnType<typeof attachFileAndSend>> | undefined;
    const messageText = uniqueMessage('Test GIF upload - expecting first frame only');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-7. Attach the GIF fixture and send', async () => {
        upload = await attachFileAndSend(page, artifacts, fixturePath('test-animated.gif'), messageText);
        expect(upload.fileSize).toBe(14866);
      });

      await test.step("8. Sent message shows text + attachment; assistant's reply corroborates first-frame-only processing", async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.messageThumbnail('test-animated.gif', messageText)).toBeVisible();
        // Post-merge review fix: a bare `toBeVisible()` only proves a reply
        // container mounted, not that the model's own vision pipeline
        // corroborates first-frame-only processing -- this AFS's own Axis 2
        // addition explicitly calls for "a loose text-contains assertion
        // (non-brittle: assert the reply mentions 'first frame' or similar,
        // not an exact string)" as a secondary confirmation channel, since
        // the fixture's own frames are labeled "Frame 1".."Frame 5"
        // (`generate_test_images.py`) and this AFS's observed run quoted the
        // reply verbatim: "The GIF appears to show the first frame only: a
        // solid red background with the text 'Frame 1' centered."
        await expect(artifacts.assistantReply(messageText)).toContainText(/first frame|frame 1/i, { timeout: 30_000 });
      });

      await test.step('9. Inline chat thumbnail is static, first-frame-only (PASSES -- pre-rasterized JPEG data URI, cannot animate)', async () => {
        const src = await artifacts.messageThumbnail('test-animated.gif', messageText).getAttribute('src');
        expect(src).toMatch(/^data:image\/jpeg/);
      });

      await test.step('10-11. Chat-side preview modal: expected static first-frame-only (Known defect: GH#114)', async () => {
        await artifacts.openThumbnailPreview('test-animated.gif', messageText);
        const modalImg = artifacts.previewModal().getByRole('img', { name: 'test-animated.gif' });
        await expect(modalImg).toBeVisible();
        // Post-merge review fix: an `<img src="blob:...">`'s `src` ATTRIBUTE
        // does not mutate while the browser decodes and plays successive GIF
        // frames internally -- a blob URL points at the same underlying
        // Blob object regardless of which frame is currently rendered, so
        // comparing `src` before/after a wait can never detect frame
        // animation; this assertion was structurally incapable of failing
        // regardless of whether the defect was present or fixed. The
        // sibling Artifacts-bucket-panel check below (13-16) already proves
        // out the correct technique for exactly this reason -- pixel-diffing
        // via `.screenshot()`, which captures actually-rendered content, not
        // a static DOM attribute. Applying the same technique here so this
        // is a real, functioning assertion.
        const shot1 = await modalImg.screenshot();
        // Two-screenshot-apart technique -- the documented way to prove
        // animation vs. a static render from a static-assertion harness: a
        // single sample can't distinguish "static, showing frame N" from
        // "animating, caught mid-frame." This is a proven animation window
        // with no DOM-observable condition to wait FOR (the check's whole
        // point is whether the rendered content changes unprompted) -- the
        // one documented exception to Hard Rule 5 (no sleeps).
        await page.waitForTimeout(2_000);
        const shot2 = await modalImg.screenshot();
        // Known defect: GH#114 -- the chat-side preview modal plays the full
        // GIF animation instead of rendering first-frame-only.
        expect
          .soft(
            shot2.equals(shot1),
            'Known defect: GH#114 (chat-side preview modal plays full GIF animation instead of first-frame-only)',
          )
          .toBe(true);
        await artifacts.closePreviewModal();
      });

      await test.step('12. Zero console errors across the core upload/send/verify flow', async () => {
        expect(console_.errors, 'no console errors during the GIF upload and inline-thumbnail verification').toEqual([]);
      });

      await test.step('13-16. Artifacts bucket: file present as GIF Image; bucket preview panel expected static first-frame-only (Known defect: GH#114, decisive live evidence)', async () => {
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow('test-animated.gif');
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('GIF Image');
        await row.getByRole('button', { name: 'Preview test-animated.gif' }).click();
        const previewImg = page.locator('img[src^="blob:"]').first();
        await expect(previewImg).toBeVisible();
        const shot1 = await previewImg.screenshot();
        // Same documented Hard-Rule-5 exception as step 10-11 above.
        await page.waitForTimeout(2_000);
        const shot2 = await previewImg.screenshot();
        // Known defect: GH#114 -- the Artifacts bucket preview panel plays
        // the full GIF animation instead of rendering first-frame-only.
        expect
          .soft(
            shot2.equals(shot1),
            'Known defect: GH#114 (Artifacts bucket preview panel plays full GIF animation instead of first-frame-only)',
          )
          .toBe(true);
        await page.getByRole('button', { name: 'Close preview' }).click();
      });
    } finally {
      console_.stop();
      if (upload) {
        await test.step("Teardown: delete the uploaded GIF (this case's own Teardown explicitly requires it)", async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', upload!.projectId, upload!.uuid, ['test-animated.gif']);
        });
      }
    }
  });

  test('TC-036: download an image file from a chat message', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-download-image.png');
    let upload: Awaited<ReturnType<typeof attachFileAndSend>> | undefined;
    const messageText = uniqueMessage('TC-036 download test image');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-6. Attach the fixture and send', async () => {
        upload = await attachFileAndSend(page, artifacts, filePath, messageText);
      });

      await test.step('7. Message renders with the attachment thumbnail', async () => {
        await expect(artifacts.messageThumbnail('test-download-image.png', messageText)).toBeVisible();
      });

      // Post-merge review fix: this test previously hovered/clicked Download
      // immediately after the thumbnail rendered, with no wait for the
      // assistant's reply -- despite two sibling doc comments elsewhere in
      // this module (TC-034's and TC-037's own "root-caused" notes) already
      // claiming "every other single-attachment test in this module
      // (TC-030/034/035/036 or /037) already does this before its own next
      // step." That claim was false for TC-036 specifically. Added for real
      // now, both to make those sibling comments accurate and because the
      // same underlying race they document -- the assistant's still-in-
      // flight reply appending new content can trigger a broader message-
      // list re-render that lands mid-interaction with the hover-revealed
      // `.attachActionButtons` overlay this step's `downloadAttachmentImage()`
      // depends on -- applies here too (Download and Remove attachment live
      // in the identical overlay).
      await test.step("Wait for the assistant's reply to finish before interacting with the hover-revealed action buttons (avoids racing an in-flight list re-render)", async () => {
        await expect(artifacts.assistantReply(messageText)).toContainText(/\S/, { timeout: 30_000 });
      });

      let downloadedPath: string | null = null;
      await test.step('8-9. Hover to reveal actions, click Download -- native download event fires (client-side blob re-save, no new network round trip)', async () => {
        const download = await artifacts.downloadAttachmentImage('test-download-image.png');
        expect(download.suggestedFilename()).toBe('test-download-image.png');
        expect(download.url()).toMatch(/^blob:/);
        // Post-merge review fix: this AFS's own Axis 2 addition explicitly
        // calls for asserting `download.failure()` is `null` -- distinguishes
        // a genuine client-side re-save (expected here, no server round
        // trip) from a failed/retried network-backed download.
        expect(await download.failure()).toBeNull();
        downloadedPath = await download.path();
        expect(downloadedPath).not.toBeNull();
      });

      await test.step('Integrity: downloaded file is byte-identical to the source fixture and opens as a valid PNG', async () => {
        const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
        const downloadedHash = crypto.createHash('sha256').update(fs.readFileSync(downloadedPath!)).digest('hex');
        expect(downloadedHash).toBe(sourceHash);
      });

      await test.step('10. No error messages/toasts anywhere; zero console errors', async () => {
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(console_.errors, 'no console errors during the upload-download flow').toEqual([]);
      });

      await test.step('11. Chat remains functional after the download (no forced navigation)', async () => {
        await expect(artifacts.chatInput).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/app/chat/${upload!.conversationId}`));
      });
    } finally {
      console_.stop();
      if (upload) {
        await test.step('Teardown: remove the attachment with full storage purge', async () => {
          const response = await artifacts.removeAttachmentFromChatMessage(true, 'test-download-image.png');
          expect(response.status()).toBe(204);
          expect(response.url()).toContain('keep_in_storage=0');
        });
      }
    }
  });

  test('TC-037: delete an image file directly from a chat message', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    let upload: Awaited<ReturnType<typeof attachFileAndSend>> | undefined;
    const messageText = uniqueMessage('Test file for deletion');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-6. Attach the fixture and send', async () => {
        upload = await attachFileAndSend(page, artifacts, fixturePath('test-delete-target.png'), messageText);
      });

      await test.step('7. Message row shows the sent text and the thumbnail', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.messageThumbnail('test-delete-target.png', messageText)).toBeVisible();
      });

      // Root-caused during this debugging pass (not documented by the AFS,
      // which never waits on the assistant before deleting): deleting the
      // attachment (with storage purge) WHILE the assistant is still
      // processing it races the model's own backend fetch of the image
      // bytes. Confirmed live via the failure's own DOM snapshot -- the
      // assistant's reply came back as a genuine backend error ("Internal
      // SDK error... Invalid/Unsupported image URL filepath:/attachments/
      // {uuid}/test-delete-target.png") for OUR OWN upload, because the file
      // was already purged from storage by the time the model's fetch ran.
      // That error reply's own arrival/render appears to re-assert the
      // message's stale attachment reference, which is why the thumbnail
      // was observed present continuously (never dropping to 0) for the
      // full 15s poll window afterward -- not a slow SPA refetch, a race
      // against still-in-flight model processing. Waiting for the assistant
      // to finish (successfully or not) before deleting removes the race
      // entirely; every other single-attachment test in this module
      // (TC-030/034/035/036) already does this before its own next step.
      //
      // Second amendment (full-suite verification run): a bare
      // `toBeVisible()` on the reply container is not a strong enough
      // signal -- confirmed live (full-suite run) that this same
      // container mounts as a loading placeholder ("Waking the agent...",
      // "Packing its tools...") before its real content streams in, the
      // exact race `sendAndCaptureUpload()`'s own doc comment already
      // documents for this project. `toBeVisible()` was satisfied by the
      // placeholder, not the finished reply, so the hover/click that
      // followed still raced an in-flight re-render (observed live: the
      // "Remove attachment" button was detached and re-attached from the
      // DOM repeatedly until the test's 120s ceiling). `toContainText(/\S/)`
      // -- the same pattern TC-030/034/035 already use for this exact
      // reason -- polls until real content lands, not just a container.
      await test.step("Wait for the assistant's processing of this attachment to finish before deleting it (avoids racing an in-flight model fetch of the file)", async () => {
        await expect(artifacts.assistantReply(messageText)).toContainText(/\S/, { timeout: 30_000 });
      });

      await test.step('8-9. Hover the action-buttons container (NOT the image -- hovering the image itself times out), click Remove attachment', async () => {
        const container = await artifacts.hoverAttachActionButtons('test-delete-target.png');
        await expect(artifacts.downloadImageButton(container)).toBeVisible();
        await artifacts.removeAttachmentButton(container).click();
        const dialog = artifacts.chatDeleteConfirmationDialog();
        await expect(dialog).toBeVisible();
        // Asserted on visible text/button roles, never on the dialog's
        // computed accessible name -- GH#111: this dialog's
        // aria-labelledby does not resolve to any element in the DOM.
        await expect(dialog).toContainText(/Are you sure to delete/);
        await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
        await expect(dialog.getByRole('button', { name: 'Delete' })).toBeVisible();
      });

      await test.step('10-11. Check the storage-purge checkbox, confirm deletion -- authoritative DELETE with keep_in_storage=0', async () => {
        await artifacts.purgeStorageCheckbox().check();
        const [response] = await Promise.all([
          page.waitForResponse((r) => /\/attachments\/prompt_lib\/\d+\/\d+\?/.test(r.url()) && r.request().method() === 'DELETE'),
          artifacts.chatDeleteConfirmationDialog().getByRole('button', { name: 'Delete' }).click(),
        ]);
        expect(response.status()).toBe(204);
        expect(response.url()).toContain('keep_in_storage=0');
      });

      await test.step('12. Thumbnail no longer present in the chat UI; message text remains', async () => {
        // Generous timeout -- the server-side delete is already confirmed
        // (204, previous step); this waits for the SPA's own client-side
        // state to catch up and re-render, which this shared, heavily-
        // loaded account has shown can lag past the default 5s elsewhere
        // in this module.
        await expect(artifacts.messageThumbnail('test-delete-target.png', messageText)).toHaveCount(0, { timeout: 15_000 });
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
      });

      await test.step('13. No error messages/toasts anywhere; zero console errors', async () => {
        await expect(page.getByRole('alert')).toHaveCount(0);
        expect(console_.errors, 'no console errors during the upload-delete-verify flow').toEqual([]);
      });

      await test.step('14-16. Verify full removal from backend storage via the authoritative S3 listing (stronger than a UI-only check)', async () => {
        const listing = await artifacts.fetchBucketListing('attachments', upload!.projectId);
        expect(listing.isTruncated).toBe(false);
        // Root-caused during this debugging pass: a bare whole-bucket
        // filename search (`key.includes('test-delete-target')`, no uuid
        // scoping) is NOT run-isolated on this shared, ever-accumulating
        // account -- confirmed live: a stale, unrelated `test-delete-
        // target.png` from an earlier, uncleaned session was still present
        // under a DIFFERENT uuid folder, permanently failing this exact
        // assertion regardless of whether THIS run's own upload was
        // correctly purged. Same class of shared-account whole-bucket-count
        // hazard TC-039's own AFS already documents (GH#118 point 2: "the
        // bucket-level listing... is a flat, whole-bucket, shared-account
        // total... not usable for a delta assertion"). The uuid-scoped
        // check below is the actual, run-isolated proof this run's own file
        // is gone; the filename-only whole-bucket variant is dropped as an
        // AFS amendment (see this case's own AFS Automation Hints).
        expect(listing.contents?.some((c) => c.key.includes(upload!.uuid))).toBe(false);
      });

      await test.step('17. Chat remains functional', async () => {
        await page.goto(`${env.BASE_URL}/app/chat/${upload!.conversationId}`);
        await expect(artifacts.chatInput).toBeVisible();
      });
    } finally {
      console_.stop();
      // No separate teardown -- this case's own subject under test (the
      // delete-with-purge flow) already leaves the account clean; verified
      // above via the authoritative S3 listing.
    }
  });

  test('TC-038: upload an unsupported file type (EXE) via chat is silently rejected', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-unsupported.exe');
    const messageText = uniqueMessage('Test unsupported file type');

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-5. Open the attach menu -- .exe is absent from the accept allowlist (intentional, allowlist-driven rejection)', async () => {
        const menu = await artifacts.openAttachMenu();
        const acceptValues = await artifacts.fileInputAcceptValues();
        for (const accept of acceptValues) {
          expect(accept).not.toContain('.exe');
        }
        const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), artifacts.attachFilesMenuItem(menu).click()]);
        await fileChooser.setFiles(filePath);
      });

      await test.step('6. Selection is silently cleared client-side -- files.length === 0, no chip, counter unchanged', async () => {
        const counts = await artifacts.fileInputFileCounts();
        expect(counts.every((c) => c === 0)).toBe(true);
        await expect(artifacts.preSendChip('test-unsupported.exe')).toHaveCount(0);
        // Ambient counter asserted via accessible name, not text content --
        // see `ArtifactsPage.attachCounterText()`'s own doc comment.
        await expect(artifacts.attachCounterText()).toHaveAccessibleName(/10 left/);
      });

      let uploadFired = false;
      const uploadListener = (r: Response) => {
        if (/\/attachments\/prompt_lib\/\d+\/\d+$/.test(r.url()) && r.request().method() === 'POST') uploadFired = true;
      };
      page.on('response', uploadListener);

      await test.step('7-8. Type message text, send -- no attachments POST ever fires', async () => {
        await artifacts.typeMessage(messageText);
        await Promise.all([
          page.waitForResponse((r) => /\/conversations\/prompt_lib\/\d+$/.test(r.url()) && r.status() === 201),
          artifacts.sendMessage(),
        ]);
      });
      page.off('response', uploadListener);
      expect(uploadFired, 'no attachments POST should ever fire for a rejected file type').toBe(false);

      await test.step('9. Sent message has text only, no attachment card', async () => {
        await expect(artifacts.userMessageRow(messageText)).toContainText(messageText);
        await expect(artifacts.attachmentFileCard(messageText)).toHaveCount(0);
      });

      await test.step("10-11. Assistant reply renders; no error/rejection UI anywhere (live, confirmed contract -- GH#113 tracks the UX gap, not asserted as a failure here)", async () => {
        await expect(artifacts.assistantReply(messageText)).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole('alert')).toHaveCount(0);
        // Root-caused during this debugging pass: a page-wide
        // `getByRole('status')` assertion was never grounded in this AFS
        // (no rejection-toast/status handle is documented anywhere in it) --
        // it collided with a permanent, benign, always-present ARIA live
        // region (`<div id="DndLiveRegion-0" role="status" aria-live=
        // "assertive">`, visually clipped to 1x1px) that react-dnd mounts on
        // every page load, unrelated to file-rejection UX. Removed as an
        // invented assertion that tested the wrong thing, not a scope
        // reduction of the AFS's own coverage -- the "no error/rejection UI"
        // contract is already fully covered by the `getByRole('alert')`
        // check above (a real toast/banner would render as `role="alert"`,
        // confirmed project-wide, e.g. TC-033's size-limit rejection toast).
      });

      await test.step('12. File never appears in the Artifacts attachments bucket', async () => {
        await page.goto(`${env.BASE_URL}/app/artifacts`);
        await dismissAnnouncementBanner(page);
        await artifacts.selectBucket('attachments');
        await expect(page.getByText('test-unsupported.exe')).toHaveCount(0);
      });

      await test.step('13. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the silent-rejection flow').toEqual([]);
      });
    } finally {
      console_.stop();
      // No cleanup needed -- the file never uploads, and the sent text-only
      // message is non-destructive (same category as TC-001/TC-002).
    }
  });

  test('TC-039: upload multiple images in one message (batch of 3)', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const fileNames = ['test-batch-1.png', 'test-batch-2.jpg', 'test-batch-3.png'];
    const filePaths = fileNames.map((f) => fixturePath(f));
    const messageText = uniqueMessage('Test batch upload of 3 images');
    let projectId = '';
    let uuid = '';

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      const uploads = trackAttachmentUploads(page);
      try {
        await test.step('4-6. Attach all 3 fixtures in one file-chooser call; the 3rd is behind the overflow toggle (GH#118)', async () => {
          await artifacts.attachFiles(filePaths);
          await expect(artifacts.preSendChip('test-batch-1.png')).toBeVisible();
          await expect(artifacts.preSendChip('test-batch-2.jpg')).toBeVisible();
          await expect(artifacts.showMoreFilesButton()).toContainText('+1');
          // Root-caused during this debugging pass: check the ambient
          // counter's accessible name BEFORE opening the "Show more files"
          // overflow menu, not after. Confirmed live via the locator's own
          // call log: the span DOES carry `aria-label="Attach Files (7
          // left)"` at all times (`resolved to <span ... aria-label="Attach
          // Files (7 left)">`), but `toHaveAccessibleName()` reads back ""
          // once the overflow menu (`role="menu"`, MUI's Menu/Modal
          // component) is open -- MUI's Modal marks background/sibling
          // content `aria-hidden="true"` while an anchored menu is open (an
          // intentional, correct a11y-isolation pattern, not a defect), and
          // the composer's counter span sits in that now-inert background.
          // Same instinct already established for TC-042 below, which
          // already checks its own ambient `maxAttachmentsText()` before
          // opening the overflow for this exact reason.
          await expect(artifacts.attachCounterText()).toHaveAccessibleName(/7 left/);
          await artifacts.showMoreFilesButton().click();
          await expect(artifacts.overflowFileItem('test-batch-3.png')).toBeVisible();
          // Root-caused during this debugging pass (a second, previously-
          // hidden bug the accessible-name failure above was masking):
          // the overflow menu's own invisible backdrop stays mounted and
          // intercepts pointer events on the composer -- `typeMessage()`
          // right after this hung indefinitely without an explicit close.
          await artifacts.closeOverflowMenu();
        });

        await test.step('7-8. Type message, send -- exactly 3 attachment POSTs fire, all sharing one destination folder', async () => {
          await artifacts.typeMessage(messageText);
          await Promise.all([page.waitForURL(/\/app\/chat\/\d+/), artifacts.sendMessage()]);
          await expect.poll(() => uploads.uploads.length, { timeout: 20_000 }).toBe(3);
          const uuids = new Set(uploads.uploads.map((u) => extractUploadUuid(u.body[0].filepath)));
          expect(uuids.size).toBe(1);
          uuid = [...uuids][0];
          projectId = parseAttachmentUrl(uploads.uploads[0].url).projectId;
          for (const fileName of fileNames) {
            expect(uploads.uploads.some((u) => u.body[0].filepath.includes(fileName))).toBe(true);
          }
        });
      } finally {
        uploads.stop();
      }

      await test.step("9-10. All 3 render as valid inline thumbnails; assistant's reply distinguishes all 3 individually", async () => {
        for (const fileName of fileNames) {
          await expect(artifacts.messageThumbnail(fileName, messageText)).toBeVisible();
        }
        // Post-merge review fix: a bare `toBeVisible()` only proves a reply
        // container mounted, not that all 3 images were genuinely processed
        // individually (vs. silently dropped or only-first-N accepted) --
        // this AFS's own Axis 2 addition explicitly calls this out as "the
        // strongest available proof all 3 attachments were genuinely
        // processed server-side." The 3 fixtures each embed a distinct
        // literal label (`generate_test_images.py`: "Batch 1"/"Batch 2"/
        // "Batch 3" on blue/green/yellow backgrounds respectively), which
        // this AFS's own observed run confirmed the reply named correctly --
        // asserted as 3 independent substring checks (not a single exact-
        // sentence match) so LLM wording variation doesn't make this brittle.
        const reply = artifacts.assistantReply(messageText);
        await expect(reply).toContainText(/Batch 1/i, { timeout: 30_000 });
        await expect(reply).toContainText(/Batch 2/i);
        await expect(reply).toContainText(/Batch 3/i);
      });

      await test.step('11. Each of the 3 thumbnails independently opens a preview lightbox (force-click required)', async () => {
        for (const fileName of fileNames) {
          await artifacts.openThumbnailPreview(fileName, messageText);
          await artifacts.closePreviewModal();
        }
      });

      await test.step('12-14. All 3 files present in the shared upload folder, correct pagination', async () => {
        await artifacts.openBucketFolder('attachments', uuid);
        await expect(artifacts.folderPaginationText()).toContainText('1 - 3 of 3');
        for (const fileName of fileNames) {
          await expect(artifacts.artifactsFileRow(fileName)).toBeVisible({ timeout: 20_000 });
        }
      });

      await test.step('15. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the batch-of-3 upload flow').toEqual([]);
      });
    } finally {
      console_.stop();
      if (uuid && projectId) {
        await test.step('Teardown: bulk-select and delete all 3 files in one action', async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', projectId, uuid, fileNames);
        });
      }
    }
  });

  test('TC-040: upload an image via drag-and-drop into chat', async ({ authenticatedPage: page }) => {
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-drag-drop.png');
    const messageText = uniqueMessage('Test drag-and-drop upload');
    let upload: Awaited<ReturnType<typeof sendAndCaptureUpload>> | undefined;

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      // Root-caused during this debugging pass: dispatching the dragover
      // check (step 4) and the drop (steps 5-6) as two INDEPENDENT drag
      // gestures -- each building its own fresh `DataTransfer` and
      // re-dispatching its own `dragenter`/`dragover` before the second
      // one's `drop` -- reproducibly (2 consecutive clean runs) left the
      // app's attach-slot counter stuck at "10 left" after the drop, even
      // though the pre-send chip still rendered. Continuing the SAME
      // gesture (one `DataTransfer`, carried from `dragOverComposer()`
      // into `dropDraggedFile()`) is both the fix and a closer match to
      // what a real single mouse-drag-and-release produces. See both
      // functions' own doc comments in `artifacts.page.ts`.
      let dragDataTransfer: Awaited<ReturnType<typeof dragOverComposer>>;
      await test.step('4. Drag the file over the composer -- visible drag-active feedback appears before drop (a real, assertable CSS state change)', async () => {
        // The dashed-border drag-active feedback is applied to an OUTER
        // WRAPPING ancestor of `chat-input` (confirmed live via direct DOM
        // inspection -- its bounding box matches the AFS's own screenshot
        // evidence of "the entire composer box" exactly), not to
        // `chat-input` itself, whose own `borderStyle` never changes. That
        // ancestor has no stable class/testid/role (a build-unstable
        // MUI/emotion-generated class), so `expectComposerDragActiveBorder()`
        // walks the ancestor chain from the one stable handle that exists
        // (`chat-input`) and checks each ancestor's own computed
        // border-style -- see its own doc comment in `artifacts.page.ts`.
        await expectComposerDragActiveBorder(page, false);
        dragDataTransfer = await dragOverComposer(page, filePath);
        await expectComposerDragActiveBorder(page, true);
      });

      await test.step('5-6. Drop the file -- preview chip renders with the filename', async () => {
        await dropDraggedFile(page, dragDataTransfer);
        await expect(artifacts.preSendChip('test-drag-drop.png')).toBeVisible();
        // Was soft-asserted as "Known defect: GH#124" (counter stuck at
        // "10 left" after a drag-and-drop attach, observed 2026-07-03).
        // Re-verified 2026-07-09 in fresh contexts -- a from-first-principles
        // probe (same single-gesture technique) AND this test itself both saw
        // the counter decrement 10 -> 9 immediately after the drop. The
        // 07-03 observation came from a debugging session whose page had
        // already received experimental unbalanced drag gestures (the exact
        // enter/leave-counter poisoning root-caused in `dragOverComposer()`'s
        // doc comment) -- a state no real user can produce. GH#124 closed as
        // not reproducible; hard assert restored.
        await expect(artifacts.attachCounterText()).toHaveAccessibleName(/9 left/);
      });

      await test.step('7-8. Type the required message text and send', async () => {
        upload = await sendAndCaptureUpload(page, artifacts, messageText, 'test-drag-drop.png');
        expect(upload.fileSize).toBe(10039);
      });

      await test.step("9. Message renders with the attachment thumbnail; assistant's reply describes the real content", async () => {
        await expect(artifacts.messageThumbnail('test-drag-drop.png', messageText)).toBeVisible();
        // Post-merge review fix: a bare `toBeVisible()` only proves a reply
        // container mounted, not that the model genuinely processed the
        // dragged-and-dropped image -- this AFS's own Axis 2 addition
        // explicitly calls for asserting the reply "demonstrably describes
        // the image's real visual content ... strongest available proof the
        // attachment was genuinely processed server-side" (same enrichment
        // pattern as TC-032/TC-036). The fixture (`test-drag-drop.png`)
        // renders the literal text "Drag Drop" on a purple background
        // (`generate_test_images.py`) -- this AFS's own observed run quoted
        // the reply verbatim: "...a purple background and the text 'Drag
        // Drop' centered."
        await expect(artifacts.assistantReply(messageText)).toContainText(/Drag Drop/i, { timeout: 30_000 });
      });

      await test.step('10. Thumbnail is clickable and opens a genuine preview dialog', async () => {
        await artifacts.openThumbnailPreview('test-drag-drop.png', messageText);
        await artifacts.closePreviewModal();
      });

      await test.step('11-13. File appears in the attachments bucket folder with correct Type/Size; zero console errors', async () => {
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow('test-drag-drop.png');
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('PNG Image');
        await expect(row).toContainText('9.8 KB');
        expect(console_.errors, 'no console errors during the drag-and-drop flow').toEqual([]);
      });
    } finally {
      console_.stop();
      if (upload) {
        await test.step('Teardown: delete the uploaded file from the bucket', async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', upload!.projectId, upload!.uuid, ['test-drag-drop.png']);
        });
      }
    }
  });

  test('TC-041: upload an image via clipboard paste (Ctrl+V / Cmd+V)', async ({ authenticatedPage: page }) => {
    // Secondary safety margin, not the primary fix for this case's own
    // debugging pass (first-ever execution) -- the actual root cause (the
    // teardown's `page.goto()` racing the SPA's own post-navigation load,
    // with the release-notes banner re-shown and blocking) is fixed at the
    // teardown's own call site below. This test's round trip (30s
    // assistant-reply wait, 20s bucket-row wait, full teardown) is still
    // comparably long to TC-042/TC-043's (which already override the
    // module default via `test.setTimeout(150_000)` a few tests below) --
    // kept here as headroom given this account's documented volatility.
    test.setTimeout(150_000);
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const filePath = fixturePath('test-paste.png');
    const messageText = uniqueMessage('Test clipboard paste upload');
    let upload: Awaited<ReturnType<typeof sendAndCaptureUpload>> | undefined;

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-5. Grant clipboard permissions and write the fixture bytes onto the real OS/browser clipboard', async () => {
        await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: env.BASE_URL });
        const result = await writeImageToClipboard(page, filePath, 'image/png');
        expect(result.itemCount).toBe(1);
        expect(result.types[0]).toContain('image/png');
        expect(result.writtenBytes).toBe(6100);
      });

      await test.step('6-7. Focus the composer, paste -- an attachment chip renders; no file-chooser event is involved', async () => {
        await pasteFromClipboard(page);
        await expect(artifacts.attachCounterText()).toHaveAccessibleName(/9 left/);
      });

      await test.step('9-10. Type the required message and send', async () => {
        upload = await sendAndCaptureUpload(page, artifacts, messageText);
      });

      await test.step('11. Sent message shows a REAL rendered thumbnail (unlike the pre-send generic-icon chip, GH#121)', async () => {
        await expect(artifacts.messageThumbnail(upload!.fileName, messageText)).toBeVisible();
      });

      await test.step("12. Assistant's reply demonstrably describes the pasted image's actual content", async () => {
        // Post-merge review fix: a bare `/\S/` regex only proves SOME text
        // arrived, not that the model genuinely read the pasted image via
        // vision -- this AFS's own Axis 2 addition explicitly calls this out
        // as "the strongest available proof the image was actually
        // processed server-side via vision, not silently dropped" (same
        // rationale as TC-032's AFS). The fixture (`test-paste.png`) renders
        // the literal text "Paste" on a cyan background
        // (`generate_test_images.py`) -- this AFS's own observed run quoted
        // the reply verbatim: "...a cyan background with the word 'Paste'
        // centered in white text."
        await expect(artifacts.assistantReply(messageText)).toContainText(/Paste/i, { timeout: 30_000 });
      });

      await test.step('13. Thumbnail opens a full-size preview modal via a forced click (GH#117, reconfirmed for paste-produced attachments)', async () => {
        await artifacts.openThumbnailPreview(upload!.fileName, messageText);
        await expect(artifacts.previewModal()).toContainText(upload!.fileName);
        await artifacts.closePreviewModal();
      });

      await test.step('14-15. File appears in the attachments bucket with the raw server-generated filename', async () => {
        await artifacts.openBucketFolder('attachments', upload!.uuid);
        const row = artifacts.artifactsFileRow(upload!.fileName);
        await expect(row).toBeVisible({ timeout: 20_000 });
        await expect(row).toContainText('PNG Image');
      });

      await test.step('Zero console errors across the primary flow', async () => {
        expect(console_.errors, 'no console errors during the clipboard-paste primary flow').toEqual([]);
      });
    } finally {
      console_.stop();
      if (upload) {
        // Do NOT use the Artifacts-page-only delete path for teardown --
        // GH#122: it does not cascade to the chat message that uploaded the
        // file, leaving a stale thumbnail whose own preview-modal fetch
        // later 400s. The chat-message-side removal (with the storage-purge
        // checkbox) is the only path confirmed to leave a fully consistent
        // clean state on both sides.
        await test.step("Teardown: remove the pasted attachment via the chat-message path (NOT the Artifacts-page-only path -- GH#122)", async () => {
          // Root-caused during this debugging pass: TC-041 is the only case
          // in this module whose teardown re-navigates to the chat page
          // (`page.goto()`) AFTER already navigating away to the Artifacts
          // bucket (step 14-15) -- every other case's teardown stays on the
          // page it was already on. Confirmed live via the failure's own
          // screenshot: right after this `goto()`, the page was still on
          // its OWN loading spinner (conversation history not yet fetched)
          // WITH the release-notes banner re-shown (a fresh full navigation
          // doesn't retain the earlier dismissal) -- the thumbnail's `<img>`
          // genuinely did not exist yet, and repeated hangs (even at a
          // 150s budget) point to this taking far longer than expected
          // under today's account load. Every other navigation point in
          // this module (`gotoChat()`, `openBucketFolder()`) already
          // dismisses the banner and/or waits on a concrete post-navigation
          // signal -- this teardown didn't, since it was the only one that
          // needed to. Added both here.
          await page.goto(`${env.BASE_URL}/app/chat/${upload!.conversationId}`);
          await dismissAnnouncementBanner(page);
          await expect(artifacts.messageThumbnail(upload!.fileName, messageText)).toBeVisible({ timeout: 30_000 });
          const response = await artifacts.removeAttachmentFromChatMessage(true, upload!.fileName);
          expect(response.status()).toBe(204);
          expect(response.url()).toContain('keep_in_storage=0');
        });
      }
    }
  });

  test('TC-042: upload 10 images in one message -- verify max limit (positive boundary)', async ({ authenticatedPage: page }) => {
    test.setTimeout(150_000);
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const fileNames = Array.from({ length: 10 }, (_, i) => `test-batch-${String(i + 1).padStart(2, '0')}.png`);
    const filePaths = fileNames.map((f) => fixturePath(f));
    const messageText = uniqueMessage('Test batch upload of 10 images - max limit');
    let projectId = '';
    let uuid = '';

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      const uploads = trackAttachmentUploads(page);
      try {
        await test.step('4-6. Attach all 10 fixtures in one call; the composer hits the ambient cap state', async () => {
          await artifacts.attachFiles(filePaths);
          await expect(artifacts.preSendChip(fileNames[0])).toBeVisible();
          await expect(artifacts.showMoreFilesButton()).toContainText('+8');
          await expect(artifacts.maxAttachmentsText()).toBeVisible();
          await artifacts.showMoreFilesButton().click();
          for (const fileName of fileNames.slice(2)) {
            await expect(artifacts.overflowFileItem(fileName)).toBeVisible();
          }
          // Preemptive fix (same root cause diagnosed live in TC-039's own
          // debugging pass): the overflow menu's invisible backdrop stays
          // mounted and intercepts pointer events on the composer -- close
          // it before the next step's `typeMessage()` click, or that click
          // hangs indefinitely.
          await artifacts.closeOverflowMenu();
        });

        await test.step('7-9. Send -- exactly 10 attachment POSTs fire, all sharing one folder, byte-exact sizes', async () => {
          await artifacts.typeMessage(messageText);
          await Promise.all([page.waitForURL(/\/app\/chat\/\d+/), artifacts.sendMessage()]);
          await expect.poll(() => uploads.uploads.length, { timeout: 30_000 }).toBe(10);
          const uuids = new Set(uploads.uploads.map((u) => extractUploadUuid(u.body[0].filepath)));
          expect(uuids.size).toBe(1);
          uuid = [...uuids][0];
          projectId = parseAttachmentUrl(uploads.uploads[0].url).projectId;
        });
      } finally {
        uploads.stop();
      }

      await test.step("10. Message renders exactly 10 thumbnails; assistant's reply acknowledges all 10", async () => {
        for (const fileName of fileNames) {
          await expect(artifacts.messageThumbnail(fileName, messageText)).toBeVisible();
        }
        await expect(artifacts.assistantReply(messageText)).toContainText(/10/, { timeout: 30_000 });
      });

      await test.step('11. Two random thumbnails each independently open their own preview (force-click required)', async () => {
        await artifacts.openThumbnailPreview(fileNames[0], messageText);
        await artifacts.closePreviewModal();
        await artifacts.openThumbnailPreview(fileNames[9], messageText);
        await artifacts.closePreviewModal();
      });

      await test.step('12-15. Authoritative S3 listing includes all 10 keys under the new folder; no persistent count badge exists', async () => {
        const listing = await artifacts.fetchBucketListing('attachments', projectId);
        const folderEntries = listing.contents?.filter((c) => c.key.startsWith(`${uuid}/`)) ?? [];
        expect(folderEntries.length).toBe(10);
        for (const fileName of fileNames) {
          expect(folderEntries.some((e) => e.key.endsWith(fileName))).toBe(true);
        }
      });

      await test.step('Zero console errors during the core upload -> send -> preview -> verify flow', async () => {
        expect(console_.errors, 'no console errors during the 10-image batch upload flow').toEqual([]);
      });
    } finally {
      console_.stop();
      if (uuid && projectId) {
        await test.step("Teardown: bulk-delete the folder's 10 files", async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', projectId, uuid, fileNames);
        });
      }
    }
  });

  test('TC-043: attempt to upload 11 images -- verify truncation to the max of 10 (negative boundary)', async ({
    authenticatedPage: page,
  }) => {
    test.setTimeout(150_000);
    const console_ = trackConsoleErrors(page);
    const artifacts = new ArtifactsPage(page);
    const retainedFileNames = Array.from({ length: 10 }, (_, i) => `test-batch-${String(i + 1).padStart(2, '0')}.png`);
    const rejectedFileName = 'test-batch-11.png';
    const filePaths = [...retainedFileNames, rejectedFileName].map((f) => fixturePath(f));
    const messageText = uniqueMessage('Test batch upload of 11 images - expect rejection');
    // Post-merge review fix: hoisted out of the inner block below (which is
    // scoped to the outer `try`, not visible from the outer `finally`) so
    // the teardown added there can reach them. See the outer `finally`'s own
    // comment for why this AFS's original "no cleanup" call was overridden.
    let projectId = '';
    let uuid = '';

    try {
      await test.step('1-3. Navigate, dismiss banner, start a fresh isolated conversation', async () => {
        await artifacts.gotoChat();
        await dismissAnnouncementBanner(page);
        await artifacts.startNewConversation();
      });

      await test.step('4-5. Select all 11 files -- exactly 10 retained (in selection order); the 11th is dropped before reaching the DOM', async () => {
        await artifacts.attachFiles(filePaths);
        await expect(artifacts.showMoreFilesButton()).toContainText('+8');
        await artifacts.showMoreFilesButton().click();
        for (const fileName of retainedFileNames.slice(2)) {
          await expect(artifacts.overflowFileItem(fileName)).toBeVisible();
        }
        await expect(artifacts.overflowFileItem(rejectedFileName)).toHaveCount(0);
        await expect(artifacts.maxAttachmentsText()).toBeVisible();
        // No blocking UI (Behavior A does not occur) -- the ambient
        // disabled/"Max 10 attachments" state IS the case's own accepted
        // Behavior-B "warning," not a transient toast.
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        // Preemptive fix (same root cause diagnosed live in TC-039's own
        // debugging pass): close the overflow menu before the next step's
        // `typeMessage()` click -- its invisible backdrop otherwise
        // intercepts pointer events on the composer indefinitely.
        await artifacts.closeOverflowMenu();
      });

      const uploads = trackAttachmentUploads(page);
      try {
        await test.step('6-7. Type message, send -- exactly 10 attachment POSTs fire, never 11', async () => {
          await artifacts.typeMessage(messageText);
          await Promise.all([page.waitForURL(/\/app\/chat\/\d+/), artifacts.sendMessage()]);
          await expect.poll(() => uploads.uploads.length, { timeout: 30_000 }).toBe(10);
          expect(uploads.uploads.some((u) => u.body[0].filepath.includes(rejectedFileName))).toBe(false);
          const uuids = new Set(uploads.uploads.map((u) => extractUploadUuid(u.body[0].filepath)));
          expect(uuids.size).toBe(1);
          uuid = [...uuids][0];
          projectId = parseAttachmentUrl(uploads.uploads[0].url).projectId;
        });
      } finally {
        uploads.stop();
      }

      await test.step('8-9. Sent message contains exactly 10 thumbnails, never the 11th; assistant reply renders', async () => {
        for (const fileName of retainedFileNames) {
          await expect(artifacts.messageThumbnail(fileName, messageText)).toBeVisible();
        }
        await expect(artifacts.messageThumbnail(rejectedFileName, messageText)).toHaveCount(0);
        await expect(artifacts.assistantReply(messageText)).toBeVisible({ timeout: 30_000 });
      });

      await test.step('10. Artifacts bucket persists exactly 10 files -- "1 - 10 of 10", the strongest available confirmation', async () => {
        await artifacts.openBucketFolder('attachments', uuid);
        await expect(artifacts.folderPaginationText()).toContainText('1 - 10 of 10');
        for (const fileName of retainedFileNames) {
          await expect(artifacts.artifactsFileRow(fileName)).toBeVisible();
        }
        await expect(artifacts.artifactsFileRow(rejectedFileName)).toHaveCount(0);
      });

      await test.step('11. Zero console errors', async () => {
        expect(console_.errors, 'no console errors during the 11-image truncation flow').toEqual([]);
      });
    } finally {
      console_.stop();
      // Post-merge review fix (AFS amendment -- see
      // test-specs/artifacts/l3_upload-11-images-reject_TC-043.md's own
      // Cleanup section): the AFS's original "no automated cleanup"
      // recommendation followed the TC-001/TC-002/TC-032/TC-036/TC-038
      // "chat history persists, non-destructive" precedent, reasoned
      // specifically for a TEXT message. This case's own Behavior-B path
      // additionally persists 10 real files in the shared Artifacts bucket
      // on every run, with no compensating expiry -- unlike a bare chat
      // message, that's a permanent per-run leak into shared, finite
      // storage, not a merely-additive non-destructive record. Deleting
      // them here, via the same authoritative-S3-listing-verified helper
      // TC-042 already uses, closes that leak without reintroducing the
      // concurrency concern the AFS was guarding against (TC-039/TC-042
      // mutate their OWN distinct uuid folders concurrently; this delete
      // only ever touches this run's own folder).
      if (uuid && projectId) {
        await test.step("Teardown: bulk-delete this run's own 10 retained files", async () => {
          await deleteArtifactAndVerify(artifacts, 'attachments', projectId, uuid, retainedFileNames);
        });
      }
    }
  });
});
