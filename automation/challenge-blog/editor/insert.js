// anchor 문단(글자가 정확히 같은 문단) 끝 다음에 사진 한 장을 넣는다
export async function insertAfter(page, anchor, file, nth = 0) {
  const r = await page.evaluate(({ anchor, nth }) => {
    const ps = [...document.querySelectorAll(".se-component.se-text:not(.se-documentTitle) .se-text-paragraph")].filter(p => p.innerText.trim() === anchor.trim());
    const p = ps[nth];
    if (!p) return { err: "anchor not found (" + ps.length + ")" };
    p.scrollIntoView({ block: "center" });
    const b = p.getBoundingClientRect();
    return { x: b.right - 2, y: b.top + b.height / 2 };
  }, { anchor, nth });
  if (r.err) throw new Error(anchor + ": " + r.err);
  await page.mouse.click(r.x, r.y, { label: "사진 넣을 문단 끝 클릭" });
  await page.keyboard.press("End");
  const before = await page.evaluate(() => document.querySelectorAll(".se-component.se-image").length);
  const chooser = page.waitForFileChooser({ timeout: 10000 });
  await page.click("button.se-image-toolbar-button", { label: "사진 추가 버튼" });
  await (await chooser).setFiles(file);
  await page.waitForFunction((b) => document.querySelectorAll(".se-component.se-image").length > b && ![...document.querySelectorAll(".se-component.se-image img")].some(i => !i.complete), before, { timeout: 60000 });
  await page.waitForTimeout(1200);
  return await page.evaluate((anchor) => {
    const comps = [...document.querySelectorAll(".se-component:not(.se-documentTitle)")];
    const prevs = [];
    comps.forEach((c, i) => { if (c.classList.contains("se-image") && i > 0) { const ps = [...comps[i - 1].querySelectorAll(".se-text-paragraph")].filter(p => p.innerText.trim()); prevs.push(ps.length ? ps[ps.length - 1].innerText.trim() : ""); } });
    return { ok: prevs.includes(anchor.trim()), imgs: comps.filter(c => c.classList.contains("se-image")).length };
  }, anchor);
}
// 본문 전체를 새 글로 바꾼다. 예전 글의 굵게·기울임·글자 크기가 남지 않게 끄고 붙여넣는다
export async function replaceAll(page, P) {
  await page.click(".se-section-documentTitle .se-text-paragraph", { label: "제목 칸 클릭" });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.insertText(P.title);
  await page.click(".se-component.se-text:not(.se-documentTitle) .se-text-paragraph >> nth=0", { label: "본문 첫 문단 클릭" });
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(800);
  const n = await page.evaluate(() => document.querySelectorAll(".se-component:not(.se-documentTitle)").length);
  if (n !== 1) throw new Error("body not cleared: " + n);
  await page.click(".se-component.se-text:not(.se-documentTitle) .se-text-paragraph >> nth=0", { label: "빈 본문 클릭" });
  const st = await page.evaluate(() => ({ b: document.querySelector("button.se-bold-toolbar-button").classList.contains("se-is-selected"), i: document.querySelector("button.se-italic-toolbar-button").classList.contains("se-is-selected"), fs: document.querySelector("button.se-font-size-code-toolbar-button")?.innerText.trim().split("\n")[0] }));
  if (st.b) await page.click("button.se-bold-toolbar-button", { label: "굵게 끄기" });
  if (st.i) await page.click("button.se-italic-toolbar-button", { label: "기울임 끄기" });
  if (st.fs !== "15") { await page.click("button.se-font-size-code-toolbar-button", { label: "글자 크기 메뉴" }); await page.waitForTimeout(400); await page.click("button[data-value='fs15']", { label: "글자 크기 15" }); }
  await page.keyboard.paste({ text: P.text, html: P.html });
  await page.waitForTimeout(3000);
}
