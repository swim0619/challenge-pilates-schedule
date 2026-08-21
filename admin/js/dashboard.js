document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  const today = new Date();
  document.getElementById('today-label').textContent =
    today.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });

  const todayIso = todayStr();

  const [{ data: classes }, { data: attendance }] = await Promise.all([
    sb.from('classes')
      .select('id, title, start_time, end_time, instructor:profiles(name)')
      .eq('class_date', todayIso)
      .eq('active', true)
      .order('start_time'),
    sb.from('attendance').select('id').eq('session_date', todayIso),
  ]);

  document.getElementById('stat-classes').textContent = (classes || []).length;
  document.getElementById('stat-attendance').textContent = (attendance || []).length;

  const listEl = document.getElementById('today-classes');
  if (!classes || classes.length === 0) {
    listEl.innerHTML = '<p class="empty-state">오늘 예정된 수업이 없습니다.</p>';
  } else {
    listEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>시간</th><th>수업명</th><th>담당 강사</th></tr></thead>
          <tbody>
            ${classes.map((c) => `
              <tr>
                <td>${formatTime(c.start_time)}</td>
                <td>${c.title}</td>
                <td>${c.instructor ? c.instructor.name : '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  if (auth.profile.role === 'owner') {
    const monthStart = todayIso.slice(0, 7) + '-01';
    const { data: payments } = await sb
      .from('payments')
      .select('amount')
      .gte('paid_at', monthStart)
      .lte('paid_at', todayIso);

    const total = (payments || []).reduce((sum, p) => sum + p.amount, 0);
    document.getElementById('stat-revenue').textContent = formatCurrency(total);
  }

  await loadPeriodStats(today);
});

function mondayOf(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=일 ... 6=토
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function loadPeriodStats(today) {
  const weekStart = toDateStr(mondayOf(today));
  const weekEndDate = mondayOf(today);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekEnd = toDateStr(weekEndDate);

  const monthStart = todayStr().slice(0, 7) + '-01';
  const monthEndDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const monthEnd = toDateStr(monthEndDate);

  const [weekDone, weekCancelled, monthDone] = await Promise.all([
    sb.from('attendance').select('id', { count: 'exact', head: true })
      .gte('session_date', weekStart).lte('session_date', weekEnd),
    sb.from('classes').select('id', { count: 'exact', head: true })
      .eq('cancelled', true).gte('class_date', weekStart).lte('class_date', weekEnd),
    sb.from('attendance').select('id', { count: 'exact', head: true })
      .gte('session_date', monthStart).lte('session_date', monthEnd),
  ]);

  document.getElementById('stat-week-done').textContent = (weekDone.count || 0) + '회';
  document.getElementById('stat-week-cancelled').textContent = (weekCancelled.count || 0) + '회';
  document.getElementById('stat-month-done').textContent = (monthDone.count || 0) + '회';
}
