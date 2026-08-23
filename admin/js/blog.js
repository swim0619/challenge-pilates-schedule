document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  await loadDrafts();

  document.getElementById('status-filter').addEventListener('change', loadDrafts);
});

async function loadDrafts() {
  const listEl = document.getElementById('draft-list');
  const status = document.getElementById('status-filter').value;

  listEl.innerHTML = '<p class="empty-state">불러오는 중...</p>';

  let query = sb.from('blog_drafts').select('id, title, content, keywords, source_topic, status, created_at, published_at').order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    listEl.innerHTML = `<p class="empty-state">불러오기 실패: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="empty-state">표시할 초안이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = data.map((d) => draftCardHtml(d)).join('');

  data.forEach((d) => bindCardEvents(d.id));
}

function draftCardHtml(d) {
  const statusBadge = d.status === 'published'
    ? '<span class="badge badge-success">게시완료</span>'
    : '<span class="badge badge-warning">초안</span>';

  const keywordTags = (d.keywords || []).map((k) => `<span class="badge badge-info">${escapeHtml(k)}</span>`).join(' ');
  const createdLabel = new Date(d.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return `
    <div class="card mt-16" id="draft-${d.id}">
      <div style="display:flex; justify-content:space-between; align-items:start; gap:12px;">
        <div>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            ${statusBadge}
            <strong data-field="title">${escapeHtml(d.title)}</strong>
          </div>
          <div style="color:var(--text-muted); font-size:.8rem; margin-top:4px;">
            ${createdLabel}${d.source_topic ? ' · ' + escapeHtml(d.source_topic) : ''}
          </div>
          <div class="mt-16" style="display:flex; gap:6px; flex-wrap:wrap;">${keywordTags}</div>
        </div>
      </div>

      <div class="mt-16" data-field="content-view" style="white-space:pre-wrap; line-height:1.6;">${escapeHtml(d.content)}</div>

      <div class="mt-16" style="display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" data-copy="${d.id}" type="button">복사하기</button>
        <button class="btn btn-outline btn-sm" data-edit="${d.id}" type="button">수정</button>
        ${d.status === 'draft' ? `<button class="btn btn-outline btn-sm" data-publish="${d.id}" type="button">게시완료로 표시</button>` : ''}
        <button class="btn btn-danger btn-sm" data-delete="${d.id}" type="button">삭제</button>
      </div>
    </div>
  `;
}

function bindCardEvents(id) {
  const card = document.getElementById(`draft-${id}`);

  card.querySelector(`[data-copy="${id}"]`).addEventListener('click', () => copyDraft(id));
  card.querySelector(`[data-edit="${id}"]`).addEventListener('click', () => editDraft(id));
  card.querySelector(`[data-delete="${id}"]`).addEventListener('click', () => deleteDraft(id));

  const publishBtn = card.querySelector(`[data-publish="${id}"]`);
  if (publishBtn) publishBtn.addEventListener('click', () => publishDraft(id));
}

async function copyDraft(id) {
  const { data, error } = await sb.from('blog_drafts').select('title, content').eq('id', id).single();
  if (error || !data) {
    alert('불러오기에 실패했습니다.');
    return;
  }

  const text = `${data.title}\n\n${data.content}`;
  try {
    await navigator.clipboard.writeText(text);
    alert('클립보드에 복사했습니다. 네이버 블로그 에디터에 붙여넣으세요.');
  } catch {
    alert('클립보드 복사에 실패했습니다. 브라우저 권한을 확인해주세요.');
  }
}

function editDraft(id) {
  const card = document.getElementById(`draft-${id}`);
  const titleEl = card.querySelector('[data-field="title"]');
  const contentEl = card.querySelector('[data-field="content-view"]');

  const currentTitle = titleEl.textContent;
  const currentContent = contentEl.textContent;

  titleEl.outerHTML = `<input type="text" data-field="title-input" value="${escapeAttr(currentTitle)}" style="flex:1; padding:.5em .7em; border:1.5px solid var(--border); border-radius:8px; font-weight:700;">`;
  contentEl.outerHTML = `<textarea data-field="content-input" rows="10" style="width:100%; padding:.7em .9em; border:1.5px solid var(--border); border-radius:10px; font-family:inherit; resize:vertical;">${escapeHtml(currentContent)}</textarea>`;

  const editBtn = card.querySelector(`[data-edit="${id}"]`);
  editBtn.textContent = '저장';
  editBtn.replaceWith(editBtn.cloneNode(true));
  card.querySelector(`[data-edit="${id}"]`).addEventListener('click', () => saveDraft(id));
}

async function saveDraft(id) {
  const card = document.getElementById(`draft-${id}`);
  const title = card.querySelector('[data-field="title-input"]').value.trim();
  const content = card.querySelector('[data-field="content-input"]').value.trim();

  if (!title || !content) {
    alert('제목과 본문을 모두 입력해주세요.');
    return;
  }

  const { error } = await sb.from('blog_drafts').update({ title, content }).eq('id', id);
  if (error) {
    alert('저장에 실패했습니다: ' + error.message);
    return;
  }

  await loadDrafts();
}

async function publishDraft(id) {
  if (!confirm('네이버 블로그에 직접 게시를 완료하셨나요? 게시완료로 표시합니다.')) return;

  const { error } = await sb.from('blog_drafts').update({ status: 'published', published_at: new Date().toISOString() }).eq('id', id);
  if (error) {
    alert('처리에 실패했습니다: ' + error.message);
    return;
  }

  await loadDrafts();
}

async function deleteDraft(id) {
  if (!confirm('이 초안을 삭제할까요?')) return;

  const { error } = await sb.from('blog_drafts').delete().eq('id', id);
  if (error) {
    alert('삭제에 실패했습니다: ' + error.message);
    return;
  }

  await loadDrafts();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}
