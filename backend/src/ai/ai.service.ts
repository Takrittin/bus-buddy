import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FunctionDeclaration, GoogleGenAI } from '@google/genai';
import { TransitStateService } from '../transit/transit-state.service';
import { UserAssistantDto } from './dto/user-assistant.dto';

type ToolCallHandler = (args: Record<string, unknown>) => Promise<unknown>;

const USER_ASSISTANT_MODEL = process.env.GOOGLE_AI_MODEL ?? 'gemini-2.5-flash';
const MAX_HISTORY_MESSAGES = 10;
const MAX_TOOL_LOOPS = 4;
const SMALL_TALK_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|สวัสดี|หวัดดี|ขอบคุณ|โอเค|ครับ|ค่ะ|คับ|จ้า)[!.?\s]*$/i;

@Injectable()
export class AiService {
  private readonly ai: GoogleGenAI | null;

  constructor(private readonly transitState: TransitStateService) {
    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async replyToUserAssistant(userAssistantDto: UserAssistantDto) {
    if (!this.ai) {
      throw new ServiceUnavailableException(
        'Google AI API key is missing. Add GOOGLE_AI_API_KEY to backend/.env first.',
      );
    }

    const tools = this.getUserTools();
    const contents = this.buildConversation(userAssistantDto);
    const toolCallsUsed: string[] = [];

    try {
      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
        const response: any = await this.ai.models.generateContent({
          model: USER_ASSISTANT_MODEL,
          contents,
          config: {
            systemInstruction: this.buildSystemInstruction(userAssistantDto),
            tools: [{ functionDeclarations: tools.declarations }],
          },
        });

        const responseContent =
          response.candidates?.[0]?.content ??
          ({
            role: 'model',
            parts: response.text ? [{ text: response.text }] : [],
          } as const);

        if (responseContent.parts?.length) {
          contents.push(responseContent);
        }

        const functionCalls: Array<{
          name: string;
          args?: Record<string, unknown>;
        }> = response.functionCalls ?? [];

        if (functionCalls.length === 0) {
          if (toolCallsUsed.length === 0 && this.shouldAvoidUnverifiedAnswer(userAssistantDto.message)) {
            return {
              message:
                'I could not verify that from BusBuddy backend data yet. Try asking about nearby stops, route numbers, live buses, or ETA.',
              tool_calls: toolCallsUsed,
              model: USER_ASSISTANT_MODEL,
            };
          }

          return {
            message:
              response.text?.trim() ||
              'I could not find a useful response from the transit data just now.',
            tool_calls: toolCallsUsed,
            model: USER_ASSISTANT_MODEL,
          };
        }

        const functionResponseParts = [];

        for (const functionCall of functionCalls) {
          const toolName = functionCall.name;
          const handler = tools.handlers[toolName];

          if (!handler) {
            continue;
          }

          toolCallsUsed.push(toolName);

          try {
            const result = await handler((functionCall.args ?? {}) as Record<string, unknown>);
            functionResponseParts.push({
              functionResponse: {
                name: toolName,
                response: {
                  result,
                },
              },
            });
          } catch (error) {
            functionResponseParts.push({
              functionResponse: {
                name: toolName,
                response: {
                  error:
                    error instanceof Error
                      ? error.message
                      : 'Unexpected tool execution error.',
                },
              },
            });
          }
        }

        if (functionResponseParts.length === 0) {
          return {
            message:
              response.text?.trim() ||
              'I could not complete a tool lookup for that question.',
            tool_calls: toolCallsUsed,
            model: USER_ASSISTANT_MODEL,
          };
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      }

      return {
        message:
          'I reached the tool-call limit for this question. Please try asking in a shorter way.',
        tool_calls: toolCallsUsed,
        model: USER_ASSISTANT_MODEL,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('is not found for API version')) {
        throw new ServiceUnavailableException(
          `Configured Google AI model "${USER_ASSISTANT_MODEL}" is not available for generateContent. Try GOOGLE_AI_MODEL="gemini-2.5-flash" or "gemini-2.5-flash-lite".`,
        );
      }

      throw new InternalServerErrorException(
        error instanceof Error ? error.message : 'Failed to contact Google AI Studio.',
      );
    }
  }

  private buildConversation(userAssistantDto: UserAssistantDto) {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    for (const message of userAssistantDto.history?.slice(-MAX_HISTORY_MESSAGES) ?? []) {
      contents.push({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: [
            this.buildUserContext(userAssistantDto),
            `User question: ${userAssistantDto.message}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });

    return contents;
  }

  private buildSystemInstruction(userAssistantDto: UserAssistantDto) {
    return [
      'You are BusBuddy, a helpful Bangkok bus assistant for riders.',
      'Use only BusBuddy backend data returned by the provided transit tools for any factual transit answer.',
      'Do not use outside knowledge, web knowledge, or general Bangkok transit knowledge in final answers.',
      'If the backend tools do not provide enough data, say that the data is unavailable instead of guessing.',
      'Use the provided transit tools whenever the answer depends on live buses, ETA, stops, routes, or nearby locations.',
      'Be concise, practical, and rider-friendly. Prefer bullet-like short guidance inside prose only when it helps.',
      'Never invent routes, ETAs, or stop names. If data is missing, say so clearly.',
      'If the user asks for travel advice, suggest the best nearby stop or route based on the available live data.',
      'If the user has a selected stop or nearby location in context, prefer that context before asking for clarification.',
      'Do not mention internal tool names in the final answer.',
      userAssistantDto.userLocation
        ? `Current user location is approximately lat ${userAssistantDto.userLocation.lat}, lng ${userAssistantDto.userLocation.lng}.`
        : 'Current user location is unavailable unless the tools return it from context.',
    ].join(' ');
  }

  private buildUserContext(userAssistantDto: UserAssistantDto) {
    const parts = [];

    if (userAssistantDto.userLocation) {
      parts.push(
        `User location: lat ${userAssistantDto.userLocation.lat.toFixed(5)}, lng ${userAssistantDto.userLocation.lng.toFixed(5)}.`,
      );
    }

    if (userAssistantDto.selectedStopId) {
      parts.push(`Currently selected stop id: ${userAssistantDto.selectedStopId}.`);
    }

    if ((userAssistantDto.selectedRouteIds?.length ?? 0) > 0) {
      parts.push(
        `Routes currently highlighted in the app: ${userAssistantDto.selectedRouteIds?.join(', ')}.`,
      );
    }

    return parts.join(' ');
  }

  private shouldAvoidUnverifiedAnswer(message: string) {
    return !SMALL_TALK_PATTERN.test(message.trim());
  }

  private getUserTools(): {
    declarations: FunctionDeclaration[];
    handlers: Record<string, ToolCallHandler>;
  } {
    const declarations: FunctionDeclaration[] = [
      {
        name: 'get_nearby_stops',
        description:
          'Find the nearest bus stops around a rider location in Bangkok, including distance and route ids.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            lat: { type: 'number', description: 'Latitude of the rider location.' },
            lng: { type: 'number', description: 'Longitude of the rider location.' },
            radius: {
              type: 'number',
              description: 'Optional search radius in meters. Default 1200.',
            },
          },
          required: ['lat', 'lng'],
        },
      },
      {
        name: 'get_stop_details',
        description:
          'Get one bus stop with route assignments and ETA predictions for buses arriving there.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            stopId: { type: 'string', description: 'Bus stop id, e.g. stop_siam.' },
          },
          required: ['stopId'],
        },
      },
      {
        name: 'search_routes',
        description:
          'Search routes by route number, route name, origin, or destination. Useful when users mention a bus line or place name.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search text such as 29, Siam, or Bang Kapi.' },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_route_details',
        description:
          'Get full route details, directions, and current active vehicles for a specific route id.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            routeId: { type: 'string', description: 'Route id such as route_29.' },
          },
          required: ['routeId'],
        },
      },
      {
        name: 'get_live_buses',
        description:
          'Get live bus positions and status, optionally filtered to one route.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            routeId: {
              type: 'string',
              description: 'Optional route id to filter live buses.',
            },
          },
        },
      },
      {
        name: 'get_eta_for_stop',
        description: 'Get ETA predictions for all buses arriving at a given stop id.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            stopId: { type: 'string', description: 'Bus stop id.' },
          },
          required: ['stopId'],
        },
      },
    ];

    const handlers: Record<string, ToolCallHandler> = {
      get_nearby_stops: async (args) => {
        const lat = Number(args.lat);
        const lng = Number(args.lng);
        const radius = args.radius ? Number(args.radius) : 1200;
        const stops = this.transitState.getNearbyStops(lat, lng, radius);

        return stops.slice(0, 8).map((stop) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          distance_meters: stop.distance_meters,
          route_ids: stop.route_ids,
          landmark: stop.landmark,
          area_description: stop.area_description,
        }));
      },
      get_stop_details: async (args) => {
        const stop = this.transitState.getStop(String(args.stopId));
        return {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          route_ids: stop.route_ids,
          landmark: stop.landmark,
          area_description: stop.area_description,
          eta_predictions: (stop.eta_predictions ?? []).slice(0, 6),
        };
      },
      search_routes: async (args) => {
        const query = String(args.query ?? '').trim().toLowerCase();
        return this.transitState
          .getRoutes()
          .filter((route) =>
            [
              route.route_id,
              route.route_number,
              route.route_name,
              route.origin,
              route.destination,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(query),
          )
          .slice(0, 6)
          .map((route) => ({
            route_id: route.route_id,
            route_number: route.route_number,
            route_name: route.route_name,
            origin: route.origin,
            destination: route.destination,
          }));
      },
      get_route_details: async (args) => {
        const route = this.transitState.getRoute(String(args.routeId));
        return {
          route_id: route.route_id,
          route_number: route.route_number,
          route_name: route.route_name,
          origin: route.origin,
          destination: route.destination,
          outbound_direction: route.outbound_direction,
          inbound_direction: route.inbound_direction,
          active_vehicles: (route.active_vehicles ?? []).slice(0, 8),
          current_status: route.current_status,
        };
      },
      get_live_buses: async (args) => {
        const routeId =
          typeof args.routeId === 'string' && args.routeId.trim().length > 0
            ? args.routeId.trim()
            : undefined;
        return this.transitState.getLiveBuses(routeId).slice(0, 10);
      },
      get_eta_for_stop: async (args) => {
        return this.transitState
          .getEtaPredictions(String(args.stopId))
          .slice(0, 8);
      },
    };

    return {
      declarations,
      handlers,
    };
  }
}
