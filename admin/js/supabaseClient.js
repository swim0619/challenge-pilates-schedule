// Supabase 프로젝트 연결 설정
const SUPABASE_URL = 'https://dkvuynotuwejwpltdxyc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRrdnV5bm90dXdlandwbHRkeHljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY4NjI2MTksImV4cCI6MjEwMjQzODYxOX0.r6FoKdh-DdFrcgyrjUuaYGCh8qy2H3kSfLqD0sG3Oj0';

let sb;

if (!SUPABASE_URL.startsWith('https://') || SUPABASE_ANON_KEY === 'YOUR_SUPABASE_ANON_KEY') {
  document.addEventListener('DOMContentLoaded', () => {
    document.body.innerHTML =
      '<div style="max-width:480px;margin:80px auto;padding:24px;font-family:sans-serif;line-height:1.6">' +
      '<h2>Supabase 연결 설정이 필요합니다</h2>' +
      '<p>admin/js/supabaseClient.js 파일의 SUPABASE_URL, SUPABASE_ANON_KEY 값을 ' +
      'Supabase 프로젝트의 Project Settings &gt; API 정보로 채워주세요.</p>' +
      '</div>';
  });
} else {
  const authStorage = localStorage.getItem('remember_me') === 'false' ? sessionStorage : localStorage;
  sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: authStorage } });
  window.sb = sb;
}
