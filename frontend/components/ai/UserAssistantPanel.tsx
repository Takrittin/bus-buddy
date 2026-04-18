"use client";

import React, { useMemo, useState } from "react";
import { Bot, MessageCircle, SendHorizonal, Sparkles, X } from "lucide-react";
import { askUserAssistant } from "@/services/ai";
import { Button } from "@/components/ui/Button";
import { Location, Stop } from "@/types/bus";
import { UserAssistantMessage } from "@/types/ai";

const SUGGESTIONS = [
  "ป้ายใกล้ฉันที่สุดคืออะไร",
  "สายไหนมาถึงเร็วสุดที่ป้ายนี้",
  "ถ้าจะไปบางกะปิควรรอสายไหนดี",
];

export function UserAssistantPanel({
  userLocation,
  selectedStop,
  selectedRouteIds,
}: {
  userLocation: Location | null;
  selectedStop: Stop | null;
  selectedRouteIds: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<UserAssistantMessage[]>([
    {
      role: "assistant",
      content:
        "ถามฉันได้เลยเรื่องป้ายรถเมล์ใกล้ตัว, ETA, หรือสายไหนควรขึ้นจากจุดที่คุณอยู่ตอนนี้",
    },
  ]);

  const conversationHistory = useMemo(
    () => messages.slice(-10),
    [messages],
  );

  async function submitMessage(messageText: string) {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    const nextUserMessage: UserAssistantMessage = {
      role: "user",
      content: trimmedMessage,
    };

    setMessages((currentMessages) => [...currentMessages, nextUserMessage]);
    setInputValue("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await askUserAssistant({
        message: trimmedMessage,
        history: conversationHistory,
        userLocation: userLocation ?? undefined,
        selectedStopId: selectedStop?.id,
        selectedRouteIds: selectedRouteIds.length > 0 ? selectedRouteIds : undefined,
      });

      setMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: response.message,
        },
      ]);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to reach the BusBuddy assistant right now.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <div className="fixed bottom-24 right-4 z-[55] md:bottom-8 md:left-[104px] md:right-auto">
        <Button
          variant="primary"
          onClick={() => setIsOpen((currentValue) => !currentValue)}
          className="rounded-full px-4 py-3 shadow-xl shadow-brand/20 md:px-5"
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Ask BusBuddy AI
        </Button>
      </div>

      {isOpen ? (
        <div className="fixed inset-x-4 bottom-[88px] z-[60] flex max-h-[calc(100vh-160px)] flex-col overflow-hidden rounded-3xl border border-orange-100 bg-white shadow-2xl md:inset-x-auto md:bottom-24 md:left-[104px] md:w-[380px] md:max-h-[min(720px,calc(100vh-128px))]">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 bg-gradient-to-r from-orange-50 to-white px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-brand p-2 text-white">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.14em] text-brand">
                  User Assistant
                </p>
                <p className="mt-1 text-sm text-gray-600">
                  Route, ETA, and nearby stop help from BusBuddy backend data only
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-full bg-gray-100 p-2 text-gray-500 transition-colors hover:bg-gray-200"
              aria-label="Close AI assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {selectedStop ? (
              <div className="rounded-2xl border border-orange-100 bg-orange-50 px-4 py-3 text-xs text-orange-900">
                Focus stop: <span className="font-semibold">{selectedStop.name}</span>
              </div>
            ) : null}

            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`max-w-[88%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                  message.role === "assistant"
                    ? "bg-gray-100 text-gray-800"
                    : "ml-auto bg-brand text-white"
                }`}
              >
                {message.content}
              </div>
            ))}

            {isLoading ? (
              <div className="max-w-[88%] rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-600">
                Thinking with live transit data...
              </div>
            ) : null}

            {error ? (
              <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}
          </div>

          <div className="border-t border-gray-100 px-4 py-4">
            <div className="mb-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => void submitMessage(suggestion)}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:border-orange-200 hover:bg-orange-50 hover:text-brand"
                >
                  <Sparkles className="mr-1 inline h-3 w-3" />
                  {suggestion}
                </button>
              ))}
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submitMessage(inputValue);
              }}
              className="flex items-end gap-2"
            >
              <textarea
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                placeholder="Ask about nearby stops, ETA, or which route to take..."
                rows={2}
                className="min-h-[52px] flex-1 resize-none rounded-2xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none transition-colors focus:border-brand"
              />
              <Button
                type="submit"
                variant="primary"
                size="icon"
                isLoading={isLoading}
                disabled={isLoading || inputValue.trim().length === 0}
                className="rounded-2xl"
              >
                <SendHorizonal className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
