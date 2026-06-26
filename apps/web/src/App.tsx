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
      <Outlet />
    </div>
  );
}
