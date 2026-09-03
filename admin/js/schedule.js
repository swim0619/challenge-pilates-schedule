let instructorOptions = [];
let membersById = {};
let allClasses = [];
let attendanceByClassId = {};
let sessionNumByClassId = {};
let currentView = 'week';
let weekCursor = mondayOf(new Date());
let monthCursor = new Date();
monthCursor.setDate(1);

document.addEventListener('DOMContentLoaded', async () => {
  const auth = await guardPage();
  if (!auth) return;

  await Promise.all([loadInstructorOptions(), loadMemberOptions()]);
  await loadSchedule();

  const formWrap = document.getElementById('class-form-wrap');
  const form = document.getElementById('class-form');

  document.getElementById('new-class-btn').addEventListener('click', () => {
    openNewClassForm(todayStr());
  });

  form.member_id.addEventListener('change', () => {
    const member = membersById[form.member_id.value];
    if (member) form.title.value = member.name;
  });

  form.is_trial.addEventListener('change', () => {
    if (form.is_trial.checked) form.member_id.value = '';
    updateTrialFieldsVisibility(form);
  });

  document.getElementById('cancel-class-form').addEventListener('click', () => {
    formWrap.classList.add('hidden');
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const classDate = form.class_date.value;
    const startTime = form.start_time.value.trim();
    let memberId = form.member_id.value;
    let title = form.title.value.trim();

    if (form.is_trial.checked) {
      const trialName = form.trial_name.value.trim();
      if (!trialName) {
        alert('체험 회원 이름을 입력해주세요.');
        return;
      }
      const { data: newMember, error: memberError } = await sb
        .from('members')
        .insert({
          name: trialName,
          phone: form.trial_phone.value.trim() || null,
          status: 'trial',
        })
        .select()
        .single();

      if (memberError) {
        alert('체험 회원 등록에 실패했습니다: ' + memberError.message);
        return;
      }

      memberId = newMember.id;
      title = trialName;
      await loadMemberOptions();
    }

    const member = membersById[memberId];
    title = title || (member ? member.name : '');

    if (!title) {
      alert('제목을 입력해주세요.');
      return;
    }

    const payload = {
      title,
      member_id: memberId || null,
      class_date: classDate,
      day_of_week: new Date(classDate + 'T00:00:00').getDay(),
      start_time: startTime,
      end_time: addMinutes(startTime, 60),
      capacity: 1,
      instructor_id: form.instructor_id.value || null,
    };

    const id = form.id.value;
    const { error } = id
      ? await sb.from('classes').update(payload).eq('id', id)
      : await sb.from('classes').insert(payload);

    if (error) {
      alert('저장에 실패했습니다: ' + error.message);
      return;
    }

    formWrap.classList.add('hidden');
    await loadSchedule();
  });

  document.querySelectorAll('[data-view-btn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentView = btn.dataset.viewBtn;
      document.querySelectorAll('[data-view-btn]').forEach((b) => b.classList.toggle('active', b === btn));
      document.getElementById('week-nav').classList.toggle('hidden', currentView !== 'week');
      document.getElementById('month-nav').classList.toggle('hidden', currentView !== 'month');
      renderCurrentView();
    });
  });

  document.getElementById('prev-week').addEventListener('click', goToPrevPeriod);
  document.getElementById('next-week').addEventListener('click', goToNextPeriod);
  document.getElementById('prev-month').addEventListener('click', goToPrevPeriod);
  document.getElementById('next-month').addEventListener('click', goToNextPeriod);

  setupSwipeNav(document.getElementById('schedule-body'));
});

function goToNextPeriod() {
  if (currentView === 'month') {
    monthCursor.setMonth(monthCursor.getMonth() + 1);
  } else {
    weekCursor.setDate(weekCursor.getDate() + 7);
  }
  renderCurrentView();
}

function goToPrevPeriod() {
  if (currentView === 'month') {
    monthCursor.setMonth(monthCursor.getMonth() - 1);
  } else {
    weekCursor.setDate(weekCursor.getDate() - 7);
  }
  renderCurrentView();
}

