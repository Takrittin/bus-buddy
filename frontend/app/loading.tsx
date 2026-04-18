import { Skeleton } from "@/components/ui/LoadingSkeleton";

export default function Loading() {
  return (
    <div className="flex flex-col h-screen bg-gray-50 p-4 space-y-4">
      <Skeleton className="h-16 w-full rounded-2xl" />
      <div className="flex-1 relative">
         <Skeleton className="absolute inset-0 rounded-3xl" />
      </div>
      <div className="h-[40%] space-y-3">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );
}
