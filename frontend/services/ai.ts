import { fetchApi } from "@/lib/api-client";
import {
  FleetAssistantRequest,
  FleetAssistantResponse,
  UserAssistantRequest,
  UserAssistantResponse,
} from "@/types/ai";

export async function askUserAssistant(input: UserAssistantRequest) {
  return fetchApi<UserAssistantResponse>("/ai/user-assistant", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function askFleetAssistant(input: FleetAssistantRequest) {
  return fetchApi<FleetAssistantResponse>("/ai/fleet-assistant", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
