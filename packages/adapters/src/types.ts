import type {
  CandidateInput,
  Evidence,
  InstallProfile,
  SourceCoverageItem,
  SourceFamily
} from "@research/core";

export interface AdapterDefinition {
  name: string;
  family: SourceFamily;
  installProfile: InstallProfile;
  cliCommand?: string;
  fixtureFile: string;
  active: boolean;
}

export interface AdapterRuntime {
  definition: AdapterDefinition;
  evidence: Evidence[];
  coverage: SourceCoverageItem;
  candidateMetadata: Record<string, Omit<CandidateInput, "evidence">>;
}
