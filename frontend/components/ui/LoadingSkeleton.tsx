import { cn } from "@/components/ui/Button";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-gray-200", className)} />
  );
}

export function StopCardSkeleton() {
  return (
    <div className="flex flex-col p-4 bg-white rounded-2xl shadow-sm border border-gray-100 gap-3">
      <div className="flex justify-between items-start border-b border-gray-100 pb-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-6 w-6 rounded-full" />
      </div>
      <div className="flex gap-2">
         <Skeleton className="h-8 w-16" />
         <Skeleton className="h-8 w-16" />
      </div>
    </div>
  );
}
