export const responseTargets = [
  {
    label: "Medical",
    value: "6m 12s",
    detail: "Average dispatch-to-arrival time across active ambulance calls.",
    tone: "signal" as const,
  },
  {
    label: "Fire",
    value: "8m 41s",
    detail: "Current rolling response time for fire suppression incidents.",
    tone: "warning" as const,
  },
  {
    label: "Crime",
    value: "4m 56s",
    detail: "Median route time for police vehicles in the last hour.",
    tone: "danger" as const,
  },
];

export const activeIncidents = [
  {
    id: "INC-24031",
    type: "Medical",
    title: "Multi-vehicle collision at Legon Boundary",
    description:
      "Two ambulances requested, one patient critical. Traffic density is slowing inbound access from the east corridor.",
    unit: "AMB-14 + AMB-09",
    eta: "3 minutes",
    latitude: 5.6508,
    longitude: -0.1879,
    status: "dispatched",
  },
  {
    id: "INC-24032",
    type: "Fire",
    title: "Generator room smoke alarm at Volta Hall",
    description:
      "Fire unit dispatched after repeated sensor trigger. Campus maintenance is evacuating the lower utility floor.",
    unit: "FIRE-03",
    eta: "5 minutes",
    latitude: 5.6523,
    longitude: -0.1854,
    status: "created",
  },
  {
    id: "INC-24033",
    type: "Crime",
    title: "Robbery report near Night Market entrance",
    description:
      "Police patrol routed from the central station. Caller reports two suspects moving toward the shuttle stop.",
    unit: "PATROL-21",
    eta: "2 minutes",
    latitude: 5.6499,
    longitude: -0.1892,
    status: "in_progress",
  },
];

export const serviceStatus = [
  { name: "Auth Service", endpoint: "localhost:8081", status: "healthy" },
  { name: "Incident Service", endpoint: "localhost:8082", status: "healthy" },
  { name: "Dispatch Service", endpoint: "localhost:8083", status: "healthy" },
  { name: "Analytics Service", endpoint: "localhost:8084", status: "healthy" },
  { name: "Realtime Gateway", endpoint: "localhost:8085", status: "healthy" },
];

export const queueHealth = [
  {
    label: "RabbitMQ event lag",
    value: "0.8s",
    detail: "Analytics consumer is processing incident lifecycle events within target.",
  },
  {
    label: "Websocket subscribers",
    value: "24",
    detail: "Open dashboard sessions currently subscribed to the gateway.",
  },
  {
    label: "Vehicles tracking",
    value: "17",
    detail: "Units reporting GPS updates to the dispatch tracking service.",
  },
];

export const coverageAreas = [
  {
    name: "Central Accra corridor",
    readiness: "stable",
    note: "Police and ambulance capacity both above 70%. Use as fallback for nearby overflow.",
  },
  {
    name: "University of Ghana ring",
    readiness: "watch",
    note: "Two medical incidents active. Consider keeping one ambulance unassigned for new campus calls.",
  },
  {
    name: "Adenta edge",
    readiness: "monitor",
    note: "Fire coverage depends on a single available truck until the returning unit clears inspection.",
  },
];
