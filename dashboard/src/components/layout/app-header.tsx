import type { ReactNode } from "react";

import { LanguageSwitch } from "../language-switch.js";
import { PairingBanner } from "../pairing-banner.js";
import { ProfileDropdown } from "../profile-dropdown.js";
import { Search } from "../search.js";
import { ThemeSwitch } from "../theme-switch.js";
import { ConfigDrawer } from "../config-drawer.js";
import { Header } from "./header.js";

export function AppHeader({
  fixed,
  start,
}: {
  fixed?: boolean;
  start?: ReactNode;
}) {
  return (
    <>
      <Header {...(fixed !== undefined ? { fixed } : {})}>
        {start ?? <Search className="me-auto" />}
        <LanguageSwitch />
        <ThemeSwitch />
        <ConfigDrawer />
        <ProfileDropdown />
      </Header>
      <PairingBanner />
    </>
  );
}
