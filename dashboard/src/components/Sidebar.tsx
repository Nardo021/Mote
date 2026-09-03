import { NavLink } from "react-router-dom";

import { useAuth } from "../hooks/useAuth.js";
import {
  IconActivity,
  IconDevices,
  IconMenu,
  IconOverview,
  IconSettings,
  IconTokens,
  MoteMark,
} from "./Icons.js";

const LINKS = [
  { to: "/", label: "Overview", icon: <IconOverview />, end: true },
  { to: "/devices", label: "Devices", icon: <IconDevices /> },
  { to: "/tokens", label: "Tokens", icon: <IconTokens /> },
  { to: "/activity", label: "Activity", icon: <IconActivity /> },
  { to: "/settings", label: "Settings", icon: <IconSettings /> },
] as const;

type SidebarProps = {
  open: boolean;
  onToggle: () => void;
};

export function Sidebar({ open, onToggle }: SidebarProps) {
  const { user, signOut } = useAuth();

  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sidebar-brand">
        <MoteMark />
        <span>Mote</span>
        <button
          type="button"
          className="btn menu-toggle"
          onClick={onToggle}
          aria-expanded={open}
          aria-label="Menu"
        >
          <IconMenu />
        </button>
      </div>
      <nav className="sidebar-nav" aria-label="Dashboard">
        {LINKS.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={"end" in link ? link.end : false}
            className="sidebar-link"
            onClick={() => {
              if (open) {
                onToggle();
              }
            }}
          >
            {link.icon}
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-account">
        <div className="sidebar-account-label">Administrator</div>
        <div className="sidebar-account-name">{user?.username ?? "—"}</div>
        <button
          type="button"
          className="btn"
          style={{ width: "100%" }}
          onClick={() => void signOut()}
        >
          Sign Out
        </button>
      </div>
    </aside>
  );
}
