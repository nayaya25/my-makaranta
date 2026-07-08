export const MESSAGE_TEMPLATES = {
  FEE_INSTALLMENT_REMINDER: {
    variables: ["studentName", "amount", "dueDate"],
    default:
      "Dear Parent, {{studentName}}'s fees installment of {{amount}} is due {{dueDate}}. Kindly settle it. Thank you.",
  },
  FEE_BALANCE_REMINDER: {
    variables: ["studentName", "termLabel", "balance"],
    default: "Dear Parent, {{studentName}}'s {{termLabel}} fees balance is {{balance}}. Kindly settle it. Thank you.",
  },
  RESULTS_READY: {
    variables: ["studentName"],
    default: "Dear Parent, {{studentName}}'s results are now ready. Please log in to view the report card.",
  },
} as const;

export type MessageTemplateKey = keyof typeof MESSAGE_TEMPLATES;
