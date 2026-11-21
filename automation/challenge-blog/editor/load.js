export async function loadDraft(page, match) {
  await page.goto("https://blog.naver.com/challenge_pilates/postwrite", { timeout: 30000 });
  await page.waitForSelector(".se-section-documentTitle", { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => { const b = document.querySelector(".se-popup-button-cancel"); if (b && b.offsetParent) b.click(); });
  await page.waitForTimeout(800);
  await page.click("button[class*='save_count_btn']", { label: "임시저장 목록 열기" });
  await page.waitForTimeout(1500);
  const idx = await page.evaluate((m) => [...document.querySelectorAll("button[class*='article_button']")].findIndex(b => b.innerText.includes(m)), match);
  if (idx < 0) throw new Error("draft not found: " + match);
  await page.click(`xpath=(//button[contains(@class,'article_button')])[${idx + 1}]`, { label: "임시저장 글 불러오기" });
  await page.waitForTimeout(3500);
  return await page.evaluate(() => ({ title: document.querySelector(".se-section-documentTitle").innerText.trim(), count: document.querySelector("button[class*='save_count_btn']").innerText }));
}
