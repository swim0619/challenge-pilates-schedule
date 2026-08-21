let currentMemberId = null;

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

  tbody.innerHTML = data.map((log) => `
    <tr>
      <td>${log.log_date}</td>
      <td>${painBadge(log.pain_level)}</td>
      <td>${formatContent(log.content)}</td>
      <td><button class="btn btn-danger btn-sm" data-delete-log="${log.id}" type="button">삭제</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-delete-log]').forEach((btn) => {
    btn.addEventListener('click', () => deleteLog(btn.dataset.deleteLog));
  });
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
