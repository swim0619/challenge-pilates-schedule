let currentDate = todayStr();
let currentCategory = 'all';

const CATEGORY_LABEL = { personal: '개인', pilates: '필라테스', swim: '수영' };
const CATEGORY_BADGE = { personal: 'badge-muted', pilates: 'badge-info', swim: 'badge-warning' };

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

  listEl.innerHTML = data.map((t) => `
    <label class="todo-row ${t.done ? 'done' : ''}">
      <input type="checkbox" data-todo-toggle="${t.id}" ${t.done ? 'checked' : ''}>
      <span class="badge ${CATEGORY_BADGE[t.category] || 'badge-muted'}">${CATEGORY_LABEL[t.category] || t.category}</span>
      <span>${escapeHtml(t.content)}</span>
      <button type="button" class="btn btn-outline btn-sm" data-todo-delete="${t.id}">삭제</button>
    </label>
  `).join('');

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
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
