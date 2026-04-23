import { Location } from "@/types/bus";

export interface UserAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UserAssistantRequest {
  message: string;
  summary?: string;
  history?: UserAssistantMessage[];
  userLocation?: Location;
  selectedStopId?: string;
  selectedRouteIds?: string[];
}

export interface FleetAssistantRequest {
  message: string;
  summary?: string;
  history?: UserAssistantMessage[];
  selectedRouteId?: string;
  selectedBusId?: string;
  activeTab?: "overview" | "alerts" | "vehicles" | "shifts";
}

export interface UserAssistantResponse {
  message: string;
  summary?: string;
  tool_calls?: string[];
  model?: string;
}

export interface FleetAssistantResponse extends UserAssistantResponse {}
