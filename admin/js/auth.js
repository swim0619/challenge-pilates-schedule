// 공통: 로그인 세션 체크 + role 조회 + 사이드바 표시/가드
// 각 페이지(login.html 제외)는 supabaseClient.js 다음에 이 파일을 로드하고
// DOMContentLoaded 시 guardPage({ ownerOnly }) 를 호출해서 사용한다.

async function guardPage({ ownerOnly = false } = {}) {
  if (!window.sb) return null; // supabaseClient.js가 설정 안내 화면으로 대체함

  const { data: { session } } = await sb.auth.getSession();

  if (!session) {
    location.href = 'login.html';
    return null;
  }

  const { data: profile, error } = await sb
    .from('profiles')
    .select('role, name, phone')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    alert('프로필 정보를 찾을 수 없습니다. 원장님께 계정 등록을 요청해주세요.');
    await sb.auth.signOut();
    location.href = 'login.html';
    return null;
  }

  document.body.classList.add(profile.role === 'owner' ? 'role-owner' : 'role-instructor');

  const whoEl = document.querySelector('[data-who]');
  if (whoEl) whoEl.textContent = profile.name;

  const roleEl = document.querySelector('[data-role-badge]');
  if (roleEl) roleEl.textContent = profile.role === 'owner' ? '원장' : '강사';

  if (ownerOnly && profile.role !== 'owner') {
    alert('원장 전용 페이지입니다.');
    location.href = 'index.html';
    return null;
  }

  const logoutBtn = document.querySelector('[data-logout]');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await sb.auth.signOut();
      location.href = 'login.html';
    });
  }

  highlightActiveNav();

  return { session, profile };
}

function highlightActiveNav() {
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.admin-nav a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === current);
  });
}

// ===== 공통 포맷 유틸 =====
const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function formatCurrency(amount) {
  return Number(amount).toLocaleString('ko-KR') + '원';
}

function formatTime(t) {
  // "09:00:00" -> "09:00"
  return (t || '').slice(0, 5);
}

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function remainingBadgeClass(remaining) {
  if (remaining <= 0) return 'badge-danger';
  if (remaining <= 2) return 'badge-warning';
  return 'badge-success';
}

// 숫자 입력칸에 포커스된 채로 스크롤하면 브라우저가 값을 증감시켜버리는 것을 방지
document.addEventListener('wheel', () => {
  const el = document.activeElement;
  if (el && el.tagName === 'INPUT' && el.type === 'number') {
    el.blur();
  }
}, { passive: true });

// inputmode="numeric" 입력칸은 숫자 이외 문자를 입력 즉시 제거
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.tagName === 'INPUT' && el.getAttribute('inputmode') === 'numeric') {
    const cleaned = el.value.replace(/[^0-9]/g, '');
    if (cleaned !== el.value) el.value = cleaned;
  }
});
