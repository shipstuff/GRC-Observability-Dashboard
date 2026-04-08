export interface DataCollectionPoint {
  type: string;
  source: string;
  location: string;
  processor: string;
  retention: "transient" | "persistent" | "unknown";
  fields: string[];
}

export interface ThirdPartyService {
  name: string;
  purpose: string;
  dataShared: string[];
  dpaUrl: string | null;
}

export interface SecurityHeaders {
  csp: "missing" | "present" | "partial";
  hsts: "missing" | "present";
  xFrameOptions: "missing" | "present";
  xContentTypeOptions: "missing" | "present";
  referrerPolicy: "missing" | "present";
  permissionsPolicy: "missing" | "present";
}

export interface TlsInfo {
  enforced: boolean;
  certExpiry: string | null;
}

export interface DependencyInfo {
  criticalVulnerabilities: number;
  highVulnerabilities: number;
  mediumVulnerabilities: number;
  outdatedPackages: number;
  lastAudit: string;
}

export interface SecretsFindings {
  detected: boolean;
  findings: string[];
}

export interface AccessControls {
  branchProtection: boolean | null;
  requiredReviews: number | null;
  signedCommits: boolean | null;
}

export interface ArtifactStatus {
  privacyPolicy: "generated" | "manual" | "missing";
  termsOfService: "generated" | "manual" | "missing";
  securityTxt: "present" | "missing";
  vulnerabilityDisclosure: "present" | "missing";
  incidentResponsePlan: "present" | "missing";
}

export interface Manifest {
  repo: string;
  scanDate: string;
  branch: string;
  commit: string;
  dataCollection: DataCollectionPoint[];
  thirdPartyServices: ThirdPartyService[];
  securityHeaders: SecurityHeaders | null;
  https: TlsInfo | null;
  dependencies: DependencyInfo | null;
  secretsScan: SecretsFindings;
  artifacts: ArtifactStatus;
  accessControls: AccessControls;
}

export interface ScanContext {
  repoPath: string;
  repoName: string;
  branch: string;
  commit: string;
  siteUrl: string | null;
}

export interface ScanRule {
  name: string;
  run(ctx: ScanContext): Promise<unknown>;
}
