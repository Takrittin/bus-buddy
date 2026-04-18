import { fetchApi } from "@/lib/api-client";
import { UserAssistantRequest, UserAssistantResponse } from "@/types/ai";

export async function askUserAssistant(input: UserAssistantRequest) {
  return fetchApi<UserAssistantResponse>("/ai/user-assistant", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
