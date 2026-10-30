/**
 * Redirects E2E Tests
 *
 * Tests creating, editing, and deleting URL redirects,
 * plus the 404 tracking tab.
 */

import { test, expect } from "../fixtures";

const REDIRECT_ACTIONS_PATTERN = /^Actions for redirect /;

test.describe("Redirects", () => {
	test.beforeEach(async ({ admin }) => {
		await admin.devBypassAuth();
	});

	test.describe("Empty state", () => {
		test("displays redirects page with empty state", async ({ admin, page }) => {
			await admin.goto("/redirects");
			await admin.waitForShell();
			await admin.waitForLoading();

			// Should show the page heading
			await admin.expectPageTitle("Redirects");

			// Should have the "New Redirect" button
			await expect(page.getByRole("button", { name: "New Redirect" })).toBeVisible();

			// Should show empty state text
			await expect(page.locator("text=No redirects yet")).toBeVisible();
		});
	});

	test.describe("CRUD", () => {
		test("creates a redirect", async ({ admin, page }) => {
			await admin.goto("/redirects");
			await admin.waitForShell();
			await admin.waitForLoading();

			// Open create dialog
			await page.getByRole("button", { name: "New Redirect" }).click();
			await expect(page.locator('[role="dialog"]')).toBeVisible();

			// Fill form
			const dialog = page.locator('[role="dialog"]');
			await dialog.locator('input[placeholder*="old-page"]').fill("/old-page");
			await dialog.locator('input[placeholder*="new-page"]').fill("/new-page");

			// Status code defaults to 301 -- leave it

			// Submit
			await dialog.getByRole("button", { name: "Create" }).click();

			// Dialog should close
			await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

			// Redirect should appear in the list
			await expect(page.locator("text=/old-page").first()).toBeVisible();
			await expect(page.locator("text=/new-page").first()).toBeVisible();
		});

		test("edits a redirect", async ({ admin, page }) => {
			await admin.goto("/redirects");
			await admin.waitForShell();
			await admin.waitForLoading();

			// Create a redirect first
			await page.getByRole("button", { name: "New Redirect" }).click();
			const createDialog = page.locator('[role="dialog"]');
			await createDialog.locator('input[placeholder*="old-page"]').fill("/edit-source");
			await createDialog.locator('input[placeholder*="new-page"]').fill("/edit-dest-original");
			await createDialog.getByRole("button", { name: "Create" }).click();
			await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

			// Wait for the redirect to appear
			await expect(page.locator("text=/edit-source").first()).toBeVisible();

			// The source path is the button that opens the editor
			const source = page.getByRole("button", { name: "Edit redirect /edit-source", exact: true });
			await expect(source).toHaveText("/edit-source");
			await source.click();

			// Edit dialog should open
			await expect(page.locator('[role="dialog"]')).toBeVisible();

			// Change the destination
			const editDialog = page.locator('[role="dialog"]');
			const destInput = editDialog.locator('input[placeholder*="new-page"]');
			await destInput.clear();
			await destInput.fill("/edit-dest-updated");

			// Save
			await editDialog.getByRole("button", { name: "Save" }).click();
			await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

			// Verify the updated destination is shown
			await expect(page.locator("text=/edit-dest-updated").first()).toBeVisible();
			await expect(page.locator("text=/edit-dest-original")).not.toBeVisible();
		});

		test("deletes a redirect", async ({ admin, page }) => {
			await admin.goto("/redirects");
			await admin.waitForShell();
			await admin.waitForLoading();

			// Create a redirect to delete
			await page.getByRole("button", { name: "New Redirect" }).click();
			const dialog = page.locator('[role="dialog"]');
			await dialog.locator('input[placeholder*="old-page"]').fill("/to-delete");
			await dialog.locator('input[placeholder*="new-page"]').fill("/deleted-dest");
			await dialog.getByRole("button", { name: "Create" }).click();
			await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

			// Wait for it to appear
			await expect(page.locator("text=/to-delete").first()).toBeVisible();

			// Delete is in the row's actions menu
			await page
				.getByRole("button", { name: "Actions for redirect /to-delete", exact: true })
				.click();
			await page.getByRole("menuitem", { name: "Delete redirect /to-delete", exact: true }).click();

			// Confirm deletion in the ConfirmDialog
			const confirm = page.getByRole("dialog", { name: "Delete Redirect?" });
			await expect(confirm).toBeVisible();
			await confirm.getByRole("button", { name: "Delete", exact: true }).click();

			// Dialog should close
			await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 10000 });

			// Redirect should be gone
			await expect(page.locator("text=/to-delete")).not.toBeVisible();
		});

		test("moves keyboard focus to the next redirect after deleting one", async ({
			admin,
			page,
			serverInfo,
		}) => {
			const headers = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${serverInfo.token}`,
				"X-EmDash-Request": "1",
				Origin: serverInfo.baseUrl,
			};
			const ids: string[] = [];
			for (const n of [1, 2, 3]) {
				const res = await page.request.post(`${serverInfo.baseUrl}/_emdash/api/redirects`, {
					headers,
					data: { source: `/focus-${n}`, destination: "/focus-target" },
				});
				expect(res.ok()).toBe(true);
				const body: { data: { id: string } } = await res.json();
				ids.push(body.data.id);
			}

			try {
				await admin.goto("/redirects");
				await admin.waitForShell();
				await admin.waitForLoading();
				const actions = (source: string) =>
					page.getByRole("button", { name: `Actions for redirect ${source}`, exact: true });
				await expect(actions("/focus-2")).toBeVisible();
				const menus = await page
					.getByRole("button", { name: REDIRECT_ACTIONS_PATTERN })
					.evaluateAll((buttons) =>
						buttons.map((button) => button.getAttribute("aria-label") ?? ""),
					);
				const index = menus.indexOf("Actions for redirect /focus-2");
				const next = menus[index + 1] ?? menus[index - 1] ?? "";

				await page.locator("h1").first().hover();
				await actions("/focus-2").focus();
				await page.keyboard.press("Enter");
				await expect(page.getByRole("menuitem").first()).toBeFocused();
				await page.keyboard.press("End");
				await page.keyboard.press("Enter");
				const confirm = page.getByRole("dialog", { name: "Delete Redirect?" });
				await confirm.getByRole("button", { name: "Delete", exact: true }).focus();
				await page.keyboard.press("Enter");

				await expect(actions("/focus-2")).toHaveCount(0);
				await expect(page.getByRole("button", { name: next, exact: true })).toBeFocused();
			} finally {
				for (const id of ids) {
					await page.request.delete(`${serverInfo.baseUrl}/_emdash/api/redirects/${id}`, {
						headers,
					});
				}
			}
		});
	});

	test.describe("404 Tracking", () => {
		test("renders the 404 errors tab", async ({ admin, page }) => {
			await admin.goto("/redirects");
			await admin.waitForShell();
			await admin.waitForLoading();

			// Click the "404 Errors" tab
			await page.locator("button", { hasText: "404 Errors" }).click();

			// Should show the empty state for 404s
			await expect(page.locator("text=No 404 errors recorded yet")).toBeVisible({
				timeout: 10000,
			});
		});
	});
});
