import React from "react";
import { cn } from "@/components/ui/Button";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      {icon && <div className="mb-4 text-gray-400">{icon}</div>}
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      {description && <p className="mb-6 text-sm text-gray-500 max-w-sm">{description}</p>}
      {action && <div>{action}</div>}
    </div>
  );
}