function setupSwipeNav(el) {
  let touchStartX = null;
  let touchStartY = null;

  el.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  el.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy)) return; // 짧거나 세로 스크롤이면 무시
    if (isMidInnerScroll(el, dx)) return; // 요일 칸을 옆으로 넘겨보는 중이면 주/월 전환은 하지 않음
    if (dx < 0) goToNextPeriod(); else goToPrevPeriod();
  });

  // 트랙패드 좌우 스와이프(가로 휠 스크롤)도 지원
  let wheelAccumX = 0;
  let wheelTimer = null;
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    wheelAccumX += e.deltaX;
    clearTimeout(wheelTimer);
    wheelTimer = setTimeout(() => {
      if (isMidInnerScroll(el, wheelAccumX)) { wheelAccumX = 0; return; }
      if (wheelAccumX > 60) goToNextPeriod();
      else if (wheelAccumX < -60) goToPrevPeriod();
      wheelAccumX = 0;
    }, 120);
  }, { passive: true });
}

// 요일 칸(.week-grid-wrap/.month-grid)이 자체적으로 가로 스크롤 가능한 상태면,
// 그 스크롤이 끝(가장자리)에 닿기 전까지는 주/월 전환 스와이프로 취급하지 않는다.
function isMidInnerScroll(container, dx) {
  const scroller = container.querySelector('.week-grid-wrap, .month-grid');
  if (!scroller || scroller.scrollWidth <= scroller.clientWidth + 2) return false;
  const atRightEdge = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
  const atLeftEdge = scroller.scrollLeft <= 2;
  if (dx < 0 && !atRightEdge) return true;
  if (dx > 0 && !atLeftEdge) return true;
  return false;
}

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

