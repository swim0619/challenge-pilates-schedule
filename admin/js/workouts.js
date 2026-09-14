let currentMemberId = null;
let editingLogId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  await loadMemberOptions();

  const memberSelect = document.getElementById('member-select');
  memberSelect.addEventListener('change', () => {
    currentMemberId = memberSelect.value;
    const logCard = document.getElementById('log-card');
    if (!currentMemberId) {
      logCard.classList.add('hidden');
      return;
    }
    document.getElementById('log-member-name').textContent =
      memberSelect.options[memberSelect.selectedIndex].textContent;
    logCard.classList.remove('hidden');
    loadLogs();
  });

  const form = document.getElementById('log-form');
  form.log_date.value = todayStr();

  document.getElementById('mark-highlight-yellow').addEventListener('click', () => wrapSelection('==', '=='));
  document.getElementById('mark-highlight-pink').addEventListener('click', () => wrapSelection('%%', '%%'));
  document.getElementById('mark-highlight-purple').addEventListener('click', () => wrapSelection('^^', '^^'));
  document.getElementById('mark-underline').addEventListener('click', () => wrapSelection('__', '__'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentMemberId) return;

    const { error } = await sb.from('workout_logs').insert({
      member_id: currentMemberId,
      log_date: form.log_date.value,
      content: form.content.value.trim(),
      pain_level: form.pain_level.value === '' ? null : Number(form.pain_level.value),
    });

    if (error) {
      alert('기록 저장에 실패했습니다: ' + error.message);
      return;
    }

    form.content.value = '';
    form.pain_level.value = '';
    form.log_date.value = todayStr();
    await loadLogs();
  });
});

function wrapSelection(before, after) {
  const textarea = document.querySelector('textarea[name="content"]');
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  if (start === end) {
    // 선택된 글자가 없으면: 표시 기호만 커서 위치에 넣고, 그 사이에 커서를 둠
    textarea.value = value.slice(0, start) + before + after + value.slice(end);
    textarea.focus();
    textarea.selectionStart = start + before.length;
    textarea.selectionEnd = start + before.length;
    return;
  }

  const selected = value.slice(start, end);
  textarea.value = value.slice(0, start) + before + selected + after + value.slice(end);
  textarea.focus();
  textarea.selectionStart = start + before.length;
  textarea.selectionEnd = end + before.length;
}

async function loadMemberOptions() {
  const { data } = await sb.from('members').select('id, name').order('name');
  const select = document.getElementById('member-select');
  select.innerHTML =
    '<option value="">회원을 선택하세요</option>' +
    (data || []).map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatContent(text) {
  let html = escapeHtml(text);
  html = html.replace(/==([^=]+)==/g, '<mark class="hl-yellow">$1</mark>');
  html = html.replace(/%%([^%]+)%%/g, '<mark class="hl-pink">$1</mark>');
  html = html.replace(/\^\^([^^]+)\^\^/g, '<mark class="hl-purple">$1</mark>');
  html = html.replace(/__([^_]+)__/g, '<u>$1</u>');
  return html.replace(/\n/g, '<br>');
}

function painBadge(level) {
  if (level === null || level === undefined) return '-';
  let cls = 'badge-success';
  if (level >= 3) cls = 'badge-danger';
  else if (level >= 1) cls = 'badge-warning';
  return `<span class="badge ${cls}">${level}</span>`;
}

async function loadLogs() {
  const tbody = document.getElementById('log-rows');
  tbody.innerHTML = '<tr><td colspan="4" class="empty-state">불러오는 중...</td></tr>';

  const { data, error } = await sb
    .from('workout_logs')
    .select('id, log_date, content, pain_level')
    .eq('member_id', currentMemberId)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">불러오기 실패: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">기록이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((log) => {
    if (log.id === editingLogId) {
      return `
        <tr>
          <td><input type="date" class="edit-log-date" value="${log.log_date}" style="width:140px;"></td>
          <td>
            <select class="edit-log-pain">
              <option value="" ${log.pain_level === null ? 'selected' : ''}>체크 안 함</option>
              <option value="0" ${log.pain_level === 0 ? 'selected' : ''}>0 - 없음</option>
              <option value="1" ${log.pain_level === 1 ? 'selected' : ''}>1 - 아주 약함</option>
              <option value="2" ${log.pain_level === 2 ? 'selected' : ''}>2 - 약함</option>
              <option value="3" ${log.pain_level === 3 ? 'selected' : ''}>3 - 보통</option>
              <option value="4" ${log.pain_level === 4 ? 'selected' : ''}>4 - 심함</option>
              <option value="5" ${log.pain_level === 5 ? 'selected' : ''}>5 - 매우 심함</option>
            </select>
          </td>
          <td><textarea class="edit-log-content" style="width:100%; min-height:100px;">${escapeHtml(log.content)}</textarea></td>
          <td style="display:flex; flex-direction:column; gap:6px;">
            <button class="btn btn-primary btn-sm" data-save-log="${log.id}" type="button">저장</button>
            <button class="btn btn-outline btn-sm" data-cancel-edit-log type="button">취소</button>
          </td>
        </tr>
      `;
    }
    return `
    <tr>
      <td>${log.log_date}</td>
      <td>${painBadge(log.pain_level)}</td>
      <td>${formatContent(log.content)}</td>
      <td style="display:flex; flex-direction:column; gap:6px;">
        <button class="btn btn-outline btn-sm" data-edit-log="${log.id}" type="button">수정</button>
        <button class="btn btn-danger btn-sm" data-delete-log="${log.id}" type="button">삭제</button>
      </td>
    </tr>
  `;
  }).join('');

  tbody.querySelectorAll('[data-delete-log]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLog(btn.dataset.deleteLog));
  });

  tbody.querySelectorAll('[data-edit-log]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingLogId = btn.dataset.editLog;
      loadLogs();
    });
  });

  tbody.querySelectorAll('[data-cancel-edit-log]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingLogId = null;
      loadLogs();
    });
  });

  tbody.querySelectorAll('[data-save-log]').forEach((btn) => {
    btn.addEventListener('click', () => saveLog(btn.dataset.saveLog));
  });
}

async function saveLog(id) {
  const row = document.querySelector(`[data-save-log="${id}"]`).closest('tr');
  const logDate = row.querySelector('.edit-log-date').value;
  const painValue = row.querySelector('.edit-log-pain').value;
  const content = row.querySelector('.edit-log-content').value.trim();

  if (!logDate) {
    alert('날짜를 입력해주세요.');
    return;
  }
  if (!content) {
    alert('내용을 입력해주세요.');
    return;
  }

  const { error } = await sb.from('workout_logs').update({
    log_date: logDate,
    pain_level: painValue === '' ? null : Number(painValue),
    content,
  }).eq('id', id);

  if (error) {
    alert('수정에 실패했습니다: ' + error.message);
    return;
  }

  editingLogId = null;
  await loadLogs();
}

async function deleteLog(id) {
  if (!confirm('이 기록을 삭제할까요?')) return;
  const { error } = await sb.from('workout_logs').delete().eq('id', id);
  if (error) {
    alert('삭제에 실패했습니다: ' + error.message);
    return;
  }
  await loadLogs();
}
