import { Location } from "@/types/bus";

export interface UserAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UserAssistantRequest {
  message: string;
  locale?: "en" | "th";
  summary?: string;
  history?: UserAssistantMessage[];
  userLocation?: Location;
  selectedStopId?: string;
  selectedRouteIds?: string[];
}

export interface FleetAssistantRequest {
  message: string;
  locale?: "en" | "th";
  summary?: string;
  history?: UserAssistantMessage[];
  selectedRouteId?: string;
  selectedBusId?: string;
  activeTab?: "overview" | "alerts" | "vehicles" | "shifts";
}

export interface AdminAssistantRequest {
  message: string;
  locale?: "en" | "th";
  summary?: string;
  history?: UserAssistantMessage[];
  activeSection?: string;
}

export interface UserAssistantResponse {
  message: string;
  summary?: string;
  tool_calls?: string[];
  model?: string;
}

export interface FleetAssistantResponse extends UserAssistantResponse {}

export interface AdminAssistantResponse extends UserAssistantResponse {}
