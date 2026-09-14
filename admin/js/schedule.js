// 대한민국 법정 공휴일 (대체공휴일 포함). 해가 바뀌면 다음 해 목록을 추가해줘야 함.
const KOREAN_HOLIDAYS = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-06': '현충일',
  '2026-07-17': '제헌절',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '크리스마스',
};

let instructorOptions = [];
let membersById = {};
let allClasses = [];
let attendanceByClassId = {};
let projectedRemainingByClassId = {};
let firstClassIdByMember = {};
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

  form.repeat_weekly.addEventListener('change', () => {
    document.getElementById('repeat-weeks-field').classList.toggle('hidden', !form.repeat_weekly.checked);
  });

  document.getElementById('cancel-class-form').addEventListener('click', () => {
    formWrap.classList.add('hidden');
  });

  document.getElementById('unrepeat-btn').addEventListener('click', async () => {
    const memberId = form.member_id.value;
    const classDate = form.class_date.value;
    const startTimeVal = form.start_time.value.trim();
    if (!memberId || !classDate || !startTimeVal) return;

    const dayOfWeek = new Date(classDate + 'T00:00:00').getDay();

    const futureCount = allClasses.filter((c) =>
      c.member_id === memberId &&
      c.day_of_week === dayOfWeek &&
      c.start_time.slice(0, 5) === startTimeVal &&
      c.class_date > classDate &&
      !c.cancelled
    ).length;

    if (futureCount === 0) {
      alert('이후로 예정된 반복 수업이 없습니다.');
      return;
    }

    if (!confirm(`이 시간(같은 요일·시간) 이후로 예정된 반복 수업 ${futureCount}건을 모두 취소할까요?`)) return;

    const { error } = await sb.from('classes')
      .update({ cancelled: true })
      .eq('member_id', memberId)
      .eq('day_of_week', dayOfWeek)
      .eq('start_time', startTimeVal)
      .gt('class_date', classDate)
      .eq('cancelled', false);

    if (error) {
      alert('취소에 실패했습니다: ' + error.message);
      return;
    }

    formWrap.classList.add('hidden');
    await loadSchedule();
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

    const basePayload = {
      title,
      member_id: memberId || null,
      start_time: startTime,
      end_time: addMinutes(startTime, 60),
      capacity: 1,
      instructor_id: form.instructor_id.value || null,
    };

    const id = form.id.value;
    const repeatWeekly = form.repeat_weekly.checked;
    const repeatWeeks = repeatWeekly ? Math.max(1, Math.min(52, Number(form.repeat_weeks.value) || 1)) : 1;

    // 같은 회원이 같은 날짜·시간에 이미 등록돼 있으면 중복 생성하지 않음 (매주 반복 시 실수 방지)
    const existingSlots = new Set(
      allClasses
        .filter((c) => c.member_id && !c.cancelled && c.id !== id)
        .map((c) => `${c.member_id}|${c.class_date}|${c.start_time.slice(0, 5)}`)
    );

    let error;
    let skippedDuplicates = 0;
    if (id) {
      ({ error } = await sb.from('classes').update({
        ...basePayload,
        class_date: classDate,
        day_of_week: new Date(classDate + 'T00:00:00').getDay(),
      }).eq('id', id));

      if (memberId) existingSlots.add(`${memberId}|${classDate}|${startTime}`);

      if (!error && repeatWeekly && repeatWeeks > 1) {
        const rows = [];
        for (let i = 1; i < repeatWeeks; i++) {
          const d = new Date(classDate + 'T00:00:00');
          d.setDate(d.getDate() + 7 * i);
          const rowDate = toDateStr(d);

          if (memberId) {
            const slotKey = `${memberId}|${rowDate}|${startTime}`;
            if (existingSlots.has(slotKey)) {
              skippedDuplicates++;
              continue;
            }
            existingSlots.add(slotKey);
          }

          rows.push({
            ...basePayload,
            class_date: rowDate,
            day_of_week: d.getDay(),
          });
        }
        if (rows.length > 0) {
          ({ error } = await sb.from('classes').insert(rows));
        }
      }
    } else {
      const rows = [];
      for (let i = 0; i < repeatWeeks; i++) {
        const d = new Date(classDate + 'T00:00:00');
        d.setDate(d.getDate() + 7 * i);
        const rowDate = toDateStr(d);

        if (memberId) {
          const slotKey = `${memberId}|${rowDate}|${startTime}`;
          if (existingSlots.has(slotKey)) {
            skippedDuplicates++;
            continue;
          }
          existingSlots.add(slotKey);
        }

        rows.push({
          ...basePayload,
          class_date: rowDate,
          day_of_week: d.getDay(),
        });
      }

      if (rows.length === 0) {
        alert('이미 같은 회원이 같은 시간에 등록되어 있어 추가되지 않았습니다.');
        return;
      }

      ({ error } = await sb.from('classes').insert(rows));
    }

    if (error) {
      alert('저장에 실패했습니다: ' + error.message);
      return;
    }

    if (skippedDuplicates > 0) {
      alert(`이미 같은 회원이 등록되어 있던 ${skippedDuplicates}주는 건너뛰고 나머지만 등록했습니다.`);
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

  // 마우스로 클릭한 채 좌우로 끌었을 때도 스와이프로 인식 (트랙패드 휠 스크롤은 의도치 않게 자주 튀어서 제외함)
  let mouseStartX = null;
  let mouseStartY = null;
  let isMouseDragging = false;

  el.addEventListener('mousedown', (e) => {
    mouseStartX = e.clientX;
    mouseStartY = e.clientY;
    isMouseDragging = true;
  });

  el.addEventListener('mouseup', (e) => {
    if (!isMouseDragging || mouseStartX === null) return;
    isMouseDragging = false;
    const dx = e.clientX - mouseStartX;
    const dy = e.clientY - mouseStartY;
    mouseStartX = null;
    mouseStartY = null;
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy)) return; // 짧거나 세로 이동이면 무시
    if (isMidInnerScroll(el, dx)) return; // 요일 칸을 옆으로 넘겨보는 중이면 주/월 전환은 하지 않음
    if (dx < 0) goToNextPeriod(); else goToPrevPeriod();
  });

  el.addEventListener('mouseleave', () => {
    isMouseDragging = false;
    mouseStartX = null;
    mouseStartY = null;
  });
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

  computeFirstClassByMember();
  computeProjectedRemaining();
  renderCurrentView();
}

