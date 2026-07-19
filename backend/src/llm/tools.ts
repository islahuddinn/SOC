import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const AGENT_TOOLS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'lookup_order',
      description: 'Look up an order by ID. Returns order details and line items. Use to verify order exists before taking action.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number', description: 'The order ID to look up' },
        },
        required: ['order_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_customer_orders',
      description: 'List all orders for the requesting customer email.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_refund',
      description: 'Request a refund for an order. May auto-execute or escalate based on guardrails and policy.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          amount: { type: 'number', description: 'Refund amount in dollars' },
          reason: { type: 'string', description: 'Reason for the refund' },
        },
        required: ['order_id', 'amount', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_cancellation',
      description: 'Request cancellation of an order that has not shipped.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_replacement',
      description: 'Request a replacement for damaged or defective items. Always escalates to human review.',
      parameters: {
        type: 'object',
        properties: {
          order_id: { type: 'number' },
          reason: { type: 'string' },
        },
        required: ['order_id', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'escalate_to_human',
      description: 'Escalate the request to a human reviewer when you cannot resolve automatically or policy requires it.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why human review is needed' },
          summary: { type: 'string', description: 'Summary of the situation for the reviewer' },
        },
        required: ['reason', 'summary'],
      },
    },
  },
];

export const SYSTEM_PROMPT = `You are a support agent for an e-commerce store. Your job is to help customers with order issues.

IMPORTANT RULES:
1. Always look up order information before taking action.
2. Verify the order belongs to the customer (lookup_order shows is_owner).
3. Use the appropriate tool for refunds, cancellations, or replacements.
4. Refunds and replacements typically require human approval — use request_refund or request_replacement.
5. Cancellations can be auto-processed if the order hasn't shipped.
6. If unsure, blocked by guardrails, or the request is ambiguous, use escalate_to_human.
7. Never invent order IDs — always verify with lookup_order first.
8. Be concise in your reasoning.

Customer email is provided in context. Only act on orders belonging to this customer.`;
