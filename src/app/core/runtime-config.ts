export interface KvotaRadarRuntimeConfig {
  apiBaseUrl: string;
  auth: {
    domain: string;
    clientId: string;
    audience: string;
    connection: string;
  };
}

declare global {
  interface Window {
    __KVOTARADAR_CONFIG__?: Partial<KvotaRadarRuntimeConfig> & {
      auth?: Partial<KvotaRadarRuntimeConfig['auth']>;
    };
  }
}

const supplied = window.__KVOTARADAR_CONFIG__;

export const runtimeConfig: KvotaRadarRuntimeConfig = {
  apiBaseUrl: supplied?.apiBaseUrl?.replace(/\/$/, '') || '/api/v1',
  auth: {
    domain: supplied?.auth?.domain?.trim() || '',
    clientId: supplied?.auth?.clientId?.trim() || '',
    audience: supplied?.auth?.audience?.trim() || '',
    connection: supplied?.auth?.connection?.trim() || '',
  },
};

export const authEnabled = Boolean(
  runtimeConfig.auth.domain && runtimeConfig.auth.clientId && runtimeConfig.auth.audience,
);
