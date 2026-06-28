import { Link, NavLink, Outlet } from "react-router-dom";

/** 앱 셸 — 상단 헤더 + 페이지 아웃렛 (임베드 뷰는 이 셸을 쓰지 않음). */
export function App() {
  return (
    <div className="app">
      <header className="appbar">
        <Link to="/" className="brand">
          <span className="brand-mark">₩</span> Notion Stock Widget
        </Link>
        <nav className="appnav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
            My Widgets
          </NavLink>
          <span className="nav-soon">My Dashboards</span>
        </nav>
        <span className="badge">fixture</span>
      </header>
      <div className="app-body">
        <Outlet />
      </div>
      <footer className="site-footer">
        <span>
          © 2026 <span className="footer-brand">NotionTalk</span>. All rights reserved.
        </span>
        <a
          href="https://open.kakao.com/o/gpSvPKGg"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="카카오톡 오픈채팅"
          title="카카오톡 오픈채팅"
          className="footer-kakao"
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="#3C1E1E" aria-hidden>
            <path d="M12 3.5C6.75 3.5 2.5 6.86 2.5 11c0 2.66 1.77 4.99 4.43 6.32-.18.64-.66 2.4-.76 2.77-.12.46.17.46.36.33.15-.1 2.35-1.59 3.31-2.24.55.08 1.1.12 1.66.12 5.25 0 9.5-3.36 9.5-7.5S17.25 3.5 12 3.5z" />
          </svg>
        </a>
      </footer>
    </div>
  );
}
