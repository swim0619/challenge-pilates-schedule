export async function replacePara(page, startsWith, lines) {
  const r = await page.evaluate((s) => {
    const ps = [...document.querySelectorAll(".se-component.se-text:not(.se-documentTitle) .se-text-paragraph")].filter(p => p.innerText.trim().startsWith(s));
    if (ps.length !== 1) return { err: ps.length };
    ps[0].scrollIntoView({ block: "center" }); const b = ps[0].getBoundingClientRect();
    return { x: b.left + 20, y: b.top + 12 };
  }, startsWith);
  if (r.err !== undefined) throw new Error("para match " + r.err + ": " + startsWith);
  await page.mouse.click(r.x, r.y, { label: "고칠 문단 클릭" });
  await page.mouse.click(r.x, r.y, { clickCount: 3, label: "문단 전체 선택" });
  if (lines.length === 1) await page.keyboard.insertText(lines[0]);
  else {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    await page.keyboard.paste({ text: lines.join("\n"), html: lines.map(l => "<p>" + esc(l) + "</p>").join("") });
  }
  await page.waitForTimeout(700);
  return await page.evaluate((f) => [...document.querySelectorAll(".se-text-paragraph")].some(p => p.innerText.trim().startsWith(f)), lines[0].slice(0, 15));
}
export async function urlLineToLink(page, url, linkify) {
  const info = await page.evaluate((u) => {
    const ps = [...document.querySelectorAll(".se-component.se-text:not(.se-documentTitle) .se-text-paragraph")];
    const i = ps.findIndex(p => p.innerText.trim() === u);
    if (i < 0) return null;
    let j = i - 1; while (j >= 0 && !ps[j].innerText.trim()) j--;
    return { title: ps[j].innerText.trim() };
  }, url);
  if (!info) throw new Error("url line not found " + url);
  await linkify(page, info.title, url);
  const r = await page.evaluate((u) => { const p = [...document.querySelectorAll(".se-text-paragraph")].find(p => p.innerText.trim() === u); p.scrollIntoView({ block: "center" }); const b = p.getBoundingClientRect(); return { x: b.left + 20, y: b.top + b.height / 2 }; }, url);
  await page.mouse.click(r.x, r.y, { label: "주소 문단 클릭" });
  await page.mouse.click(r.x, r.y, { clickCount: 3, label: "주소 문단 선택" });
  await page.keyboard.press("Backspace");
  await page.keyboard.press("Backspace");
  await page.waitForTimeout(400);
  return info.title;
}
