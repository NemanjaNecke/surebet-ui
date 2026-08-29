export interface SureEdgeRuntimeConfig {
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
    __SUREEDGE_CONFIG__?: Partial<SureEdgeRuntimeConfig> & {
      auth?: Partial<SureEdgeRuntimeConfig['auth']>;
    };
  }
}

const supplied = window.__SUREEDGE_CONFIG__;

export const runtimeConfig: SureEdgeRuntimeConfig = {
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
