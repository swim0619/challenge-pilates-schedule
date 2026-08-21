let myUserId = null;

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage({ ownerOnly: true });
  if (!auth) return;
  myUserId = auth.session.user.id;

  await loadProfiles();
});

async function loadProfiles() {
  const tbody = document.getElementById('profile-rows');
  const { data, error } = await sb.from('profiles').select('*').order('created_at');

  if (error) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">불러오기 실패: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty-state">등록된 계정이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((p) => `
    <tr data-id="${p.id}">
      <td><input class="edit-name" value="${p.name}" style="width:120px; padding:.4em .6em; border:1px solid var(--border); border-radius:8px;"></td>
      <td><input class="edit-phone" value="${p.phone || ''}" style="width:130px; padding:.4em .6em; border:1px solid var(--border); border-radius:8px;"></td>
      <td>
        <select class="edit-role" ${p.id === myUserId ? 'disabled title="본인 권한은 변경할 수 없습니다"' : ''} style="padding:.4em .6em; border:1px solid var(--border); border-radius:8px;">
          <option value="instructor" ${p.role === 'instructor' ? 'selected' : ''}>강사</option>
          <option value="owner" ${p.role === 'owner' ? 'selected' : ''}>원장</option>
        </select>
      </td>
      <td>${new Date(p.created_at).toLocaleDateString('ko-KR')}</td>
      <td><button class="btn btn-outline btn-sm" data-save="${p.id}" type="button">저장</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-save]').forEach((btn) => {
    btn.addEventListener('click', () => saveProfile(btn.dataset.save));
  });
}

async function saveProfile(id) {
  const row = document.querySelector(`tr[data-id="${id}"]`);
  const name = row.querySelector('.edit-name').value.trim();
  const phone = row.querySelector('.edit-phone').value.trim();
  const role = row.querySelector('.edit-role').value;

  const { error } = await sb.from('profiles').update({ name, phone: phone || null, role }).eq('id', id);

  if (error) {
    alert('저장에 실패했습니다: ' + error.message);
    return;
  }

  alert('저장되었습니다.');
  await loadProfiles();
}
