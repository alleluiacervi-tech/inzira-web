/** Development, and staging builds marked INZIRA_DEMO=1. Live production is neither. */
export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";
