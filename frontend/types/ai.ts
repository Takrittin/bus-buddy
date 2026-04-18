import { Location } from "@/types/bus";

export interface UserAssistantMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UserAssistantRequest {
  message: string;
  history?: UserAssistantMessage[];
  userLocation?: Location;
  selectedStopId?: string;
  selectedRouteIds?: string[];
}

export interface UserAssistantResponse {
  message: string;
  tool_calls?: string[];
  model?: string;
}
