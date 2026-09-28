import {
  Users, UserCheck, PawPrint, LayoutGrid, Ticket,
  HeartPulse, Camera, MessageSquare, Layers, Shield,
  Radio,
} from "lucide-react";

export const ROLE_COLOR        = { VISITOR: "#60a5fa", STAFF: "#34d399", ADMIN: "#a3e635" };
export const STATUS_COLOR      = { HEALTHY: "#4ade80", UNDER_CARE: "#fbbf24", CRITICAL: "#f87171", QUARANTINED: "#818cf8" };
export const CLIMATE_COLOR     = { TROPICAL: "#34d399", TEMPERATE: "#60a5fa", ARID: "#fbbf24", WETLAND: "#818cf8", ALPINE: "#e2e8f0" };
export const NODE_STATUS_COLOR = { ACTIVE: "#4ade80", ALERT: "#f87171", OFFLINE: "#94a3b8", MAINTENANCE: "#fbbf24" };
export const STAFF_ROLES       = ["RANGER", "VETERINARIAN", "ADMINISTRATOR", "FIELD_ANALYST"];
export const HEALTH_STATUSES   = ["HEALTHY", "UNDER_CARE", "CRITICAL", "QUARANTINED"];

export const TABS = [
  { id: "overview",    label: "Overview",      icon: LayoutGrid    },
  { id: "iot-map",     label: "IoT Fleet Map", icon: Radio         },
  { id: "visitors",    label: "Visitors",      icon: Users         },
  { id: "staff",       label: "Staff",         icon: UserCheck     },
  { id: "animals",     label: "Animals",       icon: PawPrint      },
  { id: "zones",       label: "Zones",         icon: Shield        },
  { id: "enclosures",  label: "Enclosures",    icon: Layers        },
  { id: "health",      label: "Health Logs",   icon: HeartPulse    },
  { id: "surveys",     label: "Surveys",       icon: Camera        },
  { id: "feedback",    label: "Feedback",      icon: MessageSquare },
  { id: "tickets",     label: "Tickets",       icon: Ticket        },
];
