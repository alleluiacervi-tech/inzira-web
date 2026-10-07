/** Development and demo builds: codes are shown on screen, email is printed to the log and payments are simulated. */
export const isDemo = () => process.env.INZIRA_DEMO === "1" || process.env.NODE_ENV !== "production";
