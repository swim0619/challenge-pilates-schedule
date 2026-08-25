const PAYMENT_METHOD_LABELS = { card: '카드', cash: '현금', transfer: '계좌이체', other: '기타' };
let currentPayments = [];

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage({ ownerOnly: true });
  if (!auth) return;

  document.getElementById('month-filter').value = todayStr().slice(0, 7);
  document.getElementById('filter-btn').addEventListener('click', loadPayments);

  await Promise.all([loadPayments(), loadMemberOptions()]);

  const formWrap = document.getElementById('payment-form-wrap');
  const form = document.getElementById('payment-form');

  document.getElementById('new-payment-btn').addEventListener('click', () => {
    form.reset();
    form.id.value = '';
    form.pass_id.value = '';
    form.total_sessions.disabled = false;
    form.paid_at.value = todayStr();
    document.getElementById('payment-form-title').textContent = '매출 입력';
    formWrap.classList.remove('hidden');
  });

  document.getElementById('cancel-payment-form').addEventListener('click', () => {
    formWrap.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    let passId = form.pass_id.value || null;
    const totalSessions = form.total_sessions.value ? Number(form.total_sessions.value) : null;

    if (totalSessions && !passId) {
      const { data: pass, error: passError } = await sb
        .from('session_passes')
        .insert({
          member_id: form.member_id.value,
          total_sessions: totalSessions,
          remaining_sessions: totalSessions,
        })
        .select()
        .single();

      if (passError) {
        alert('이용권 등록에 실패했습니다: ' + passError.message);
        return;
      }
      passId = pass.id;
    }

    const payload = {
      member_id: form.member_id.value,
      amount: Number(form.amount.value),
      payment_method: form.payment_method.value,
      paid_at: form.paid_at.value,
      pass_id: passId,
    };

    const id = form.id.value;
    const { error } = id
      ? await sb.from('payments').update(payload).eq('id', id)
      : await sb.from('payments').insert(payload);

    if (error) {
      alert('저장에 실패했습니다: ' + error.message);
      return;
    }

    formWrap.classList.add('hidden');
    await loadPayments();
  });
});

async function loadMemberOptions() {
  const { data } = await sb.from('members').select('id, name').order('name');
  const select = document.querySelector('select[name="member_id"]');
  select.innerHTML =
    '<option value="">회원을 선택하세요</option>' +
    (data || []).map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
}

async function loadPayments() {
  const method = document.getElementById('method-filter').value;
  const month = document.getElementById('month-filter').value; // "YYYY-MM"
  const tbody = document.getElementById('payment-rows');

  let query = sb
    .from('payments')
    .select('id, member_id, pass_id, amount, payment_method, paid_at, member:members(name), pass:session_passes(total_sessions)')
    .order('paid_at', { ascending: false });

  if (method) query = query.eq('payment_method', method);

  let monthStart = null;
  let monthEnd = null;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    monthStart = `${month}-01`;
    monthEnd = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    query = query.gte('paid_at', monthStart).lt('paid_at', monthEnd);
  }

  const { data, error } = await query;

  if (error) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">불러오기 실패: ${error.message}</td></tr>`;
    return;
  }

  currentPayments = data || [];

  const total = currentPayments.reduce((sum, p) => sum + p.amount, 0);
  document.getElementById('total-revenue').textContent = formatCurrency(total);
  document.getElementById('total-count').textContent = currentPayments.length + '건';

  await loadNewMemberStats(monthStart, monthEnd);

  if (currentPayments.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">결제 내역이 없습니다.</td></tr>';
    return;
  }

  tbody.innerHTML = currentPayments.map((p) => `
    <tr>
      <td>${p.paid_at}</td>
      <td>${p.member ? p.member.name : '-'}</td>
      <td>${p.pass ? p.pass.total_sessions + '회권' : '-'}</td>
      <td>${PAYMENT_METHOD_LABELS[p.payment_method] || p.payment_method}</td>
      <td class="numeric">${formatCurrency(p.amount)}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit-payment="${p.id}" type="button">수정</button>
        <button class="btn btn-danger btn-sm" data-delete-payment="${p.id}" type="button">삭제</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-payment]').forEach((btn) => {
    btn.addEventListener('click', () => openEditPayment(btn.dataset.editPayment));
  });
  tbody.querySelectorAll('[data-delete-payment]').forEach((btn) => {
    btn.addEventListener('click', () => deletePayment(btn.dataset.deletePayment));
  });
}

async function loadNewMemberStats(monthStart, monthEnd) {
  const countEl = document.getElementById('new-member-count');
  const revenueEl = document.getElementById('new-member-revenue');

  if (!monthStart || !monthEnd) {
    countEl.textContent = '-';
    revenueEl.textContent = '-';
    return;
  }

  const { data: newMembers, error } = await sb
    .from('members')
    .select('id')
    .gte('created_at', monthStart)
    .lt('created_at', monthEnd);

  if (error) {
    countEl.textContent = '-';
    revenueEl.textContent = '-';
    return;
  }

  const newMemberIds = new Set((newMembers || []).map((m) => m.id));
  const newMemberRevenue = currentPayments
    .filter((p) => newMemberIds.has(p.member_id))
    .reduce((sum, p) => sum + p.amount, 0);

  countEl.textContent = newMemberIds.size + '명';
  revenueEl.textContent = formatCurrency(newMemberRevenue);
}

function openEditPayment(id) {
  const p = currentPayments.find((x) => x.id === id);
  if (!p) return;

  const form = document.getElementById('payment-form');
  form.id.value = p.id;
  form.member_id.value = p.member_id;
  form.amount.value = p.amount;
  form.payment_method.value = p.payment_method;
  form.paid_at.value = p.paid_at;
  form.pass_id.value = p.pass_id || '';
  form.total_sessions.value = p.pass ? p.pass.total_sessions : '';
  form.total_sessions.disabled = !!p.pass_id;

  document.getElementById('payment-form-title').textContent = '매출 수정';
  document.getElementById('payment-form-wrap').classList.remove('hidden');
}

async function deletePayment(id) {
  if (!confirm('이 매출 내역을 삭제할까요?')) return;
  const { error } = await sb.from('payments').delete().eq('id', id);
  if (error) {
    alert('삭제에 실패했습니다: ' + error.message);
    return;
  }
  await loadPayments();
}
