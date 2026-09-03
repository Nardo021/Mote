import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={label}>
      <Skeleton className="h-5 w-40" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