function addMinutes(timeStr, minutes) {
  const [h, m] = timeStr.split(':').map(Number);
  const total = (h * 60 + m + minutes) % (24 * 60);
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function loadInstructorOptions() {
  const { data } = await sb.from('profiles').select('id, name, role').order('name');
  instructorOptions = data || [];
  const select = document.querySelector('select[name="instructor_id"]');
  select.innerHTML =
    '<option value="">미배정</option>' +
    instructorOptions.map((p) => `<option value="${p.id}">${p.name} (${p.role === 'owner' ? '원장' : '강사'})</option>`).join('');
}

async function loadMemberOptions() {
  const { data } = await sb
    .from('members')
    .select('id, name, status, created_at, session_passes(id, total_sessions, remaining_sessions, active, purchased_at)')
    .order('name');

  membersById = {};
  (data || []).forEach((m) => {
    const activePasses = (m.session_passes || [])
      .filter((p) => p.active && p.remaining_sessions > 0)
      .sort((a, b) => (a.purchased_at < b.purchased_at ? -1 : 1));
    membersById[m.id] = { name: m.name, status: m.status, created_at: m.created_at, activePasses };
  });

  const select = document.querySelector('select[name="member_id"]');
  select.innerHTML =
    '<option value="">회원을 선택하세요</option>' +
    (data || []).map((m) => `<option value="${m.id}">${m.name}</option>`).join('');
}

async function loadSchedule() {
  const { data, error } = await sb
    .from('classes')
    .select('id, title, member_id, class_date, day_of_week, start_time, end_time, capacity, active, cancelled, completed, absent, instructor:profiles(id, name)')
    .eq('active', true)
    .order('class_date')
    .order('start_time');

  if (error) {
    document.getElementById('schedule-body').innerHTML = `<p class="empty-state">불러오기 실패: ${error.message}</p>`;
    return;
  }

  allClasses = data || [];

  attendanceByClassId = {};
  if (allClasses.length > 0) {
    const { data: attendanceRows } = await sb
      .from('attendance')
      .select('id, class_id, pass_id')
      .in('class_id', allClasses.map((c) => c.id));
    (attendanceRows || []).forEach((a) => { attendanceByClassId[a.class_id] = a; });
  }

  computeSessionNumbers();
  renderCurrentView();
}

function computeSessionNumbers() {
  sessionNumByClassId = {};
  const byMember = {};
  allClasses.forEach((c) => {
    if (!c.member_id || c.cancelled || c.absent) return;
    (byMember[c.member_id] = byMember[c.member_id] || []).push(c);
  });

  Object.keys(byMember).forEach((memberId) => {
    const member = membersById[memberId];
    const pass = member && member.activePasses[0];
    if (!pass) return;

    const list = byMember[memberId]; // allClasses is already ordered by class_date, start_time
    const checkedCount = list.filter((c) => attendanceByClassId[c.id]).length;
    const base = Math.max(0, pass.total_sessions - pass.remaining_sessions - checkedCount);

    list.forEach((c, i) => {
      sessionNumByClassId[c.id] = base + i + 1;
    });
  });
}

function renderCurrentView() {
  if (currentView === 'month') {
    renderMonthView();
  } else {
    renderWeekView();
  }
}

function memberStatusBadgeHtml(member) {
  if (member.status === 'withdrawn') {
    return '<span class="badge badge-muted" style="margin-left:6px;">탈퇴</span>';
  }
  if (member.status === 'trial') {
    return '<span class="badge badge-info" style="margin-left:6px;">체험수업</span>';
  }
  return '';
}

function classCardHtml(c) {
  const attendance = attendanceByClassId[c.id];
  const checkedIn = !!attendance;
  const member = c.member_id ? membersById[c.member_id] : null;
  const hasPass = member && member.activePasses.length > 0;

  let attendanceBtn = '';
  if (c.cancelled) {
    attendanceBtn = `<span class="badge badge-muted">취소됨</span>`;
  } else if (c.member_id) {
    const disabled = !checkedIn && !hasPass;
    attendanceBtn = `
      <label class="attend-check ${disabled ? 'disabled' : ''}">
        <input type="checkbox" data-attend-toggle="${c.id}" ${checkedIn ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
        <span>${disabled ? '잔여 없음' : '출석'}</span>
      </label>
    `;
  } else {
    attendanceBtn = `
      <label class="attend-check">
        <input type="checkbox" data-complete-toggle="${c.id}" ${c.completed ? 'checked' : ''}>
        <span>완료</span>
      </label>
    `;
  }

  const primaryPass = member && member.activePasses[0];
  const sessionNum = primaryPass ? (sessionNumByClassId[c.id] ?? primaryPass.total_sessions - primaryPass.remaining_sessions) : null;
  const remainingBadge = primaryPass
    ? `<span class="badge ${remainingBadgeClass(primaryPass.remaining_sessions)}" style="margin-left:6px;">${sessionNum}/${primaryPass.total_sessions}회</span>`
    : '';
  const statusBadge = member ? memberStatusBadgeHtml(member) : '';

  const isUnresolved = !!c.member_id && !c.cancelled && !c.absent && !checkedIn && c.class_date < todayStr();
  const unresolvedBadge = isUnresolved
    ? '<span class="badge badge-warning" style="margin-left:6px;" title="지난 수업인데 출석/결석 처리가 안 되어 있어요">미확인</span>'
    : '';

  const isPersonalDone = !c.member_id && c.completed;
  return `
    <div class="week-class ${checkedIn ? 'checked-in' : ''} ${isPersonalDone ? 'personal-done' : ''} ${c.cancelled ? 'cancelled' : ''} ${c.absent ? 'absent' : ''} ${isUnresolved ? 'unresolved' : ''}">
      <div class="card-menu owner-only">
        <button class="card-menu-btn" data-menu-toggle="${c.id}" type="button">⋯</button>
        <div class="card-menu-dropdown hidden" data-menu="${c.id}">
          <button data-edit="${c.id}" type="button">수정</button>
          ${c.member_id ? `<button data-absent-toggle="${c.id}" data-absent="${c.absent}" ${checkedIn ? 'disabled' : ''} type="button">${c.absent ? '결석 해제' : '결석 처리'}</button>` : ''}
          <button data-cancel-toggle="${c.id}" data-cancelled="${c.cancelled}" type="button">${c.cancelled ? '취소 해제' : '취소'}</button>
          <button data-deactivate="${c.id}" type="button">삭제</button>
        </div>
      </div>
      <span class="time">${formatTime(c.start_time)}</span>
      <span class="title">${c.title}</span>
      <span class="remaining" style="font-size:.78rem;">${c.instructor ? c.instructor.name : '미배정'}${statusBadge}${remainingBadge}${unresolvedBadge}</span>
      <div class="actions">
        ${attendanceBtn}
      </div>
    </div>
  `;
}

function renderWeekView() {
  const bodyEl = document.getElementById('schedule-body');
  const prevScrollLeft = bodyEl.querySelector('.week-grid-wrap')?.scrollLeft || 0;

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekCursor);
    d.setDate(weekCursor.getDate() + i);
    days.push(d);
  }

  const weekEnd = days[6];
  document.getElementById('week-label').textContent =
    `${weekCursor.getMonth() + 1}/${weekCursor.getDate()} - ${weekEnd.getMonth() + 1}/${weekEnd.getDate()}`;

  bodyEl.innerHTML = `
    <div class="week-grid-wrap">
      <div class="week-grid">
        ${days.map((d) => {
          const dateStr = toDateStr(d);
          const dayClasses = allClasses.filter((c) => c.class_date === dateStr);
          const isToday = dateStr === todayStr();
          return `
            <div class="week-col" data-date-cell="${dateStr}">
              <h4>${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}${isToday ? ' · 오늘' : ''}</h4>
              ${dayClasses.length === 0
                ? '<p class="empty-state" style="padding:16px 0;">-</p>'
                : dayClasses.map(classCardHtml).join('')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  const gridWrap = bodyEl.querySelector('.week-grid-wrap');
  if (gridWrap) gridWrap.scrollLeft = prevScrollLeft;

  bindScheduleActions();
}

