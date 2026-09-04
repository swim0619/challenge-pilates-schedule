let currentMemberId = null;
let currentMemberData = null;
let currentPasses = [];
let editingPassId = null;
let attCountByPass = {};

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  await loadMembers();

  document.getElementById('search-input').addEventListener('input', (e) => {
    loadMembers(e.target.value.trim());
  });

  const newMemberBtn = document.getElementById('new-member-btn');
  const newMemberFormWrap = document.getElementById('new-member-form-wrap');
  newMemberBtn.addEventListener('click', () => {
    newMemberFormWrap.classList.toggle('hidden');
  });

  document.getElementById('new-member-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const { error } = await sb.from('members').insert({
      name: form.name.value.trim(),
      phone: form.phone.value.trim() || null,
      status: form.status.value,
      preferred_schedule: form.preferred_schedule.value.trim() || null,
      memo: form.memo.value.trim() || null,
    });
    if (error) {
      alert('회원 등록에 실패했습니다: ' + error.message);
      return;
    }
    form.reset();
    newMemberFormWrap.classList.add('hidden');
    loadMembers();
  });

  document.getElementById('status-select').addEventListener('change', async (e) => {
    if (!currentMemberId) return;
    const { error } = await sb.from('members').update({ status: e.target.value }).eq('id', currentMemberId);
    if (error) {
      alert('상태 변경에 실패했습니다: ' + error.message);
      return;
    }
    await selectMember(currentMemberId);
    await loadMembers(document.getElementById('search-input').value.trim());
  });

  document.getElementById('close-detail').addEventListener('click', () => {
    currentMemberId = null;
    document.getElementById('detail-card').classList.add('hidden');
  });

  document.getElementById('withdraw-member-btn').addEventListener('click', async () => {
    if (!currentMemberId || !currentMemberData) return;
    if (!confirm(`${currentMemberData.name} 회원을 탈퇴 처리할까요?`)) return;
    const { error } = await sb.from('members').update({ status: 'withdrawn' }).eq('id', currentMemberId);
    if (error) {
      alert('탈퇴 처리에 실패했습니다: ' + error.message);
      return;
    }
    await selectMember(currentMemberId);
    await loadMembers(document.getElementById('search-input').value.trim());
  });

  document.getElementById('delete-member-btn').addEventListener('click', async () => {
    if (!currentMemberId || !currentMemberData) return;
    if (!confirm(`${currentMemberData.name} 회원을 완전히 삭제할까요?\n이용권/결제/출석 기록이 모두 함께 삭제되며 되돌릴 수 없습니다.`)) return;
    const { error } = await sb.from('members').delete().eq('id', currentMemberId);
    if (error) {
      alert('삭제에 실패했습니다: ' + error.message);
      return;
    }
    currentMemberId = null;
    currentMemberData = null;
    document.getElementById('detail-card').classList.add('hidden');
    await loadMembers(document.getElementById('search-input').value.trim());
  });

  const editFormWrap = document.getElementById('edit-member-form-wrap');
  const editForm = document.getElementById('edit-member-form');

  document.getElementById('edit-member-btn').addEventListener('click', () => {
    if (!currentMemberData) return;
    editForm.name.value = currentMemberData.name || '';
    editForm.phone.value = currentMemberData.phone || '';
    editForm.preferred_schedule.value = currentMemberData.preferred_schedule || '';
    editForm.memo.value = currentMemberData.memo || '';
    editFormWrap.classList.remove('hidden');
  });

  document.getElementById('cancel-edit-member').addEventListener('click', () => {
    editFormWrap.classList.add('hidden');
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentMemberId) return;
    const { error } = await sb.from('members').update({
      name: editForm.name.value.trim(),
      phone: editForm.phone.value.trim() || null,
      preferred_schedule: editForm.preferred_schedule.value.trim() || null,
      memo: editForm.memo.value.trim() || null,
    }).eq('id', currentMemberId);

    if (error) {
      alert('수정에 실패했습니다: ' + error.message);
      return;
    }

    editFormWrap.classList.add('hidden');
    await selectMember(currentMemberId);
    await loadMembers(document.getElementById('search-input').value.trim());
  });

  document.getElementById('new-pass-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentMemberId) return;
    const form = e.target;
    const totalSessions = Number(form.total_sessions.value);
    const amount = Number(form.amount.value);
    const paymentMethod = form.payment_method.value;
    const purchasedAt = form.purchased_at.value || undefined;

    if (!totalSessions || totalSessions < 1) {
      alert('총 횟수를 확인해주세요.');
      return;
    }
    if (!form.amount.value || amount < 0) {
      alert('금액을 확인해주세요.');
      return;
    }

    const { data: pass, error: passError } = await sb
      .from('session_passes')
      .insert({
        member_id: currentMemberId,
        total_sessions: totalSessions,
        remaining_sessions: totalSessions,
        ...(purchasedAt ? { purchased_at: purchasedAt } : {}),
      })
      .select()
      .single();

    if (passError) {
      alert('이용권 등록에 실패했습니다: ' + passError.message);
      return;
    }

    const { error: paymentError } = await sb.from('payments').insert({
      member_id: currentMemberId,
      pass_id: pass.id,
      amount,
      payment_method: paymentMethod,
      ...(purchasedAt ? { paid_at: purchasedAt } : {}),
    });

    if (paymentError) {
      alert('결제 기록에 실패했습니다: ' + paymentError.message);
      return;
    }

    form.reset();
    await selectMember(currentMemberId);
    await loadMembers(document.getElementById('search-input').value.trim());
  });
});

