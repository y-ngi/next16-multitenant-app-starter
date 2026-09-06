export type Area = "admin" | "general";
export type AccessState = "unauthenticated" | "unassigned" | "active";

export type AccessDecision = {
  area: Area;
  state: AccessState;
  canUseOrganizationFeatures: boolean;
  canUsePersonalFeatures: boolean;
};

export function getAccessDecision(area: Area, authenticated: boolean, hasMembership: boolean): AccessDecision {
  if (!authenticated) {
    return {
      area,
      state: "unauthenticated",
      canUseOrganizationFeatures: false,
      canUsePersonalFeatures: area === "general",
    };
  }

  if (!hasMembership) {
    return {
      area,
      state: "unassigned",
      canUseOrganizationFeatures: false,
      canUsePersonalFeatures: area === "general",
    };
  }

  return {
    area,
    state: "active",
    canUseOrganizationFeatures: true,
    canUsePersonalFeatures: area === "general",
  };
}