// 각 회원의 실제 첫 수업(=체험수업)이 무엇인지 기억해둔다. allClasses가 이미
// class_date/start_time 순으로 정렬돼 있으므로 각 회원별로 처음 만나는 수업이 곧 첫 수업이다.
// 정회원으로 전환된 뒤에도 그 첫 수업만큼은 계속 체험수업으로 표시하기 위함.
function computeFirstClassByMember() {
  firstClassIdByMember = {};
  allClasses.forEach((c) => {
    if (!c.member_id) return;
    if (!firstClassIdByMember[c.member_id]) {
      firstClassIdByMember[c.member_id] = c.id;
    }
  });
}

// 아직 출석 처리 안 된(예정) 수업들에 대해 "이 수업까지 진행하면 잔여가 몇 회 남는지"를 미리 계산해둔다.
// 결석 처리된 수업은 횟수를 소진하지 않으므로 카운터를 증가시키지 않는다.
function computeProjectedRemaining() {
  projectedRemainingByClassId = {};
  const byMember = {};
  allClasses.forEach((c) => {
    if (!c.member_id || c.cancelled || attendanceByClassId[c.id]) return;
    (byMember[c.member_id] = byMember[c.member_id] || []).push(c);
  });

  Object.keys(byMember).forEach((memberId) => {
    const member = membersById[memberId];
    const pass = member && member.activePasses[0];
    if (!pass) return;

    // 체험수업처럼 이 이용권을 사기 전에 잡혀있던 수업(또는 이용권 구매 당일의 체험수업 그 자체)은
    // 이 이용권 횟수를 소진하지 않으므로 제외한다.
    const classesUnderPass = byMember[memberId].filter((c) =>
      c.class_date >= pass.purchased_at && c.id !== firstClassIdByMember[memberId]
    );

    let counter = 0;
    classesUnderPass.forEach((c) => { // allClasses is already ordered by class_date, start_time
      if (!c.absent) counter++;
      projectedRemainingByClassId[c.id] = pass.remaining_sessions - counter;
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

function memberStatusBadgeHtml(member, isTrialClass) {
  if (member.status === 'withdrawn') {
    return '<span class="badge badge-muted" style="padding:.1em .4em; font-size:.72rem;">탈퇴</span>';
  }
  if (member.status === 'trial' || isTrialClass) {
    return '<span class="badge badge-info" style="padding:.1em .4em; font-size:.72rem;">체험수업</span>';
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
  const projectedRemaining = projectedRemainingByClassId[c.id];
  const displayRemaining = primaryPass ? (projectedRemaining !== undefined ? projectedRemaining : primaryPass.remaining_sessions) : null;
  const displayUsed = primaryPass ? primaryPass.total_sessions - displayRemaining : null;
  const remainingBadge = primaryPass
    ? `<span class="badge ${remainingBadgeClass(displayRemaining)}" style="padding:.1em .4em; font-size:.72rem;">진행 ${displayUsed}·잔여 ${displayRemaining}회</span>`
    : '';
  const isTrial = !!member && (member.status === 'trial' || firstClassIdByMember[c.member_id] === c.id);
  const statusBadge = member ? memberStatusBadgeHtml(member, isTrial) : '';

  const isUnresolved = !!c.member_id && !c.cancelled && !c.absent && !checkedIn && c.class_date < todayStr();
  const unresolvedBadge = isUnresolved
    ? '<span class="badge badge-warning" style="padding:.1em .4em; font-size:.72rem;" title="지난 수업인데 출석/결석 처리가 안 되어 있어요">미확인</span>'
    : '';

  const instructorSmall = c.instructor
    ? ` <small style="font-weight:400; font-size:.72rem; color:var(--text-muted);">${c.instructor.name}</small>`
    : (c.member_id ? ` <small style="font-weight:400; font-size:.72rem; color:var(--text-muted);">미배정</small>` : '');

  const isPersonalDone = !c.member_id && c.completed;
  const isPersonal = !c.member_id;
  return `
    <div class="week-class ${checkedIn ? 'checked-in' : ''} ${isPersonalDone ? 'personal-done' : ''} ${c.cancelled ? 'cancelled' : ''} ${c.absent ? 'absent' : ''} ${isUnresolved ? 'unresolved' : ''} ${isPersonal ? 'personal' : ''} ${isTrial ? 'trial' : ''}">
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
      <span class="title">${c.title}${instructorSmall}</span>
      <div class="actions">
        ${statusBadge}${remainingBadge}${unresolvedBadge}
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
          const dayClasses = allClasses.filter((c) => c.class_date === dateStr && !c.cancelled);
          const isToday = dateStr === todayStr();
          const amClasses = dayClasses.filter((c) => c.start_time < '12:00:00');
          const pmClasses = dayClasses.filter((c) => c.start_time >= '12:00:00');
          return `
            <div class="week-col ${isToday ? 'today' : ''} ${KOREAN_HOLIDAYS[dateStr] ? 'holiday' : ''}" data-date-cell="${dateStr}">
              <h4>${DAY_LABELS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()}${isToday ? ' <span class="today-badge">오늘</span>' : ''}${KOREAN_HOLIDAYS[dateStr] ? `<span class="holiday-label">${KOREAN_HOLIDAYS[dateStr]}</span>` : ''}</h4>
              ${dayClasses.length === 0
                ? '<p class="empty-state" style="padding:16px 0;">-</p>'
                : `
                  <div class="week-period ${amClasses.length === 0 ? 'week-period-empty' : ''}">
                    <div class="week-period-label">오전</div>
                    ${amClasses.map(classCardHtml).join('')}
                  </div>
                  <div class="week-period ${pmClasses.length === 0 ? 'week-period-empty' : ''}">
                    <div class="week-period-label">오후</div>
                    ${pmClasses.map(classCardHtml).join('')}
                  </div>
                `}
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
        const dayClasses = allClasses.filter((c) => c.class_date === dateStr && !c.cancelled).sort((a, b) => a.start_time.localeCompare(b.start_time));
        return `
          <div class="month-cell ${isOtherMonth ? 'other-month' : ''} ${KOREAN_HOLIDAYS[dateStr] ? 'holiday' : ''}" data-date-cell="${dateStr}">
            <div class="date-num">${cellDate.getDate()}${KOREAN_HOLIDAYS[dateStr] ? `<span class="holiday-label">${KOREAN_HOLIDAYS[dateStr]}</span>` : ''}</div>
            ${dayClasses.map((c) => {
              const pillCheckedIn = !!attendanceByClassId[c.id];
              const pillPersonal = !c.member_id;
              const pillPersonalDone = pillPersonal && c.completed;
              const pillMember = c.member_id ? membersById[c.member_id] : null;
              const pillTrial = !!pillMember && (pillMember.status === 'trial' || firstClassIdByMember[c.member_id] === c.id);
              return `
              <span class="class-pill ${pillCheckedIn ? 'checked-in' : ''} ${pillPersonal ? 'personal' : ''} ${pillPersonalDone ? 'personal-done' : ''} ${c.cancelled ? 'cancelled' : ''} ${c.absent ? 'absent' : ''} ${pillTrial ? 'trial' : ''}" data-edit="${c.id}" title="${formatTime(c.start_time)} ${c.title}${c.cancelled ? ' (취소됨)' : ''}${c.absent ? ' (결석)' : ''}">${formatTime(c.start_time)} ${c.title}</span>
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
    document.getElementById('repeat-weekly-field').classList.remove('hidden');
    document.getElementById('repeat-weeks-field').classList.add('hidden');
    document.getElementById('unrepeat-field').classList.add('hidden');
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
  form.repeat_weekly.checked = false;
  document.getElementById('repeat-weeks-field').classList.add('hidden');
  document.getElementById('unrepeat-field').classList.toggle('hidden', !c.member_id);

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