function memberStatusBadge(m) {
  if (m.status === 'withdrawn') return { text: '탈퇴', cls: 'badge-muted' };
  if (m.status === 'trial') return { text: '체험수업', cls: 'badge-info' };
  return null;
}

async function loadMembers(search = '') {
  const tbody = document.getElementById('member-rows');

  let query = sb
    .from('members')
    .select('id, name, phone, preferred_schedule, status, created_at, session_passes(remaining_sessions, active), attendance(id)')
    .order('name');

  if (search) query = query.ilike('name', `%${search}%`);

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">불러오기 실패: ${error.message}</td></tr>`;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">등록된 회원이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = data.map((m, i) => {
    const remaining = (m.session_passes || [])
      .filter((p) => p.active)
      .reduce((sum, p) => sum + p.remaining_sessions, 0);
    const usedCount = (m.attendance || []).length;
    const status = memberStatusBadge(m);
    return `
      <tr class="member-row" data-id="${m.id}" style="cursor:pointer">
        <td>${i + 1}</td>
        <td>${m.name}</td>
        <td>${status ? `<span class="badge ${status.cls}">${status.text}</span>` : '-'}</td>
        <td>${m.phone || '-'}</td>
        <td>${m.preferred_schedule || '-'}</td>
        <td>${usedCount}회</td>
        <td><span class="badge ${remainingBadgeClass(remaining)}">${remaining}회</span></td>
        <td><button class="btn btn-outline btn-sm" type="button">상세</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('.member-row').forEach((row) => {
    row.addEventListener('click', () => selectMember(row.dataset.id));
  });
}

async function selectMember(memberId) {
  currentMemberId = memberId;

  const [{ data: member }, { data: passes }, { count: usedCount }, { data: attRows }] = await Promise.all([
    sb.from('members').select('id, name, phone, memo, preferred_schedule, status, created_at').eq('id', memberId).single(),
    sb.from('session_passes').select('*').eq('member_id', memberId).order('purchased_at', { ascending: false }),
    sb.from('attendance').select('id', { count: 'exact', head: true }).eq('member_id', memberId),
    sb.from('attendance').select('pass_id').eq('member_id', memberId),
  ]);

  if (!member) return;

  attCountByPass = {};
  (attRows || []).forEach((a) => {
    attCountByPass[a.pass_id] = (attCountByPass[a.pass_id] || 0) + 1;
  });

  currentMemberData = member;
  document.getElementById('edit-member-form-wrap').classList.add('hidden');

  document.getElementById('detail-name').textContent = member.name;
  document.getElementById('detail-phone').textContent = member.phone || '';

  const status = memberStatusBadge(member);
  const statusEl = document.getElementById('detail-status');
  statusEl.textContent = status ? status.text : '';
  statusEl.className = 'badge' + (status ? ' ' + status.cls : '');

  document.getElementById('status-select').value = member.status || 'active';
  document.getElementById('detail-preferred').textContent = member.preferred_schedule ? '선호: ' + member.preferred_schedule : '';
  document.getElementById('detail-memo').textContent = member.memo ? '메모: ' + member.memo : '';

  const remaining = (passes || [])
    .filter((p) => p.active)
    .reduce((sum, p) => sum + p.remaining_sessions, 0);
  document.getElementById('detail-remaining').textContent = remaining + '회';
  document.getElementById('detail-used').textContent = (usedCount || 0) + '회';

  currentPasses = passes || [];
  editingPassId = null;
  renderPassRows();

  const detailCard = document.getElementById('detail-card');
  detailCard.classList.remove('hidden');
  detailCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderPassRows() {
  const passRows = document.getElementById('pass-rows');
  if (!currentPasses || currentPasses.length === 0) {
    passRows.innerHTML = '<tr><td colspan="4" class="empty-state">등록된 이용권이 없습니다.</td></tr>';
    return;
  }

  passRows.innerHTML = currentPasses.map((p) => {
    const expectedRemaining = p.total_sessions - (attCountByPass[p.id] || 0);
    const mismatchWarning = expectedRemaining !== p.remaining_sessions
      ? `<span class="badge badge-danger" title="출석 ${attCountByPass[p.id] || 0}회 기준 예상 잔여는 ${expectedRemaining}회입니다">⚠ 확인필요</span>`
      : '';

    if (p.id === editingPassId) {
      return `
        <tr>
          <td><input type="date" data-edit-field="purchased_at" value="${p.purchased_at}" style="width:140px;"></td>
          <td><input type="text" inputmode="numeric" pattern="[0-9]*" data-edit-field="total_sessions" value="${p.total_sessions}" style="width:70px;"></td>
          <td><input type="text" inputmode="numeric" pattern="[0-9]*" data-edit-field="remaining_sessions" value="${p.remaining_sessions}" style="width:70px;"> ${mismatchWarning}</td>
          <td><span class="badge ${p.remaining_sessions > 0 ? 'badge-success' : 'badge-muted'}">${p.remaining_sessions > 0 ? '사용중' : '소진'}</span></td>
          <td class="owner-only" style="display:flex; gap:6px;">
            <button class="btn btn-primary btn-sm" data-save-pass="${p.id}" type="button">저장</button>
            <button class="btn btn-outline btn-sm" data-cancel-edit-pass type="button">취소</button>
          </td>
        </tr>
      `;
    }
    return `
      <tr>
        <td>${p.purchased_at}</td>
        <td>${p.total_sessions}회</td>
        <td>${p.remaining_sessions}회 ${mismatchWarning}</td>
        <td><span class="badge ${p.remaining_sessions > 0 ? 'badge-success' : 'badge-muted'}">${p.remaining_sessions > 0 ? '사용중' : '소진'}</span></td>
        <td class="owner-only" style="display:flex; gap:6px;">
          <button class="btn btn-outline btn-sm" data-edit-pass="${p.id}" type="button">수정</button>
          <button class="btn btn-danger btn-sm" data-delete-pass="${p.id}" type="button">삭제</button>
        </td>
      </tr>
    `;
  }).join('');

  passRows.querySelectorAll('[data-edit-pass]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingPassId = btn.dataset.editPass;
      renderPassRows();
    });
  });
  passRows.querySelectorAll('[data-cancel-edit-pass]').forEach((btn) => {
    btn.addEventListener('click', () => {
      editingPassId = null;
      renderPassRows();
    });
  });
  passRows.querySelectorAll('[data-save-pass]').forEach((btn) => {
    btn.addEventListener('click', () => savePass(btn.dataset.savePass));
  });
  passRows.querySelectorAll('[data-delete-pass]').forEach((btn) => {
    btn.addEventListener('click', () => deletePass(btn.dataset.deletePass));
  });
}

async function savePass(passId) {
  const row = document.querySelector(`[data-save-pass="${passId}"]`).closest('tr');
  const totalSessions = Number(row.querySelector('[data-edit-field="total_sessions"]').value);
  const remainingSessions = Number(row.querySelector('[data-edit-field="remaining_sessions"]').value);
  const purchasedAt = row.querySelector('[data-edit-field="purchased_at"]').value;

  if (!totalSessions || totalSessions < 1) {
    alert('총 횟수를 확인해주세요.');
    return;
  }
  if (remainingSessions < 0 || remainingSessions > totalSessions) {
    alert('잔여 횟수는 0 이상, 총 횟수 이하여야 합니다.');
    return;
  }

  const { error } = await sb.from('session_passes').update({
    total_sessions: totalSessions,
    remaining_sessions: remainingSessions,
    ...(purchasedAt ? { purchased_at: purchasedAt } : {}),
  }).eq('id', passId);

  if (error) {
    alert('이용권 수정에 실패했습니다: ' + error.message);
    return;
  }

  editingPassId = null;
  await selectMember(currentMemberId);
}

async function deletePass(passId) {
  if (!confirm('이 이용권을 삭제할까요?')) return;
  const { error } = await sb.from('session_passes').delete().eq('id', passId);
  if (error) {
    if (error.message.includes('foreign key') || error.code === '23503') {
      alert('이미 출석 기록이 있는 이용권은 삭제할 수 없습니다. 관련 출석을 먼저 취소해주세요.');
    } else {
      alert('삭제에 실패했습니다: ' + error.message);
    }
    return;
  }
  await selectMember(currentMemberId);
  await loadMembers(document.getElementById('search-input').value.trim());
}
