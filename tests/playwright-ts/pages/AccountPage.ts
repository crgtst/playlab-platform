import { Locator, Page } from '@playwright/test';

export interface UploadFile {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

export class AccountPage {
  readonly avatarImage: Locator;
  readonly avatarPlaceholder: Locator;
  readonly avatarInput: Locator;
  readonly uploadButton: Locator;
  readonly removeButton: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page) {
    this.avatarImage = page.getByTestId('avatar-image');
    this.avatarPlaceholder = page.getByTestId('avatar-placeholder');
    this.avatarInput = page.getByTestId('avatar-input');
    this.uploadButton = page.getByTestId('avatar-upload-button');
    this.removeButton = page.getByTestId('avatar-remove-button');
    this.error = page.getByTestId('avatar-error');
  }

  async goto() {
    await this.page.goto('/account');
    await this.avatarInput.waitFor();
  }

  /** Picks the file and presses Upload; resolves with the API's response to the upload. */
  async upload(file: UploadFile) {
    await this.avatarInput.setInputFiles(file);
    const response = this.page.waitForResponse((res) => res.url().endsWith('/users/me/avatar') && res.request().method() === 'POST');
    await this.uploadButton.click();
    return response;
  }
}
