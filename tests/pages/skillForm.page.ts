import { expect, type Locator, type Page } from '@playwright/test';
import { dismissAnnouncementBanner } from './entityForm.page';

/**
 * Skill create-form page object -- `/app/skills/create`.
 *
 * NOT folded into the existing `EntityFormPage` (`agent` | `pipeline`)
 * despite the superficial Name/Description/Save similarity -- ELITEA-1739's
 * own AFS explicitly flags the Skill create form's underlying create-
 * response endpoint as unconfirmed ("exact endpoint path not captured this
 * run, flagged as a gap for the implementer to fill via a
 * `browser_network_requests` capture during automation"). `saveOnCreate()`
 * below deliberately waits on the post-save URL only, not an authoritative
 * `waitForResponse` the way `EntityFormPage.saveOnCreate()` does for
 * Agents/Pipelines -- asserting an unconfirmed endpoint shape would be
 * guessing, not asserting a real observed contract. Fold this into
 * `EntityFormPage` as a 3rd `entityType` (or confirm+add the equivalent
 * `waitForResponse`) once a future `skills`-module case confirms the
 * create/update/delete endpoints live, per this project's "extend, don't
 * duplicate" Hard Rule.
 *
 * The Skill form also has no "Guidelines" field (Agent-only) and no
 * "Conversation Starters" field-array (Pipeline-only) -- it has an
 * "Instructions" markdown editor instead, per the AFS's own Concrete
 * Handles table. Only the create-flow surface is implemented here (this
 * case's own scope never exercises edit/delete for Skills -- "deletion
 * mechanism was not explored this run (out of this case's scope)", per the
 * AFS's Test Data section).
 */
export class SkillFormPage {
  readonly page: Page;
  readonly nameInput: Locator;
  readonly descriptionInput: Locator;
  readonly instructionsInput: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nameInput = page.getByRole('textbox', { name: 'Name *' });
    this.descriptionInput = page.getByRole('textbox', { name: 'Description *' });
    // No data-testid/stable id on this CodeMirror/markdown-style editor
    // (AFS Concrete Handles -- explicitly flagged, "worth asking the
    // product team for a data-testid if the `skills` module grows more
    // create/edit cases"). Scoped by the preceding "Instructions *" heading,
    // the same locator-ladder stop+flag pattern used elsewhere in this
    // project for un-testid-able controls.
    this.instructionsInput = page
      .getByRole('heading', { name: 'Instructions *' })
      .locator('..')
      .getByRole('textbox');
    // The create page never renders a "Save As Version" button (that only
    // exists on the edit/detail page, per EntityFormPage's own
    // `saveButton` getter doc comment for Agents/Pipelines) -- `exact: true`
    // is defensive, matching the same disambiguation EntityFormPage applies
    // on ITS create page, not a confirmed live collision for Skills.
    this.saveButton = page.getByRole('button', { name: 'Save', exact: true });
  }

  async fillMinimal(name: string, description: string, instructions: string): Promise<void> {
    await this.nameInput.fill(name);
    await this.descriptionInput.fill(description);
    await this.instructionsInput.fill(instructions);
  }

  /**
   * Dismisses the release-notes banner (AFS-confirmed Save-button click
   * interceptor, same recurring banner as GH#42 on Agents/Pipelines --
   * "clicking Save while the release-notes banner is still on-screen timed
   * out ... dismissing the banner before attempting to click Save resolved
   * this every time"), then clicks Save and waits for the post-save
   * redirect `/app/skills/all/{id}` (AFS step 5). Returns the numeric id
   * parsed from that URL.
   */
  async saveOnCreate(): Promise<number> {
    await dismissAnnouncementBanner(this.page);
    await expect(this.saveButton).toBeEnabled();
    await this.saveButton.click();
    await this.page.waitForURL(/\/app\/skills\/all\/\d+/);
    const idMatch = this.page.url().match(/\/app\/skills\/all\/(\d+)/);
    if (!idMatch) {
      throw new Error(`Expected post-save URL to contain a numeric skill id, got: ${this.page.url()}`);
    }
    return Number(idMatch[1]);
  }
}
