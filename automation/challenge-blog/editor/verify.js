// 저장 후 글을 새로 불러와서 확인한다
export async function saveAndVerify(page, loadDraft, check, match, mustHave, mustNot) {
  await page.click("button[class*='save_btn']", { label: "임시저장 버튼 클릭" });
  await page.waitForFunction(() => /저장/.test(document.body.innerText), undefined, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await loadDraft(page, match);
  const c = await check(page);
  const t = await page.evaluate(() => document.body.innerText);
  c.has = mustHave.filter(w => !t.includes(w));
  c.not = mustNot.filter(w => t.includes(w));
  c.ok = c.has.length === 0 && c.not.length === 0 && c.urlLines === 0 && c.og === 1 && c.tt === 1;
  return c;
}
