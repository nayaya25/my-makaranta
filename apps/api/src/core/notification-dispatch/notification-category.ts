export const NOTIFICATION_CATEGORIES = ["FEE_REMINDER", "RESULTS_READY", "ANNOUNCEMENT"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ["SMS", "EMAIL", "WHATSAPP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
