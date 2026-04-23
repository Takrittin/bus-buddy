import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FunctionDeclaration, GoogleGenAI } from '@google/genai';
import { FleetService } from '../fleet/fleet.service';
import { TransitStateService } from '../transit/transit-state.service';
import { FleetAssistantDto } from './dto/fleet-assistant.dto';
import { UserAssistantDto } from './dto/user-assistant.dto';

type ToolCallHandler = (args: Record<string, unknown>) => Promise<unknown>;
type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };
type AssistantToolSet = {
  declarations: FunctionDeclaration[];
  handlers: Record<string, ToolCallHandler>;
};
type AssistantResponsePayload = {
  message: string;
  tool_calls: string[];
  model: string;
  summary: string;
};

const USER_ASSISTANT_MODEL = process.env.GOOGLE_AI_MODEL ?? 'gemini-2.5-flash';
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_MESSAGE_CHARS = 240;
const MAX_TOOL_LOOPS = 3;
const SMALL_TALK_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|สวัสดี|หวัดดี|ขอบคุณ|โอเค|ครับ|ค่ะ|คับ|จ้า)[!.?\s]*$/i;

@Injectable()
export class AiService {
  private readonly ai: GoogleGenAI | null;

  constructor(
    private readonly transitState: TransitStateService,
    private readonly fleetService: FleetService,
  ) {
    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  async replyToUserAssistant(userAssistantDto: UserAssistantDto) {
    return this.replyWithTools({
      message: userAssistantDto.message,
      summary: userAssistantDto.summary,
      history: this.getTrimmedHistory(userAssistantDto.history),
      tools: this.getUserTools(),
      systemInstruction: this.buildUserSystemInstruction(userAssistantDto),
      userContext: this.buildUserContext(userAssistantDto),
      fallbackMessage:
        'I could not verify that from BusBuddy backend data yet. Try asking about nearby stops, route numbers, live buses, or ETA.',
    });
  }

  async replyToFleetAssistant(fleetAssistantDto: FleetAssistantDto) {
    return this.replyWithTools({
      message: fleetAssistantDto.message,
      summary: fleetAssistantDto.summary,
      history: this.getTrimmedHistory(fleetAssistantDto.history),
      tools: this.getFleetTools(),
      systemInstruction: this.buildFleetSystemInstruction(fleetAssistantDto),
      userContext: this.buildFleetContext(fleetAssistantDto),
      fallbackMessage:
        'I could not verify that from BusBuddy fleet data yet. Try asking about route health, active shifts, delayed buses, or fleet operations.',
    });
  }

  private async replyWithTools(input: {
    message: string;
    summary?: string;
    history: AssistantChatMessage[];
    tools: AssistantToolSet;
    systemInstruction: string;
    userContext: string;
    fallbackMessage: string;
  }): Promise<AssistantResponsePayload> {
    if (!this.ai) {
      throw new ServiceUnavailableException(
        'Google AI API key is missing. Add GOOGLE_AI_API_KEY to backend/.env first.',
      );
    }

    const contents = this.buildConversation(
      input.summary,
      input.history,
      input.userContext,
      input.message,
    );
    const toolCallsUsed: string[] = [];

    try {
      for (let loop = 0; loop < MAX_TOOL_LOOPS; loop += 1) {
        const response: any = await this.ai.models.generateContent({
          model: USER_ASSISTANT_MODEL,
          contents,
          config: {
            systemInstruction: input.systemInstruction,
            tools: [{ functionDeclarations: input.tools.declarations }],
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
          const message =
            toolCallsUsed.length === 0 && this.shouldAvoidUnverifiedAnswer(input.message)
              ? input.fallbackMessage
              : response.text?.trim() ||
                'I could not find a useful response from the available BusBuddy data just now.';

          return {
            message,
            tool_calls: toolCallsUsed,
            model: USER_ASSISTANT_MODEL,
            summary: this.buildRollingSummary(
              input.summary,
              input.message,
              message,
              toolCallsUsed,
            ),
          };
        }

        const functionResponseParts = [];

        for (const functionCall of functionCalls) {
          const toolName = functionCall.name;
          const handler = input.tools.handlers[toolName];

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
          const message =
            response.text?.trim() || 'I could not complete a tool lookup for that question.';

          return {
            message,
            tool_calls: toolCallsUsed,
            model: USER_ASSISTANT_MODEL,
            summary: this.buildRollingSummary(
              input.summary,
              input.message,
              message,
              toolCallsUsed,
            ),
          };
        }

        contents.push({
          role: 'user',
          parts: functionResponseParts,
        });
      }

      const message =
        'I reached the tool-call limit for this question. Please try asking in a shorter way.';

      return {
        message,
        tool_calls: toolCallsUsed,
        model: USER_ASSISTANT_MODEL,
        summary: this.buildRollingSummary(
          input.summary,
          input.message,
          message,
          toolCallsUsed,
        ),
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

  private buildConversation(
    summary: string | undefined,
    history: AssistantChatMessage[],
    userContext: string,
    message: string,
  ) {
    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    if (summary?.trim()) {
      contents.push({
        role: 'user',
        parts: [{ text: `Conversation summary: ${summary.trim().slice(0, 400)}` }],
      });
    }

    for (const historyMessage of history) {
      contents.push({
        role: historyMessage.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: historyMessage.content }],
      });
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: [userContext, `User question: ${message}`].filter(Boolean).join('\n\n'),
        },
      ],
    });

    return contents;
  }

  private buildUserSystemInstruction(userAssistantDto: UserAssistantDto) {
    return [
      'You are BusBuddy for Bangkok bus riders.',
      'Answer only from BusBuddy backend tool data.',
      'Do not use outside knowledge or guess missing transit facts.',
      'Use tools for any stop, route, live bus, or ETA question.',
      'Keep answers short, practical, and rider-friendly.',
      'Do not mention tool names in the final answer.',
      userAssistantDto.userLocation
        ? `Current location: ${userAssistantDto.userLocation.lat}, ${userAssistantDto.userLocation.lng}.`
        : 'Current location unavailable.',
    ].join(' ');
  }

  private buildFleetSystemInstruction(fleetAssistantDto: FleetAssistantDto) {
    return [
      'You are BusBuddy Fleet AI for Bangkok bus operations.',
      'Answer only from BusBuddy fleet and transit backend tool data.',
      'Do not use outside knowledge or guess missing operational facts.',
      'Use tools for route health, buses, drivers, shifts, and fleet issues.',
      'Keep answers concise, operational, and actionable.',
      'Prioritize delay, traffic, occupancy, and active shift context when relevant.',
      'Do not mention tool names in the final answer.',
      fleetAssistantDto.activeTab ? `Current fleet tab: ${fleetAssistantDto.activeTab}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildUserContext(userAssistantDto: UserAssistantDto) {
    const parts = [];

    if (userAssistantDto.userLocation) {
      parts.push(
        `Location ${userAssistantDto.userLocation.lat.toFixed(5)}, ${userAssistantDto.userLocation.lng.toFixed(5)}.`,
      );
    }

    if (userAssistantDto.selectedStopId) {
      parts.push(`Selected stop ${userAssistantDto.selectedStopId}.`);
    }

    if (userAssistantDto.selectedRouteIds?.length) {
      parts.push(
        `Selected routes ${userAssistantDto.selectedRouteIds.slice(0, 3).join(', ')}.`,
      );
    }

    return parts.join(' ');
  }

  private buildFleetContext(fleetAssistantDto: FleetAssistantDto) {
    const parts = [];

    if (fleetAssistantDto.selectedRouteId) {
      parts.push(`Selected route ${fleetAssistantDto.selectedRouteId}.`);
    }

    if (fleetAssistantDto.selectedBusId) {
      parts.push(`Selected bus ${fleetAssistantDto.selectedBusId}.`);
    }

    if (fleetAssistantDto.activeTab) {
      parts.push(`Current tab ${fleetAssistantDto.activeTab}.`);
    }

    return parts.join(' ');
  }

  private getTrimmedHistory(history: AssistantChatMessage[] | undefined) {
    return (history?.slice(-MAX_HISTORY_MESSAGES) ?? []).map((message) => ({
      role: message.role,
      content: message.content.replace(/\s+/g, ' ').trim().slice(0, MAX_HISTORY_MESSAGE_CHARS),
    }));
  }

  private buildRollingSummary(
    previousSummary: string | undefined,
    userMessage: string,
    assistantMessage: string,
    toolCallsUsed: string[],
  ) {
    return [
      previousSummary?.trim(),
      `Last user: ${userMessage.replace(/\s+/g, ' ').trim().slice(0, 110)}`,
      `Last reply: ${assistantMessage.replace(/\s+/g, ' ').trim().slice(0, 160)}`,
      toolCallsUsed.length > 0 ? `Tools used: ${toolCallsUsed.slice(-3).join(', ')}` : undefined,
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 420);
  }

  private shouldAvoidUnverifiedAnswer(message: string) {
    return !SMALL_TALK_PATTERN.test(message.trim());
  }

  private toCompactEtaPrediction(prediction: Record<string, unknown>) {
    return {
      route_id: prediction.route_id,
      route_number: prediction.route_number,
      bus_id: prediction.bus_id,
      license_plate: prediction.license_plate,
      direction: prediction.direction,
      minutes: prediction.minutes,
      traffic_level: prediction.traffic_level,
      occupancy_level: prediction.occupancy_level,
    };
  }

  private toCompactBus(bus: Record<string, unknown>) {
    return {
      bus_id: bus.bus_id,
      route_id: bus.route_id,
      route_number: bus.route_number,
      license_plate: bus.license_plate,
      direction: bus.direction,
      next_stop_name: bus.next_stop_name,
      eta_to_next_stop_minutes: bus.eta_to_next_stop_minutes,
      status: bus.status,
      traffic_level: bus.traffic_level,
      occupancy_level: bus.occupancy_level,
    };
  }

  private toCompactShift(shift: Record<string, unknown>) {
    return {
      shift_id: shift.id,
      driver_name: shift.driver_name,
      bus_vehicle_number: shift.bus_vehicle_number,
      route_number: shift.route_number,
      direction: shift.direction,
      status: shift.status,
      shift_start_at: shift.shift_start_at,
      shift_end_at: shift.shift_end_at,
    };
  }

  private getUserTools(): AssistantToolSet {
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
          'Get route details and a few active vehicles for a specific route id.',
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
        description: 'Get ETA predictions for buses arriving at a given stop id.',
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

        return stops.slice(0, 5).map((stop) => ({
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          distance_meters: stop.distance_meters,
          route_ids: stop.route_ids?.slice(0, 6),
          landmark: stop.landmark,
        }));
      },
      get_stop_details: async (args) => {
        const stop = this.transitState.getStop(String(args.stopId));
        return {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name,
          landmark: stop.landmark,
          route_assignments: (stop.route_assignments ?? []).slice(0, 6).map((assignment) => ({
            route_id: assignment.route_id,
            route_number: assignment.route_number,
            direction: assignment.direction,
            sequence: assignment.sequence,
          })),
          eta_predictions: (stop.eta_predictions ?? [])
            .slice(0, 4)
            .map((prediction) =>
              this.toCompactEtaPrediction(prediction as Record<string, unknown>),
            ),
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
          .slice(0, 5)
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
          average_headway_minutes: route.average_headway_minutes,
          active_vehicle_count: route.active_vehicles?.length ?? 0,
          active_vehicles: (route.active_vehicles ?? [])
            .slice(0, 4)
            .map((bus) => this.toCompactBus(bus as Record<string, unknown>)),
          current_status: route.current_status,
        };
      },
      get_live_buses: async (args) => {
        const routeId =
          typeof args.routeId === 'string' && args.routeId.trim().length > 0
            ? args.routeId.trim()
            : undefined;
        return this.transitState
          .getLiveBuses(routeId)
          .slice(0, 6)
          .map((bus) => this.toCompactBus(bus as Record<string, unknown>));
      },
      get_eta_for_stop: async (args) => {
        return this.transitState
          .getEtaPredictions(String(args.stopId))
          .slice(0, 5)
          .map((prediction) =>
            this.toCompactEtaPrediction(prediction as Record<string, unknown>),
          );
      },
    };

    return {
      declarations,
      handlers,
    };
  }

  private getFleetTools(): AssistantToolSet {
    const declarations: FunctionDeclaration[] = [
      {
        name: 'get_fleet_overview',
        description: 'Get high-level fleet KPIs such as active buses, delays, traffic, and average speed.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_route_health',
        description: 'Get route health summary, optionally filtered to one route.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            routeId: { type: 'string', description: 'Optional route id.' },
          },
        },
      },
      {
        name: 'get_fleet_buses',
        description: 'Get a compact list of live buses for fleet operations, optionally filtered to one route.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            routeId: { type: 'string', description: 'Optional route id.' },
          },
        },
      },
      {
        name: 'get_active_shifts',
        description: 'Get currently active driver shifts for fleet operations.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_bus_assignment',
        description: 'Get a bus master record with current route and driver assignment.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            busId: { type: 'string', description: 'Bus id.' },
          },
          required: ['busId'],
        },
      },
    ];

    const handlers: Record<string, ToolCallHandler> = {
      get_fleet_overview: async () => {
        const buses = this.transitState.getLiveBuses();
        const activeBuses = buses.filter((bus) => bus.status !== 'out_of_service');
        const delayedBuses = buses.filter((bus) => bus.status === 'delayed');
        const severeTrafficBuses = buses.filter((bus) => bus.traffic_level === 'severe');
        const fullBuses = buses.filter((bus) => bus.occupancy_level === 'full');
        const averageSpeed =
          activeBuses.length === 0
            ? 0
            : Math.round(
                activeBuses.reduce(
                  (total, bus) => total + Number(bus.speed_kmh ?? 0),
                  0,
                ) / activeBuses.length,
              );

        return {
          active_buses: activeBuses.length,
          delayed_buses: delayedBuses.length,
          severe_traffic_buses: severeTrafficBuses.length,
          full_buses: fullBuses.length,
          average_speed_kmh: averageSpeed,
          monitored_routes: new Set(buses.map((bus) => bus.route_id)).size,
        };
      },
      get_route_health: async (args) => {
        const routeId =
          typeof args.routeId === 'string' && args.routeId.trim().length > 0
            ? args.routeId.trim()
            : undefined;
        const routes = this.transitState.getRoutes();
        const liveBuses = this.transitState.getLiveBuses();

        return routes
          .filter((route) => !routeId || route.route_id === routeId)
          .map((route) => {
            const routeBuses = liveBuses.filter((bus) => bus.route_id === route.route_id);
            const statuses = Object.values(route.current_status ?? {}).filter(Boolean);
            return {
              route_id: route.route_id,
              route_number: route.route_number,
              route_name: route.route_name,
              live_buses: routeBuses.length,
              delayed_buses: routeBuses.filter((bus) => bus.status === 'delayed').length,
              average_speed_kmh:
                statuses.length === 0
                  ? 0
                  : Math.round(
                      statuses.reduce(
                        (total, status) => total + Number(status?.average_speed_kmh ?? 0),
                        0,
                      ) / statuses.length,
                    ),
              max_delay_minutes:
                statuses.length === 0
                  ? 0
                  : Math.max(
                      ...statuses.map((status) => Number(status?.average_delay_minutes ?? 0)),
                    ),
            };
          })
          .slice(0, 6);
      },
      get_fleet_buses: async (args) => {
        const routeId =
          typeof args.routeId === 'string' && args.routeId.trim().length > 0
            ? args.routeId.trim()
            : undefined;
        return this.transitState
          .getLiveBuses(routeId)
          .slice(0, 6)
          .map((bus) => this.toCompactBus(bus as Record<string, unknown>));
      },
      get_active_shifts: async () => {
        const shifts = await this.fleetService.getCurrentDriverShifts();
        return shifts
          .slice(0, 6)
          .map((shift) => this.toCompactShift(shift as Record<string, unknown>));
      },
      get_bus_assignment: async (args) => {
        const bus = await this.fleetService.getBus(String(args.busId));
        return {
          id: bus.id,
          vehicle_number: bus.vehicle_number,
          license_plate: bus.license_plate,
          route_id: bus.route_id,
          route_number: bus.route_number,
          driver_name: bus.driver_name,
          service_status: bus.service_status,
          depot_name: bus.depot_name,
        };
      },
    };

    return {
      declarations,
      handlers,
    };
  }
}
