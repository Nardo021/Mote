import { useState } from "react";
import { Outlet } from "react-router-dom";

import { Sidebar } from "./Sidebar.js";

export function AppShell() {
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar open={open} onToggle={() => setOpen((value) => !value)} />
      <div className="content">
        <div className="content-inner" id="main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
