import type { HTMLAttributes, Ref } from "react";

import { cn } from "@/lib/utils";

type MainProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
};

export function Main({ className, ...props }: MainProps) {
  return (
    <main
      id="main"
      className={cn("flex flex-1 flex-col gap-6 px-4 py-6 md:px-6", className)}
      {...props}
    />
  );
}
