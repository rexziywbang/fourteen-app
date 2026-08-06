import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const databasePath = ".data/playwright.sqlite";
const serverLog = ".data/playwright-server.log";

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function latestOtp(email: string) {
  let code = "";
  await expect.poll(() => {
    const log = readFileSync(serverLog, "utf8");
    const matches = [...log.matchAll(new RegExp(`\\[Fourteen development OTP\\] ${escapeRegExp(email)}: (\\d{6})`, "g"))];
    code = matches.at(-1)?.[1] || "";
    return code;
  }).toMatch(/^\d{6}$/);
  return code;
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations, results.violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n")).toEqual([]);
}

async function signUp(context: BrowserContext, identity: { email: string; first: string; last: string }) {
  const page = await context.newPage();
  await page.goto("/");
  await page.getByPlaceholder("you@umich.edu").fill(identity.email);
  await page.getByRole("button", { name: /Get your code/ }).click();
  await page.waitForURL(/\/verify/);
  await page.getByLabel("Six-digit code").fill(await latestOtp(identity.email));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/\/welcome/);

  await page.locator('select[name="birthMonth"]').selectOption("1");
  await page.locator('select[name="birthDay"]').selectOption("1");
  await page.locator('select[name="birthYear"]').selectOption("1995");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.locator('input[name="firstName"]').fill(identity.first);
  await page.locator('input[name="lastName"]').fill(identity.last);
  await page.locator('select[name="classYear"]').selectOption("2028");
  await page.getByRole("button", { name: "Continue" }).click();
  for (const checkbox of await page.locator('input[name="circleIds"]').all()) await checkbox.check({ force: true });
  await page.getByRole("button", { name: "Enter Fourteen" }).click();
  await page.waitForURL(/\/home/);
  return page;
}

async function sendCrush(page: Page, recipient: { first: string; last: string }) {
  await page.goto("/send");
  await page.getByPlaceholder("Search first or last name").fill(recipient.last);
  await page.getByRole("button", { name: new RegExp(`${recipient.first} ${recipient.last}`) }).click();
  await page.getByRole("button", { name: "Preview their card" }).click();
  await page.getByRole("button", { name: /Send anonymously/ }).click();
  await page.waitForURL(/\/sent\/[0-9a-f-]{36}\?new=1/i);
  return page.url().match(/\/sent\/([0-9a-f-]{36})/i)?.[1] || "";
}

function mockNextLocalDay(crushId: string) {
  const database = new DatabaseSync(databasePath);
  database.prepare("UPDATE crush_hints SET unlocked_at = ? WHERE crush_id = ? AND day_index = 1")
    .run(new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(), crushId);
  database.prepare("DELETE FROM crush_opens WHERE crush_id = ?").run(crushId);
  database.close();
}

function expireCrush(crushId: string) {
  const database = new DatabaseSync(databasePath);
  database.prepare("UPDATE crushes SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), crushId);
  database.close();
}

test.describe.configure({ mode: "serial" });

test("two-context happy path, neutrality, mocked hint days, mutual reveal, axe, and reduced motion", async ({ browser }) => {
  const suffix = `${Date.now()}`;
  const alex = { email: `alex.${suffix}@umich.edu`, first: "Alexandria", last: `North${suffix.slice(-5)}` };
  const kris = { email: `kris.${suffix}@umich.edu`, first: "Krishnamurthy", last: `West${suffix.slice(-5)}` };
  const alexContext = await browser.newContext();
  const krisContext = await browser.newContext();

  const publicPage = await alexContext.newPage();
  await publicPage.goto("/");
  await expectNoAxeViolations(publicPage);
  await publicPage.close();

  const alexPage = await signUp(alexContext, alex);
  const krisPage = await signUp(krisContext, kris);
  await expectNoAxeViolations(alexPage);
  await alexPage.goto("/round");
  await expect(alexPage.getByText("1 / 6")).toBeVisible();
  await expectNoAxeViolations(alexPage);

  const crushId = await sendCrush(alexPage, kris);
  await krisPage.goto(`/crush/${crushId}`);
  await expect(krisPage.getByText("1 hint unlocked")).toBeVisible();
  await expectNoAxeViolations(krisPage);

  mockNextLocalDay(crushId);
  await krisPage.reload();
  await expect(krisPage.getByText("2 hints unlocked")).toBeVisible();
  await expect(krisPage.getByText("Unlocked today")).toBeVisible();

  await krisPage.getByPlaceholder("Type a name").fill("Noah");
  await krisPage.getByRole("button", { name: /Noah Kim/ }).click();
  await krisPage.getByRole("button", { name: "Use today’s guess" }).click();
  await expect(krisPage.getByText("Recorded.")).toBeVisible();
  await expect(krisPage.getByText("That’s all we’re saying.")).toBeVisible();

  const reciprocalId = await sendCrush(krisPage, alex);
  await krisPage.goto(`/reveal/${reciprocalId}`);
  await krisPage.setViewportSize({ width: 390, height: 844 });
  await expect(krisPage.getByText("Alexandria")).toBeVisible();
  await expect(krisPage.getByText("Krishnamurthy")).toBeVisible();
  await expectNoAxeViolations(krisPage);
  await krisPage.emulateMedia({ reducedMotion: "reduce" });
  await krisPage.reload();
  await expect(krisPage.locator(".reveal-names")).toHaveScreenshot("reveal-reduced-motion.png", { maxDiffPixelRatio: 0.02 });

  await alexPage.goto(`/reveal/${crushId}`);
  await expect(alexPage.getByText("Alexandria")).toBeVisible();
  await expect(alexPage.getByText("Krishnamurthy")).toBeVisible();

  await alexContext.close();
  await krisContext.close();
});

test("correct guess can be declined without disclosure, then expires neutrally", async ({ browser }) => {
  const suffix = `${Date.now()}`;
  const sender = { email: `sender.${suffix}@umich.edu`, first: "Morgan", last: `Calm${suffix.slice(-5)}` };
  const recipient = { email: `recipient.${suffix}@umich.edu`, first: "Taylor", last: `Quiet${suffix.slice(-5)}` };
  const senderContext = await browser.newContext();
  const recipientContext = await browser.newContext();
  const senderPage = await signUp(senderContext, sender);
  const recipientPage = await signUp(recipientContext, recipient);
  const crushId = await sendCrush(senderPage, recipient);

  await recipientPage.goto(`/crush/${crushId}`);
  await recipientPage.getByPlaceholder("Type a name").fill(sender.last);
  await recipientPage.getByRole("button", { name: new RegExp(`${sender.first} ${sender.last}`) }).click();
  await recipientPage.getByRole("button", { name: "Use today’s guess" }).click();
  await expect(recipientPage.getByText("Recorded.")).toBeVisible();

  await senderPage.goto(`/sent/${crushId}`);
  await expect(senderPage.getByRole("heading", { name: "Reveal yourself?" })).toBeVisible();
  await senderPage.getByRole("button", { name: "Stay hidden" }).click();
  await expect(senderPage.getByText(/You chose to stay hidden/)).toBeVisible();

  await recipientPage.reload();
  await expect(recipientPage.getByText("Recorded.")).toBeVisible();
  await expect(recipientPage.getByText(sender.first)).toHaveCount(0);
  await expect(recipientPage.getByText(sender.last)).toHaveCount(0);

  expireCrush(crushId);
  await senderPage.goto("/home");
  await expect(senderPage.getByText("The window closed quietly. Your next one unlocks Monday.")).toBeVisible();

  await senderContext.close();
  await recipientContext.close();
});
