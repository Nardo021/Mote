import type { ReactNode } from "react";

import { MoteMark } from "../../components/Icons.js";
import { LanguageSwitch } from "../../components/language-switch.js";
import { ThemeSwitch } from "../../components/theme-switch.js";

export function AuthLayout({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="relative container grid h-svh max-w-none items-center justify-center">
      <div className="absolute top-4 right-4 flex gap-1">
        <LanguageSwitch />
        <ThemeSwitch />
      </div>
      <div className="mx-auto flex w-full flex-col justify-center gap-2 py-8 sm:p-8">
        <div className="mb-4 flex items-center justify-center gap-2">
          <MoteMark />
          <h1 className="text-xl font-medium">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
