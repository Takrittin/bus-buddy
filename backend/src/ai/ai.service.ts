import {
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { FunctionDeclaration, GoogleGenAI } from '@google/genai';
import { requireAdminActor } from '../common/request-actor';
import { FleetService } from '../fleet/fleet.service';
import { InsightsService } from '../insights/insights.service';
import { PrismaService } from '../prisma/prisma.service';
import { SimulationGateway } from '../simulation/simulation.gateway';
import { TransitPersistenceService } from '../transit/transit-persistence.service';
import { TransitStateService } from '../transit/transit-state.service';
import { AdminAssistantDto } from './dto/admin-assistant.dto';
import { FleetAssistantDto } from './dto/fleet-assistant.dto';
import { UserAssistantDto } from './dto/user-assistant.dto';

type ToolCallHandler = (args: Record<string, unknown>) => Promise<unknown>;
type AssistantChatMessage = { role: 'user' | 'assistant'; content: string };
type AssistantToolSet = {
  declarations: FunctionDeclaration[];
  handlers: Record<string, ToolCallHandler>;
};
type AssistantVerifiedToolResult = {
  name: string;
  result: unknown;
};
type AssistantResponsePayload = {
  message: string;
  tool_calls: string[];
  model: string;
  summary: string;
};
type UserAssistantIntent =
  | 'nearby'
  | 'stop'
  | 'route'
  | 'trip_planner'
  | 'live_buses'
  | 'eta'
  | 'general';
type FleetAssistantIntent = 'overview' | 'route_health' | 'buses' | 'shifts' | 'assignment' | 'general';
type AdminAssistantIntent = 'users' | 'health' | 'audit' | 'general';
type AutoToolCall = { name: string; args: Record<string, unknown> };

const USER_ASSISTANT_MODEL = process.env.GOOGLE_AI_MODEL ?? 'gemini-2.5-flash';
const MAX_HISTORY_MESSAGES = 4;
const MAX_HISTORY_MESSAGE_CHARS = 240;
const MAX_TOOL_LOOPS = 3;
const MAX_VERIFIED_TOOL_RESULT_CHARS = 1600;
const SMALL_TALK_PATTERN =
  /^(hi|hello|hey|thanks|thank you|ok|okay|สวัสดี|หวัดดี|ขอบคุณ|โอเค|ครับ|ค่ะ|คับ|จ้า)[!.?\s]*$/i;
const USER_TRIP_QUESTION_PATTERN =
  /(how\s*(do|can)\s*i\s*get|directions?|go\s*to|travel\s*to|ไป.*(ยังไง|อย่างไร|ทางไหน|ได้ไหม|ได้มั้ย)|ไปที่|อยากไป|เดินทางไป|จาก.+ไป)/i;
const THAI_STOP_ALIASES: Record<string, string[]> = {
  stop_bang_kapi: ['บางกะปิ', 'เดอะมอลล์บางกะปิ', 'มอลล์บางกะปิ'],
  stop_siam: ['สยาม', 'siam paragon', 'พารากอน'],
  stop_victory_monument: ['อนุสาวรีย์ชัย', 'อนุสาวรีย์ชัยสมรภูมิ'],
  stop_mochit_bus_terminal: ['หมอชิต', 'ขนส่งหมอชิต'],
  stop_chatuchak_park: ['จตุจักร', 'สวนจตุจักร', 'mrt จตุจักร'],
  stop_hua_lamphong: ['หัวลำโพง'],
  stop_ratchathewi: ['ราชเทวี'],
  stop_pratunam: ['ประตูน้ำ'],
  stop_on_nut: ['อ่อนนุช'],
  stop_ekkamai: ['เอกมัย'],
  stop_lat_phrao: ['ลาดพร้าว'],
  stop_wongwian_yai: ['วงเวียนใหญ่'],
  stop_bang_na: ['บางนา'],
  stop_pak_nam: ['ปากน้ำ'],
  stop_don_mueang_airport: ['ดอนเมือง', 'สนามบินดอนเมือง'],
  stop_suvarnabhumi_airport: ['สุวรรณภูมิ', 'สนามบินสุวรรณภูมิ'],
  stop_thammasat_rangsit: ['ธรรมศาสตร์รังสิต', 'มธ รังสิต'],
  stop_rangsit_market: ['รังสิต', 'ตลาดรังสิต'],
  stop_fashion_island: ['แฟชั่นไอส์แลนด์'],
  stop_minburi_market: ['มีนบุรี', 'ตลาดมีนบุรี'],
};

@Injectable()
export class AiService {
  private readonly ai: GoogleGenAI | null;

  constructor(
    private readonly transitState: TransitStateService,
    private readonly fleetService: FleetService,
    private readonly insightsService: InsightsService,
    private readonly prisma: PrismaService,
    private readonly transitPersistence: TransitPersistenceService,
    private readonly simulationGateway: SimulationGateway,
  ) {
    const apiKey = process.env.GOOGLE_AI_API_KEY?.trim();
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
  }

  getHealthStatus() {
    return {
      status: this.ai ? 'online' : 'degraded',
      model: USER_ASSISTANT_MODEL,
      configured: Boolean(this.ai),
      checked_at: new Date().toISOString(),
    };
  }

  async replyToUserAssistant(userAssistantDto: UserAssistantDto) {
    const deterministicTripReply = this.tryReplyWithBackendTripPlanner(userAssistantDto);

    if (deterministicTripReply) {
      return deterministicTripReply;
    }

    const baseTools = this.getUserTools();
    const intent = this.routeUserIntent(userAssistantDto);
    const tools = this.pickTools(
      baseTools,
      this.getUserToolNamesForIntent(intent, userAssistantDto),
    );
    const verifiedToolResults = await this.runVerifiedToolCalls(
      baseTools,
      this.getUserAutoToolCalls(intent, userAssistantDto),
    );

    return this.replyWithTools({
      message: userAssistantDto.message,
      summary: userAssistantDto.summary,
      history: this.getTrimmedHistory(userAssistantDto.history),
      tools,
      verifiedToolResults,
      systemInstruction: this.buildUserSystemInstruction(userAssistantDto),
      userContext: this.buildUserContext(userAssistantDto),
      fallbackMessage: this.getFallbackMessage(userAssistantDto.locale, 'user'),
    });
  }

  async replyToFleetAssistant(fleetAssistantDto: FleetAssistantDto) {
    const baseTools = this.getFleetTools();
    const intent = this.routeFleetIntent(fleetAssistantDto);
    const tools = this.pickTools(
      baseTools,
      this.getFleetToolNamesForIntent(intent, fleetAssistantDto),
    );
    const verifiedToolResults = await this.runVerifiedToolCalls(
      baseTools,
      this.getFleetAutoToolCalls(intent, fleetAssistantDto),
    );

    return this.replyWithTools({
      message: fleetAssistantDto.message,
      summary: fleetAssistantDto.summary,
      history: this.getTrimmedHistory(fleetAssistantDto.history),
      tools,
      verifiedToolResults,
      systemInstruction: this.buildFleetSystemInstruction(fleetAssistantDto),
      userContext: this.buildFleetContext(fleetAssistantDto),
      fallbackMessage: this.getFallbackMessage(fleetAssistantDto.locale, 'fleet'),
    });
  }

  async replyToAdminAssistant(
    adminAssistantDto: AdminAssistantDto,
    actorUserId?: string | null,
    actorSessionVersion?: string | null,
  ) {
    const actor = await requireAdminActor(this.prisma, actorUserId, actorSessionVersion);
    const baseTools = this.getAdminTools();
    const intent = this.routeAdminIntent(adminAssistantDto);
    const tools = this.pickTools(baseTools, this.getAdminToolNamesForIntent(intent));
    const verifiedToolResults = await this.runVerifiedToolCalls(
      baseTools,
      this.getAdminAutoToolCalls(intent),
    );

    return this.replyWithTools({
      message: adminAssistantDto.message,
      summary: adminAssistantDto.summary,
      history: this.getTrimmedHistory(adminAssistantDto.history),
      tools,
      verifiedToolResults,
      systemInstruction: this.buildAdminSystemInstruction(adminAssistantDto),
      userContext: this.buildAdminContext(adminAssistantDto, actor.email),
      fallbackMessage: this.getFallbackMessage(adminAssistantDto.locale, 'admin'),
    });
  }

  private async replyWithTools(input: {
    message: string;
    summary?: string;
    history: AssistantChatMessage[];
    tools: AssistantToolSet;
    verifiedToolResults?: AssistantVerifiedToolResult[];
    systemInstruction: string;
    userContext: string;
    fallbackMessage: string;
  }): Promise<AssistantResponsePayload> {
    if (!this.ai) {
      throw new ServiceUnavailableException(
        'Google AI API key is missing. Add GOOGLE_AI_API_KEY to backend/.env first.',
      );
    }

    const verifiedToolContext = this.buildVerifiedToolContext(input.verifiedToolResults);
    const contents = this.buildConversation(
      input.summary,
      input.history,
      [input.userContext, verifiedToolContext].filter(Boolean).join('\n\n'),
      input.message,
    );
    const toolCallsUsed: string[] = input.verifiedToolResults?.map((tool) => tool.name) ?? [];

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
      'BusBuddy rider AI.',
      this.getLanguageInstruction(userAssistantDto.locale),
      'Use only verified BusBuddy backend data. If data is missing, say what is missing.',
      'For transit facts, use the provided tool data or call one provided tool.',
      'No outside knowledge. Do not mention tool names.',
      userAssistantDto.userLocation
        ? `Current location: ${userAssistantDto.userLocation.lat}, ${userAssistantDto.userLocation.lng}.`
        : 'Current location unavailable.',
    ].join(' ');
  }

  private buildFleetSystemInstruction(fleetAssistantDto: FleetAssistantDto) {
    return [
      'BusBuddy fleet AI.',
      this.getLanguageInstruction(fleetAssistantDto.locale),
      'Use only verified fleet/backend data. If data is missing, say what is missing.',
      'Prioritize delay, traffic, occupancy, buses, drivers, and shifts when present.',
      'No outside knowledge. Do not mention tool names.',
      fleetAssistantDto.activeTab ? `Current fleet tab: ${fleetAssistantDto.activeTab}.` : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private buildAdminSystemInstruction(adminAssistantDto: AdminAssistantDto) {
    return [
      'BusBuddy admin AI.',
      this.getLanguageInstruction(adminAssistantDto.locale),
      'Use only verified admin/backend data. If data is missing, say what is missing.',
      'Focus on users, system health, audit logs, and safe admin actions.',
      'No outside knowledge. Do not mention tool names.',
      adminAssistantDto.activeSection
        ? `Current admin section: ${adminAssistantDto.activeSection}.`
        : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private getLanguageInstruction(locale?: 'en' | 'th') {
    return locale === 'th'
      ? 'ตอบไทยแบบกระชับ ไม่เกิน 3 bullet หรือ 4 ประโยค ใช้ข้อมูลจาก tools เท่านั้น.'
      : 'Reply in concise English, max 3 bullets or 4 sentences, using tool data only.';
  }

  private pickTools(toolSet: AssistantToolSet, allowedNames: string[]): AssistantToolSet {
    const allowed = new Set(allowedNames);

    return {
      declarations: toolSet.declarations.filter((declaration) =>
        declaration.name ? allowed.has(declaration.name) : false,
      ),
      handlers: Object.fromEntries(
        Object.entries(toolSet.handlers).filter(([name]) => allowed.has(name)),
      ),
    };
  }

  private async runVerifiedToolCalls(toolSet: AssistantToolSet, calls: AutoToolCall[]) {
    const results: AssistantVerifiedToolResult[] = [];

    for (const call of calls) {
      const handler = toolSet.handlers[call.name];

      if (!handler) {
        continue;
      }

      try {
        results.push({
          name: call.name,
          result: await handler(call.args),
        });
      } catch (error) {
        results.push({
          name: call.name,
          result: {
            error:
              error instanceof Error ? error.message : 'Verified backend lookup failed.',
          },
        });
      }
    }

    return results;
  }

  private buildVerifiedToolContext(results: AssistantVerifiedToolResult[] | undefined) {
    if (!results?.length) {
      return '';
    }

    return [
      'Verified backend tool data. Answer from this data only unless you call another provided tool:',
      ...results.map((result) => `${result.name}: ${this.stringifyCompact(result.result)}`),
    ].join('\n');
  }

  private stringifyCompact(value: unknown) {
    return JSON.stringify(value)?.slice(0, MAX_VERIFIED_TOOL_RESULT_CHARS) ?? '';
  }

  private intentText(...values: Array<string | undefined>) {
    return values
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private routeUserIntent(userAssistantDto: UserAssistantDto): UserAssistantIntent {
    const text = this.intentText(userAssistantDto.message, userAssistantDto.summary);

    if (USER_TRIP_QUESTION_PATTERN.test(text)) {
      return 'trip_planner';
    }

    if (/(eta|arriv|arrival|กี่นาที|อีกกี่|ถึงเมื่อ|รถมา|รอรถ)/i.test(text)) {
      return 'eta';
    }

    if (/(near|nearby|closest|around|ใกล้|ใกล้สุด|ป้ายใกล้|สถานีใกล้)/i.test(text)) {
      return 'nearby';
    }

    if (/(route|line|สาย|เส้นทาง|ไปยัง|จาก|ปลายทาง|ต้นทาง)/i.test(text)) {
      return 'route';
    }

    if (/(bus|vehicle|live|position|อยู่ไหน|ตำแหน่ง|รถสด|รถบัส)/i.test(text)) {
      return 'live_buses';
    }

    if (userAssistantDto.selectedStopId) {
      return 'stop';
    }

    if (userAssistantDto.userLocation) {
      return 'nearby';
    }

    return 'general';
  }

  private getUserToolNamesForIntent(
    intent: UserAssistantIntent,
    userAssistantDto: UserAssistantDto,
  ) {
    const routeScopedTools = userAssistantDto.selectedRouteIds?.length
      ? ['get_route_details', 'get_live_buses']
      : ['search_routes'];

    const toolsByIntent: Record<UserAssistantIntent, string[]> = {
      nearby: ['get_nearby_stops'],
      stop: ['get_stop_details', 'get_eta_for_stop'],
      trip_planner: userAssistantDto.userLocation
        ? ['get_nearby_stops', 'search_routes']
        : ['search_routes'],
      route: [...routeScopedTools, 'get_live_buses'],
      live_buses: ['get_live_buses', 'get_route_details'],
      eta: userAssistantDto.selectedStopId
        ? ['get_eta_for_stop', 'get_stop_details']
        : ['get_eta_for_nearest_stop', 'get_nearby_stops'],
      general: userAssistantDto.userLocation
        ? ['get_nearby_stops', 'search_routes']
        : ['search_routes'],
    };

    return toolsByIntent[intent];
  }

  private getUserAutoToolCalls(
    intent: UserAssistantIntent,
    userAssistantDto: UserAssistantDto,
  ): AutoToolCall[] {
    const calls: AutoToolCall[] = [];
    const selectedRouteId = userAssistantDto.selectedRouteIds?.[0];
    const routeQuery = this.extractRouteQuery(userAssistantDto.message);

    if (intent === 'nearby' && userAssistantDto.userLocation) {
      calls.push({
        name: 'get_nearby_stops',
        args: { ...userAssistantDto.userLocation, radius: 1200 },
      });
    }

    if ((intent === 'stop' || intent === 'eta') && userAssistantDto.selectedStopId) {
      calls.push({
        name: intent === 'eta' ? 'get_eta_for_stop' : 'get_stop_details',
        args: { stopId: userAssistantDto.selectedStopId },
      });
    }

    if (intent === 'eta' && !userAssistantDto.selectedStopId && userAssistantDto.userLocation) {
      calls.push({
        name: 'get_eta_for_nearest_stop',
        args: { ...userAssistantDto.userLocation, radius: 2500 },
      });
    }

    if (intent === 'route') {
      if (selectedRouteId) {
        calls.push({ name: 'get_route_details', args: { routeId: selectedRouteId } });
      } else if (routeQuery) {
        calls.push({ name: 'search_routes', args: { query: routeQuery } });
      }
    }

    if (intent === 'trip_planner' && userAssistantDto.userLocation) {
      calls.push({
        name: 'get_nearby_stops',
        args: { ...userAssistantDto.userLocation, radius: 1200 },
      });
    }

    if (intent === 'live_buses') {
      calls.push({
        name: 'get_live_buses',
        args: selectedRouteId ? { routeId: selectedRouteId } : {},
      });
    }

    if (intent === 'general' && userAssistantDto.userLocation) {
      calls.push({
        name: 'get_nearby_stops',
        args: { ...userAssistantDto.userLocation, radius: 800 },
      });
    }

    return calls.slice(0, 2);
  }

  private routeFleetIntent(fleetAssistantDto: FleetAssistantDto): FleetAssistantIntent {
    const text = this.intentText(fleetAssistantDto.message, fleetAssistantDto.summary);

    if (
      fleetAssistantDto.selectedBusId ||
      /(assignment|driver|license|plate|คนขับ|ทะเบียน)/i.test(text)
    ) {
      return 'assignment';
    }

    if (
      fleetAssistantDto.activeTab === 'shifts' ||
      /(shift|schedule|เวร|กะ|ตาราง)/i.test(text)
    ) {
      return 'shifts';
    }

    if (
      fleetAssistantDto.selectedRouteId ||
      /(route|health|delay|traffic|สาย|ล่าช้า|รถติด)/i.test(text)
    ) {
      return 'route_health';
    }

    if (
      fleetAssistantDto.activeTab === 'vehicles' ||
      /(bus|vehicle|fleet|รถ|คัน)/i.test(text)
    ) {
      return 'buses';
    }

    if (fleetAssistantDto.activeTab === 'overview') {
      return 'overview';
    }

    return 'general';
  }

  private getFleetToolNamesForIntent(
    intent: FleetAssistantIntent,
    fleetAssistantDto: FleetAssistantDto,
  ) {
    const toolsByIntent: Record<FleetAssistantIntent, string[]> = {
      overview: ['get_fleet_overview'],
      route_health: ['get_route_health', 'get_fleet_buses'],
      buses: ['get_fleet_buses', 'get_bus_assignment'],
      shifts: ['get_active_shifts'],
      assignment: fleetAssistantDto.selectedBusId
        ? ['get_bus_assignment']
        : ['get_fleet_buses', 'get_active_shifts'],
      general: ['get_fleet_overview'],
    };

    return toolsByIntent[intent];
  }

  private getFleetAutoToolCalls(
    intent: FleetAssistantIntent,
    fleetAssistantDto: FleetAssistantDto,
  ): AutoToolCall[] {
    const routeArgs = fleetAssistantDto.selectedRouteId
      ? { routeId: fleetAssistantDto.selectedRouteId }
      : {};

    if (intent === 'assignment' && fleetAssistantDto.selectedBusId) {
      return [
        {
          name: 'get_bus_assignment',
          args: { busId: fleetAssistantDto.selectedBusId },
        },
      ];
    }

    if (intent === 'shifts') {
      return [{ name: 'get_active_shifts', args: {} }];
    }

    if (intent === 'route_health') {
      return [{ name: 'get_route_health', args: routeArgs }];
    }

    if (intent === 'buses') {
      return [{ name: 'get_fleet_buses', args: routeArgs }];
    }

    return [{ name: 'get_fleet_overview', args: {} }];
  }

  private routeAdminIntent(adminAssistantDto: AdminAssistantDto): AdminAssistantIntent {
    const text = this.intentText(
      adminAssistantDto.message,
      adminAssistantDto.summary,
      adminAssistantDto.activeSection,
    );

    if (/(audit|log|history|role change|ใครแก้|ประวัติ|audit log)/i.test(text)) {
      return 'audit';
    }

    if (/(health|backend|database|websocket|ai|sync|online|ระบบ|ฐานข้อมูล)/i.test(text)) {
      return 'health';
    }

    if (
      /(user|account|role|admin|fleet|disable|delete|password|ผู้ใช้|บัญชี|สิทธิ์)/i.test(text)
    ) {
      return 'users';
    }

    return 'general';
  }

  private getAdminToolNamesForIntent(intent: AdminAssistantIntent) {
    const toolsByIntent: Record<AdminAssistantIntent, string[]> = {
      users: ['get_admin_user_summary'],
      health: ['get_admin_system_health'],
      audit: ['get_admin_audit_logs'],
      general: ['get_admin_system_health'],
    };

    return toolsByIntent[intent];
  }

  private getAdminAutoToolCalls(intent: AdminAssistantIntent): AutoToolCall[] {
    const toolsByIntent: Record<AdminAssistantIntent, AutoToolCall[]> = {
      users: [{ name: 'get_admin_user_summary', args: {} }],
      health: [{ name: 'get_admin_system_health', args: {} }],
      audit: [{ name: 'get_admin_audit_logs', args: {} }],
      general: [{ name: 'get_admin_system_health', args: {} }],
    };

    return toolsByIntent[intent];
  }

  private extractRouteQuery(message: string) {
    const routeNumberMatch = message.match(/(?:route|line|สาย)\s*([0-9]{1,3})/i);

    if (routeNumberMatch?.[1]) {
      return routeNumberMatch[1];
    }

    const plainNumberMatch = message.match(/\b([0-9]{1,3})\b/);

    return plainNumberMatch?.[1] ?? message.trim().slice(0, 40);
  }

  private getFallbackMessage(locale: 'en' | 'th' | undefined, mode: 'user' | 'fleet' | 'admin') {
    if (locale === 'th') {
      if (mode === 'admin') {
        return 'ผมยังยืนยันคำตอบจากข้อมูล admin backend ไม่ได้ ลองถามเกี่ยวกับ users, system health หรือ audit log อีกครั้งครับ';
      }

      if (mode === 'fleet') {
        return 'ผมยังยืนยันคำตอบจากข้อมูล fleet backend ไม่ได้ ลองถามเกี่ยวกับ route health, active shifts, delayed buses หรือ fleet operations ครับ';
      }

      return 'ผมยังยืนยันคำตอบจากข้อมูล BusBuddy backend ไม่ได้ ลองถามเกี่ยวกับป้ายใกล้คุณ สายรถ รถสด หรือ ETA ครับ';
    }

    if (mode === 'admin') {
      return 'I could not verify that from BusBuddy admin backend data yet. Try asking about users, system health, or audit logs.';
    }

    if (mode === 'fleet') {
      return 'I could not verify that from BusBuddy fleet data yet. Try asking about route health, active shifts, delayed buses, or fleet operations.';
    }

    return 'I could not verify that from BusBuddy backend data yet. Try asking about nearby stops, route numbers, live buses, or ETA.';
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

  private buildAdminContext(adminAssistantDto: AdminAssistantDto, actorEmail: string) {
    const parts = [`Admin actor ${actorEmail}.`];

    if (adminAssistantDto.activeSection) {
      parts.push(`Current section ${adminAssistantDto.activeSection}.`);
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

  private tryReplyWithBackendTripPlanner(
    userAssistantDto: UserAssistantDto,
  ): AssistantResponsePayload | null {
    const tripRequest = this.resolveBackendTripPlannerRequest(userAssistantDto);

    if (!tripRequest.isTripIntent) {
      return null;
    }

    if (!tripRequest.destinationStop) {
      const message =
        userAssistantDto.locale === 'th'
          ? 'อยากไปที่ไหนครับ พิมพ์ชื่อปลายทางหรือเลือกป้ายปลายทาง เช่น “ไปบางกะปิยังไง”'
          : 'Where would you like to go? Type a destination stop or place, for example “How do I get to Bang Kapi?”';

      return this.buildDeterministicUserReply(userAssistantDto, message, []);
    }

    if (!tripRequest.origin) {
      const message =
        userAssistantDto.locale === 'th'
          ? 'ผมยังไม่มีต้นทางครับ เปิดตำแหน่งปัจจุบัน หรือถามแบบ “จากสยามไปบางกะปิยังไง” ได้เลย'
          : 'I need an origin first. Enable current location or ask like “How do I get from Siam to Bang Kapi?”';

      return this.buildDeterministicUserReply(userAssistantDto, message, []);
    }

    const plan = this.insightsService.planTrip({
      originLat: tripRequest.origin.lat,
      originLng: tripRequest.origin.lng,
      destinationLat: Number(tripRequest.destinationStop.latitude),
      destinationLng: Number(tripRequest.destinationStop.longitude),
    });
    const message = this.formatBackendTripPlannerReply(
      userAssistantDto.locale,
      tripRequest.originLabel,
      tripRequest.destinationStop.stop_name,
      plan,
    );

    return this.buildDeterministicUserReply(userAssistantDto, message, [
      'backend_trip_planner',
    ]);
  }

  private buildDeterministicUserReply(
    userAssistantDto: UserAssistantDto,
    message: string,
    toolCalls: string[],
  ): AssistantResponsePayload {
    return {
      message,
      tool_calls: toolCalls,
      model: 'busbuddy-backend-router',
      summary: this.buildRollingSummary(
        userAssistantDto.summary,
        userAssistantDto.message,
        message,
        toolCalls,
      ),
    };
  }

  private resolveBackendTripPlannerRequest(userAssistantDto: UserAssistantDto) {
    const mentions = this.findStopMentions(userAssistantDto.message);
    const isTripIntent =
      USER_TRIP_QUESTION_PATTERN.test(userAssistantDto.message) ||
      (mentions.length > 0 && /(ไป|จาก|to|from|direction|route|ยังไง|อย่างไร)/i.test(userAssistantDto.message));

    if (!isTripIntent) {
      return { isTripIntent: false as const };
    }

    const explicitOrigin = this.pickStopMentionAfterKeywords(mentions, userAssistantDto.message, [
      'จาก',
      'from',
    ]);
    const destinationStop =
      this.pickStopMentionAfterKeywords(
        mentions,
        userAssistantDto.message,
        ['ไป', 'to', 'go to', 'travel to'],
        explicitOrigin?.stop.stop_id,
      )?.stop ??
      mentions.find((mention) => mention.stop.stop_id !== explicitOrigin?.stop.stop_id)?.stop ??
      mentions[0]?.stop;
    const selectedStop = userAssistantDto.selectedStopId
      ? this.findStopById(userAssistantDto.selectedStopId)
      : null;
    const originStop = explicitOrigin?.stop ?? selectedStop;

    if (explicitOrigin?.stop) {
      return {
        isTripIntent: true as const,
        destinationStop,
        origin: {
          lat: Number(explicitOrigin.stop.latitude),
          lng: Number(explicitOrigin.stop.longitude),
        },
        originLabel: explicitOrigin.stop.stop_name,
      };
    }

    if (userAssistantDto.userLocation) {
      return {
        isTripIntent: true as const,
        destinationStop,
        origin: userAssistantDto.userLocation,
        originLabel: userAssistantDto.locale === 'th' ? 'ตำแหน่งปัจจุบัน' : 'your current location',
      };
    }

    if (originStop) {
      return {
        isTripIntent: true as const,
        destinationStop,
        origin: {
          lat: Number(originStop.latitude),
          lng: Number(originStop.longitude),
        },
        originLabel: originStop.stop_name,
      };
    }

    return {
      isTripIntent: true as const,
      destinationStop,
      origin: null,
      originLabel: '',
    };
  }

  private findStopMentions(message: string) {
    const normalizedMessage = this.normalizeSearchText(message);
    const compactMessage = normalizedMessage.replace(/\s+/g, '');
    const mentions = new Map<
      string,
      {
        stop: ReturnType<TransitStateService['getStops']>[number];
        index: number;
        aliasLength: number;
      }
    >();

    for (const stop of this.transitState.getStops()) {
      const aliases = [
        stop.stop_name,
        stop.landmark,
        stop.area_description,
        ...(THAI_STOP_ALIASES[stop.stop_id] ?? []),
      ]
        .filter(Boolean)
        .map((alias) => this.normalizeSearchText(String(alias)))
        .filter((alias) => alias.length >= 3);

      for (const alias of aliases) {
        const compactAlias = alias.replace(/\s+/g, '');
        let index = normalizedMessage.indexOf(alias);

        if (index < 0 && compactAlias.length >= 3) {
          index = compactMessage.indexOf(compactAlias);
        }

        if (index < 0) {
          continue;
        }

        const current = mentions.get(stop.stop_id);

        if (!current || alias.length > current.aliasLength || index < current.index) {
          mentions.set(stop.stop_id, {
            stop,
            index,
            aliasLength: alias.length,
          });
        }
      }
    }

    return Array.from(mentions.values()).sort((left, right) => {
      if (left.index === right.index) {
        return right.aliasLength - left.aliasLength;
      }

      return left.index - right.index;
    });
  }

  private pickStopMentionAfterKeywords(
    mentions: ReturnType<AiService['findStopMentions']>,
    message: string,
    keywords: string[],
    excludedStopId?: string,
  ) {
    const normalizedMessage = this.normalizeSearchText(message);
    const keywordIndexes = keywords
      .map((keyword) => normalizedMessage.indexOf(this.normalizeSearchText(keyword)))
      .filter((index) => index >= 0);

    if (!keywordIndexes.length) {
      return null;
    }

    return (
      mentions
        .filter((mention) => mention.stop.stop_id !== excludedStopId)
        .flatMap((mention) =>
          keywordIndexes
            .filter((keywordIndex) => mention.index > keywordIndex)
            .map((keywordIndex) => ({
              mention,
              distance: mention.index - keywordIndex,
            })),
        )
        .sort((left, right) => left.distance - right.distance)[0]?.mention ?? null
    );
  }

  private findStopById(stopId: string) {
    try {
      return this.transitState.getStop(stopId);
    } catch {
      return null;
    }
  }

  private normalizeSearchText(value: string) {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private formatBackendTripPlannerReply(
    locale: 'en' | 'th' | undefined,
    originLabel: string,
    destinationName: string,
    plan: ReturnType<InsightsService['planTrip']>,
  ) {
    const topPlans = plan.plans.slice(0, 2);

    if (topPlans.length === 0) {
      return locale === 'th'
        ? `ยังหาเส้นทางจาก ${originLabel} ไป ${destinationName} จากข้อมูล BusBuddy ไม่เจอครับ ลองเลือกต้นทาง/ปลายทางที่ใกล้ป้ายรถเมล์กว่าเดิม`
        : `I could not find a BusBuddy route from ${originLabel} to ${destinationName}. Try an origin or destination closer to a bus stop.`;
    }

    if (locale === 'th') {
      const lines = topPlans.map((tripPlan, index) => {
        const transferStop = this.getTripPlanTransferStop(tripPlan);
        const transferText = transferStop
          ? ` ต่อที่ ${transferStop.stop_name}`
          : '';

        return `${index + 1}. สาย ${tripPlan.route_number}: ขึ้นที่ ${tripPlan.boarding_stop.stop_name}${transferText} ลงที่ ${tripPlan.alighting_stop.stop_name} รวมประมาณ ${tripPlan.total_minutes} นาที`;
      });

      return [
        `จาก ${originLabel} ไป ${destinationName} แนะนำ:`,
        ...lines,
        'เวลาเป็น estimate จาก BusBuddy backend, live ETA และ traffic mock ไม่ใช่เวลาจาก map routing จริงครับ',
      ].join('\n');
    }

    const lines = topPlans.map((tripPlan, index) => {
      const transferStop = this.getTripPlanTransferStop(tripPlan);
      const transferText = transferStop
        ? `, transfer at ${transferStop.stop_name}`
        : '';

      return `${index + 1}. Route ${tripPlan.route_number}: board at ${tripPlan.boarding_stop.stop_name}${transferText}, get off at ${tripPlan.alighting_stop.stop_name}. About ${tripPlan.total_minutes} min total.`;
    });

    return [
      `From ${originLabel} to ${destinationName}, BusBuddy suggests:`,
      ...lines,
      'Times are estimated from BusBuddy backend live ETA and traffic mock data, not external map routing.',
    ].join('\n');
  }

  private getTripPlanTransferStop(
    tripPlan: ReturnType<InsightsService['planTrip']>['plans'][number],
  ): { stop_name: string } | undefined {
    return 'transfer_stop' in tripPlan
      ? (tripPlan.transfer_stop as { stop_name: string } | undefined)
      : undefined;
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
      {
        name: 'get_eta_for_nearest_stop',
        description:
          'Find the nearest stop to a rider location and return ETA predictions for that stop.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            lat: { type: 'number', description: 'Latitude of the rider location.' },
            lng: { type: 'number', description: 'Longitude of the rider location.' },
            radius: {
              type: 'number',
              description: 'Optional search radius in meters. Default 2500.',
            },
          },
          required: ['lat', 'lng'],
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
      get_eta_for_nearest_stop: async (args) => {
        const lat = Number(args.lat);
        const lng = Number(args.lng);
        const radius = args.radius ? Number(args.radius) : 2500;
        const nearestStop = this.transitState.getNearbyStops(lat, lng, radius)[0];

        if (!nearestStop) {
          return {
            nearest_stop: null,
            eta_predictions: [],
            message: 'No nearby stop found inside the search radius.',
          };
        }

        return {
          nearest_stop: {
            stop_id: nearestStop.stop_id,
            stop_name: nearestStop.stop_name,
            distance_meters: nearestStop.distance_meters,
            route_ids: nearestStop.route_ids?.slice(0, 6),
            landmark: nearestStop.landmark,
          },
          eta_predictions: this.transitState
            .getEtaPredictions(nearestStop.stop_id)
            .slice(0, 5)
            .map((prediction) =>
              this.toCompactEtaPrediction(prediction as Record<string, unknown>),
            ),
        };
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

  private getAdminTools(): AssistantToolSet {
    const declarations: FunctionDeclaration[] = [
      {
        name: 'get_admin_user_summary',
        description:
          'Get user counts and compact account records for admin user management.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            role: {
              type: 'string',
              description: 'Optional role filter: USER, FLEET, or ADMIN.',
            },
            status: {
              type: 'string',
              description: 'Optional status filter: active, disabled, or deleted.',
            },
          },
        },
      },
      {
        name: 'get_admin_system_health',
        description: 'Get current backend, database, websocket, AI, and sync status.',
        parametersJsonSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'get_admin_audit_logs',
        description: 'Get recent audit logs, optionally filtered by action or actor email.',
        parametersJsonSchema: {
          type: 'object',
          properties: {
            action: { type: 'string', description: 'Optional action filter.' },
            actorEmail: { type: 'string', description: 'Optional actor email filter.' },
          },
        },
      },
    ];

    const handlers: Record<string, ToolCallHandler> = {
      get_admin_user_summary: async (args) => {
        const role = typeof args.role === 'string' ? args.role.toUpperCase() : undefined;
        const status = typeof args.status === 'string' ? args.status.toLowerCase() : undefined;
        const where = {
          ...(role && ['USER', 'FLEET', 'ADMIN'].includes(role)
            ? { role: role as 'USER' | 'FLEET' | 'ADMIN' }
            : {}),
          ...(status === 'active' ? { isActive: true, deletedAt: null } : {}),
          ...(status === 'disabled' ? { isActive: false, deletedAt: null } : {}),
          ...(status === 'deleted' ? { deletedAt: { not: null } } : {}),
        };
        const users = await this.prisma.user.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }],
          take: 25,
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            isActive: true,
            mustResetPassword: true,
            deletedAt: true,
            lastLoginAt: true,
            createdAt: true,
          },
        });
        const [totalUsers, admins, fleetManagers, activeUsers, deletedUsers] =
          await Promise.all([
            this.prisma.user.count(),
            this.prisma.user.count({ where: { role: 'ADMIN' } }),
            this.prisma.user.count({ where: { role: 'FLEET' } }),
            this.prisma.user.count({ where: { isActive: true, deletedAt: null } }),
            this.prisma.user.count({ where: { deletedAt: { not: null } } }),
          ]);

        return {
          counts: {
            total_users: totalUsers,
            admins,
            fleet_managers: fleetManagers,
            active_users: activeUsers,
            deleted_users: deletedUsers,
          },
          users: users.map((user) => ({
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            status: user.deletedAt
              ? 'deleted'
              : user.isActive
                ? 'active'
                : 'disabled',
            must_reset_password: user.mustResetPassword,
            last_login_at: user.lastLoginAt?.toISOString() ?? null,
            created_at: user.createdAt.toISOString(),
          })),
        };
      },
      get_admin_system_health: async () => {
        const databaseReachable = await this.prisma.isDatabaseReachable();
        return {
          backend: 'online',
          database: databaseReachable ? 'online' : 'offline',
          websocket: this.simulationGateway.isReady() ? 'online' : 'starting',
          ai: this.getHealthStatus(),
          transit_sync: this.transitPersistence.getLastSyncStatus(),
          checked_at: new Date().toISOString(),
        };
      },
      get_admin_audit_logs: async (args) => {
        const action =
          typeof args.action === 'string' && args.action.trim()
            ? args.action.trim()
            : undefined;
        const actorEmail =
          typeof args.actorEmail === 'string' && args.actorEmail.trim()
            ? args.actorEmail.trim()
            : undefined;
        const logs = await this.prisma.auditLog.findMany({
          where: {
            ...(action ? { action } : {}),
            ...(actorEmail
              ? { actorEmail: { contains: actorEmail, mode: 'insensitive' } }
              : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        return logs.map((log) => ({
          id: log.id,
          actor_email: log.actorEmail ?? 'System',
          action: log.action,
          target_type: log.targetType,
          target_id: log.targetId,
          summary: log.summary,
          metadata: log.metadata,
          created_at: log.createdAt.toISOString(),
        }));
      },
    };

    return {
      declarations,
      handlers,
    };
  }
}
