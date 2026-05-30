export * from "./auth";
export * from "./base";
export * from "./instance-settings";
export * from "./jobs";
export * from "./knowledge-refs";
export * from "./projects";
export * from "./provider-connections";
export * from "./repositories";
export * from "./tickets";

import * as auth from "./auth";
import * as instanceSettings from "./instance-settings";
import * as jobs from "./jobs";
import * as knowledgeRefs from "./knowledge-refs";
import * as projects from "./projects";
import * as providerConnections from "./provider-connections";
import * as repositories from "./repositories";
import * as tickets from "./tickets";

export const schema = {
  ...auth.authSchema,
  ...instanceSettings,
  ...knowledgeRefs,
  ...projects,
  ...providerConnections,
  ...repositories,
  ...tickets,
  ...jobs,
};
