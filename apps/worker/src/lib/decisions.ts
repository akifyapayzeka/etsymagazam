import { prisma } from "@etsymagazam/database";
import type { Alert, AgentDecision, AlertPriority, AuditLog } from "@etsymagazam/database";

export interface RecordDecisionInput {
  agentRunId?: string;
  agentName: string;
  entityType: string;
  entityId?: string;
  action: string;
  reason: string;
  dataUsed: Record<string, unknown>;
  confidenceScore: number;
  result?: string;
}

/** Every autopilot decision gets a row here — this is what the Audit Log / dashboard "why did it do that" view reads from. */
export async function recordDecision(input: RecordDecisionInput): Promise<AgentDecision> {
  return prisma.agentDecision.create({
    data: {
      agentRunId: input.agentRunId,
      agentName: input.agentName,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      reason: input.reason,
      dataUsed: input.dataUsed as object,
      confidenceScore: input.confidenceScore,
      result: input.result,
    },
  });
}

export interface RecordAuditInput {
  shopId: string;
  actor: string;
  action: string;
  entityType: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}

export async function recordAudit(input: RecordAuditInput): Promise<AuditLog> {
  return prisma.auditLog.create({
    data: {
      shopId: input.shopId,
      actor: input.actor,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: input.before as object | undefined,
      after: input.after as object | undefined,
      reason: input.reason,
    },
  });
}

export interface RaiseAlertInput {
  shopId?: string;
  priority: AlertPriority;
  category: string;
  title: string;
  message: string;
  context?: Record<string, unknown>;
  /** Dedup window in ms — an open alert of the same shop+category within this window is not duplicated. Defaults to 6h. */
  dedupWindowMs?: number;
}

/** Creates an alert, unless an open one of the same category already exists within the dedup window (so a flaky retry loop doesn't spam P1s). */
export async function raiseAlert(input: RaiseAlertInput): Promise<Alert> {
  const dedupWindowMs = input.dedupWindowMs ?? 6 * 60 * 60 * 1000;
  const recent = await prisma.alert.findFirst({
    where: {
      shopId: input.shopId,
      category: input.category,
      status: "OPEN",
      createdAt: { gte: new Date(Date.now() - dedupWindowMs) },
    },
  });
  if (recent) return recent;

  return prisma.alert.create({
    data: {
      shopId: input.shopId,
      priority: input.priority,
      category: input.category,
      title: input.title,
      message: input.message,
      context: input.context as object | undefined,
    },
  });
}
