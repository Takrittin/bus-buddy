"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { AlertCircle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
      <EmptyState 
        icon={<AlertCircle className="h-12 w-12 mx-auto text-red-500" />}
        title="Something went wrong!"
        description={error.message || "We encountered an unexpected error."}
        action={
          <Button onClick={() => reset()} variant="primary" className="mt-4">
            Try again
          </Button>
        }
      />
    </div>
  );
}
