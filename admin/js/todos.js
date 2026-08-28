let currentDate = todayStr();
let currentCategory = 'all';
let editingTodoId = null;

const CATEGORY_LABEL = { personal: '개인', pilates: '필라테스', swim: '수영', study: '공부', workout: '운동' };
const CATEGORY_BADGE = { personal: 'badge-yellow', pilates: 'badge-success', swim: 'badge-info', study: 'badge-purple', workout: 'badge-green' };

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  const dateInput = document.getElementById('todo-date-input');
  dateInput.value = currentDate;
  updateDateLabel();

  await loadTodos();

  dateInput.addEventListener('change', async () => {
    currentDate = dateInput.value || todayStr();
    updateDateLabel();
    await loadTodos();
  });

  document.getElementById('todo-today-btn').addEventListener('click', async () => {
    currentDate = todayStr();
    dateInput.value = currentDate;
    updateDateLabel();
    await loadTodos();
  });

  document.getElementById('todo-category-tabs').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-category]');
    if (!btn) return;
    currentCategory = btn.dataset.category;
    document.querySelectorAll('#todo-category-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
    await loadTodos();
  });

  document.getElementById('todo-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const content = form.content.value.trim();
    if (!content) return;

    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('todos').insert({
      content,
      category: form.category.value,
      todo_date: currentDate,
      created_by: user.id,
    });

    if (error) {
      alert('추가에 실패했습니다: ' + error.message);
      return;
    }

    form.reset();
    await loadTodos();
  });
});

function updateDateLabel() {
  const d = new Date(currentDate + 'T00:00:00');
  document.getElementById('today-label').textContent =
    d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
}

async function loadTodos() {
  const listEl = document.getElementById('todo-list');
  let query = sb
    .from('todos')
    .select('id, content, done, category')
    .eq('todo_date', currentDate)
    .order('created_at');

  if (currentCategory !== 'all') {
    query = query.eq('category', currentCategory);
  }

  const { data, error } = await query;

  if (error) {
    listEl.innerHTML = `<p class="empty-state">불러오기 실패: ${error.message}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="empty-state">등록된 할일이 없습니다.</p>';
    return;
  }

  listEl.innerHTML = data.map((t) => {
    if (t.id === editingTodoId) {
      return `
        <div class="todo-row">
          <input type="text" class="edit-content" value="${escapeHtml(t.content)}" style="flex:1; padding:.5em .7em; border:1.5px solid var(--border); border-radius:8px;">
          <select class="edit-category" style="padding:.5em .7em; border:1.5px solid var(--border); border-radius:8px;">
            <option value="personal" ${t.category === 'personal' ? 'selected' : ''}>개인</option>
            <option value="pilates" ${t.category === 'pilates' ? 'selected' : ''}>필라테스</option>
            <option value="swim" ${t.category === 'swim' ? 'selected' : ''}>수영</option>
            <option value="study" ${t.category === 'study' ? 'selected' : ''}>공부</option>
            <option value="workout" ${t.category === 'workout' ? 'selected' : ''}>운동</option>
          </select>
          <button type="button" class="btn btn-primary btn-sm" data-todo-save="${t.id}">저장</button>
          <button type="button" class="btn btn-outline btn-sm" data-todo-cancel-edit>취소</button>
        </div>
      `;
    }

    return `
      <label class="todo-row ${t.done ? 'done' : ''}">
        <input type="checkbox" data-todo-toggle="${t.id}" ${t.done ? 'checked' : ''}>
        <span class="badge ${CATEGORY_BADGE[t.category] || 'badge-muted'}">${CATEGORY_LABEL[t.category] || t.category}</span>
        <span>${escapeHtml(t.content)}</span>
        <button type="button" class="card-menu-btn" data-todo-menu-toggle="${t.id}">⋯</button>
        <div class="card-menu-dropdown hidden" data-todo-menu="${t.id}">
          <button type="button" data-todo-edit="${t.id}">수정</button>
          <button type="button" data-todo-delete="${t.id}" data-deactivate>삭제</button>
        </div>
      </label>
    `;
  }).join('');

  listEl.querySelectorAll('[data-todo-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', async () => {
      const { error } = await sb.from('todos').update({ done: checkbox.checked }).eq('id', checkbox.dataset.todoToggle);
      if (error) {
        alert('처리에 실패했습니다: ' + error.message);
        return;
      }
      await loadTodos();
    });
  });

  listEl.querySelectorAll('[data-todo-delete]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const { error } = await sb.from('todos').delete().eq('id', btn.dataset.todoDelete);
      if (error) {
        alert('삭제에 실패했습니다: ' + error.message);
        return;
      }
      await loadTodos();
    });
  });

  listEl.querySelectorAll('[data-todo-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const dropdown = document.querySelector(`[data-todo-menu="${btn.dataset.todoMenuToggle}"]`);
      const isOpen = !dropdown.classList.contains('hidden');
      closeAllTodoMenus();
      if (!isOpen) dropdown.classList.remove('hidden');
    });
  });

  listEl.querySelectorAll('[data-todo-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      editingTodoId = btn.dataset.todoEdit;
      loadTodos();
    });
  });

  listEl.querySelectorAll('[data-todo-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      editingTodoId = null;
      loadTodos();
    });
  });

  listEl.querySelectorAll('[data-todo-save]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      const row = btn.closest('.todo-row');
      const content = row.querySelector('.edit-content').value.trim();
      if (!content) {
        alert('할일 내용을 입력해주세요.');
        return;
      }
      const category = row.querySelector('.edit-category').value;

      const { error } = await sb.from('todos').update({ content, category }).eq('id', btn.dataset.todoSave);
      if (error) {
        alert('수정에 실패했습니다: ' + error.message);
        return;
      }
      editingTodoId = null;
      await loadTodos();
    });
  });
}

function closeAllTodoMenus() {
  document.querySelectorAll('.card-menu-dropdown').forEach((el) => el.classList.add('hidden'));
}

document.addEventListener('click', closeAllTodoMenus);

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
