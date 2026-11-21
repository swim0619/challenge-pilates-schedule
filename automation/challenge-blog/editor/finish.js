export async function addCards(page) {
  const r = await page.evaluate(() => { const p = [...document.querySelectorAll(".se-text-paragraph")].find(p => p.innerText.trim().startsWith("💬")); p.scrollIntoView({ block: "center" }); const b = p.getBoundingClientRect(); return { x: b.right - 2, y: b.top + b.height / 2 }; });
  await page.mouse.click(r.x, r.y, { label: "톡톡 안내 문단 끝 클릭" });
  await page.keyboard.press("End");
  await page.click("button.se-oglink-toolbar-button", { label: "링크 카드 추가" });
  await page.waitForSelector("input.se-popup-oglink-input", { timeout: 10000 });
  await page.fill("input.se-popup-oglink-input", "http://pf.kakao.com/_JIxgpxj");
  await page.click("button.se-popup-oglink-button", { label: "링크 검색" });
  await page.waitForFunction(() => /pf\.kakao\.com/.test(document.querySelector(".se-popup")?.innerText || ""), undefined, { timeout: 15000 });
  await page.click(".se-popup button.se-popup-button", { label: "링크 카드 확인" });
  await page.waitForTimeout(1500);
  await page.click("button.se-talktalk-toolbar-button", { label: "톡톡 배너 추가" });
  await page.waitForTimeout(1500);
  await page.click(".se-popup button.se-popup-button", { label: "톡톡 배너 확인" });
  await page.waitForTimeout(1500);
}
export async function linkify(page, text, url) {
  const r = await page.evaluate((t) => { const p = [...document.querySelectorAll(".se-text-paragraph")].find(p => p.innerText.trim() === t); if (!p) return null; p.scrollIntoView({ block: "center" }); const b = p.getBoundingClientRect(); return { x: b.left + 30, y: b.top + b.height / 2 }; }, text);
  if (!r) throw new Error("link line not found: " + text);
  await page.mouse.click(r.x, r.y, { label: "링크 걸 문단 클릭" });
  await page.mouse.click(r.x, r.y, { clickCount: 3, label: "문단 전체 선택" });
  await page.click("button.se-link-toolbar-button", { label: "링크 버튼" });
  await page.waitForSelector("input.se-custom-layer-link-input", { timeout: 5000 });
  await page.fill("input.se-custom-layer-link-input", url);
  await page.click("button.se-custom-layer-link-apply-button", { label: "링크 적용" });
  await page.waitForTimeout(600);
}
export async function check(page) {
  return await page.evaluate(() => ({
    title: document.querySelector(".se-section-documentTitle").innerText.trim(),
    links: [...document.querySelectorAll(".se-link[data-href]")].map(e => e.dataset.href),
    og: document.querySelectorAll(".se-component.se-oglink").length,
    tt: document.querySelectorAll(".se-component.se-talktalk").length,
    imgs: document.querySelectorAll(".se-component.se-image").length,
    urlLines: [...document.querySelectorAll(".se-text-paragraph")].filter(p => /^https?:\/\//.test(p.innerText.trim())).length,
  }));
}