function renderMonthView() {
  const bodyEl = document.getElementById('schedule-body');
  const prevScrollLeft = bodyEl.querySelector('.month-grid')?.scrollLeft || 0;
  const year = monthCursor.getFullYear();
  const month = monthCursor.getMonth();

  document.getElementById('month-label').textContent = `${year}년 ${month + 1}월`;

  const firstOfMonth = new Date(year, month, 1);
  const startOffset = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - startOffset);

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + i);
    cells.push(cellDate);
  }

  const mondayFirstLabels = [...DAY_LABELS.slice(1), DAY_LABELS[0]];

  bodyEl.innerHTML = `
    <div class="month-grid">
      ${mondayFirstLabels.map((l) => `<div class="month-daylabel">${l}</div>`).join('')}
      ${cells.map((cellDate) => {
        const isOtherMonth = cellDate.getMonth() !== month;
        const dateStr = toDateStr(cellDate);
        const dayClasses = allClasses.filter((c) => c.class_date === dateStr).sort((a, b) => a.start_time.localeCompare(b.start_time));
        return `
          <div class="month-cell ${isOtherMonth ? 'other-month' : ''}" data-date-cell="${dateStr}">
            <div class="date-num">${cellDate.getDate()}</div>
            ${dayClasses.map((c) => {
              const pillCheckedIn = !!attendanceByClassId[c.id];
              const pillPersonalDone = !c.member_id && c.completed;
              return `
              <span class="class-pill ${pillCheckedIn ? 'checked-in' : ''} ${pillPersonalDone ? 'personal-done' : ''} ${c.cancelled ? 'cancelled' : ''}" data-edit="${c.id}" title="${formatTime(c.start_time)} ${c.title}${c.cancelled ? ' (취소됨)' : ''}">${formatTime(c.start_time)} ${c.title}</span>
            `;
            }).join('')}
          </div>
        `;
      }).join('')}
    </div>
  `;

  const monthGrid = bodyEl.querySelector('.month-grid');
  if (monthGrid) monthGrid.scrollLeft = prevScrollLeft;

  bindScheduleActions();
}

function bindScheduleActions() {
  document.querySelectorAll('[data-date-cell]').forEach((cell) => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.week-class') || e.target.closest('.class-pill')) return;
      openNewClassForm(cell.dataset.dateCell);
    });
  });
  document.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus();
      openEdit(btn.dataset.edit, allClasses);
    });
  });
  document.querySelectorAll('[data-deactivate]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus();
      deactivateClass(btn.dataset.deactivate);
    });
  });
  document.querySelectorAll('[data-cancel-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus();
      toggleCancelClass(btn.dataset.cancelToggle, btn.dataset.cancelled === 'true');
    });
  });
  document.querySelectorAll('[data-attend-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      const classId = checkbox.dataset.attendToggle;
      if (checkbox.checked) {
        checkInClass(classId);
      } else {
        const attendance = attendanceByClassId[classId];
        if (attendance) cancelAttendance(attendance.id);
      }
    });
  });
  document.querySelectorAll('[data-absent-toggle]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus();
      toggleAbsent(btn.dataset.absentToggle, btn.dataset.absent !== 'true');
    });
  });
  document.querySelectorAll('[data-complete-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => {
      toggleCompleted(checkbox.dataset.completeToggle, checkbox.checked);
    });
  });
  document.querySelectorAll('[data-menu-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const dropdown = document.querySelector(`[data-menu="${btn.dataset.menuToggle}"]`);
      const isOpen = !dropdown.classList.contains('hidden');
      closeAllMenus();
      if (!isOpen) dropdown.classList.remove('hidden');
    });
  });
}

function closeAllMenus() {
  document.querySelectorAll('.card-menu-dropdown').forEach((el) => el.classList.add('hidden'));
}

document.addEventListener('click', closeAllMenus);

async function checkInClass(classId) {
  const c = allClasses.find((x) => x.id === classId);
  if (!c || !c.member_id) return;
  const member = membersById[c.member_id];
  const pass = member && member.activePasses[0];

  if (!pass) {
    alert('사용 가능한 이용권이 없습니다.');
    return;
  }

  const { error } = await sb.from('attendance').insert({
    class_id: classId,
    member_id: c.member_id,
    pass_id: pass.id,
    session_date: c.class_date,
  });

  if (error) {
    alert('출석체크에 실패했습니다: ' + error.message);
    return;
  }

  if (c.absent) await sb.from('classes').update({ absent: false }).eq('id', classId);

  await Promise.all([loadMemberOptions(), loadSchedule()]);
}

async function cancelAttendance(attendanceId) {
  const { error } = await sb.from('attendance').delete().eq('id', attendanceId);
  if (error) {
    alert('출석 취소에 실패했습니다: ' + error.message);
    return;
  }
  await Promise.all([loadMemberOptions(), loadSchedule()]);
}

function updateTrialFieldsVisibility(form) {
  const isTrial = form.is_trial.checked;
  document.getElementById('member-field').classList.toggle('hidden', isTrial);
  document.getElementById('trial-name-field').classList.toggle('hidden', !isTrial);
  document.getElementById('trial-phone-field').classList.toggle('hidden', !isTrial);
}

function openNewClassForm(dateStr) {
  const formWrap = document.getElementById('class-form-wrap');
  const form = document.getElementById('class-form');

  if (formWrap.classList.contains('hidden')) {
    form.reset();
    form.id.value = '';
    form.class_date.value = dateStr;
    updateTrialFieldsVisibility(form);
    document.getElementById('class-form-title').textContent = '새 수업 등록';
    formWrap.classList.remove('hidden');
  } else {
    form.class_date.value = dateStr;
  }

  formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openEdit(id, classes) {
  const c = classes.find((x) => x.id === id);
  if (!c) return;

  const form = document.getElementById('class-form');
  form.id.value = c.id;
  form.member_id.value = c.member_id || '';
  form.title.value = c.title || '';
  form.class_date.value = c.class_date;
  form.start_time.value = c.start_time.slice(0, 5);
  form.instructor_id.value = c.instructor ? c.instructor.id : '';
  form.is_trial.checked = false;
  updateTrialFieldsVisibility(form);

  document.getElementById('class-form-title').textContent = '수업 수정';
  document.getElementById('class-form-wrap').classList.remove('hidden');
}

async function deactivateClass(id) {
  if (!confirm('이 수업을 삭제할까요? 시간표에서 완전히 사라집니다. (출석 기록은 유지됩니다)')) return;
  const { error } = await sb.from('classes').update({ active: false }).eq('id', id);
  if (error) {
    alert('처리에 실패했습니다: ' + error.message);
    return;
  }
  await loadSchedule();
}

async function toggleCompleted(id, completed) {
  const { error } = await sb.from('classes').update({ completed }).eq('id', id);
  if (error) {
    alert('처리에 실패했습니다: ' + error.message);
    return;
  }
  await loadSchedule();
}

async function toggleAbsent(id, absent) {
  const { error } = await sb.from('classes').update({ absent }).eq('id', id);
  if (error) {
    alert('처리에 실패했습니다: ' + error.message);
    return;
  }
  await loadSchedule();
}

async function toggleCancelClass(id, currentlyCancelled) {
  const { error } = await sb.from('classes').update({ cancelled: !currentlyCancelled }).eq('id', id);
  if (error) {
    alert('처리에 실패했습니다: ' + error.message);
    return;
  }
  await loadSchedule();
}
