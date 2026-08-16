import {
  ApplicationConfig,
  EnvironmentProviders,
  Provider,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { authHttpInterceptorFn, provideAuth0 } from '@auth0/auth0-angular';

import { routes } from './app.routes';
import { authEnabled, runtimeConfig } from './core/runtime-config';

export function createAppConfig(): ApplicationConfig {
  const providers: (Provider | EnvironmentProviders)[] = [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(
      withFetch(),
      ...(authEnabled ? [withInterceptors([authHttpInterceptorFn])] : []),
    ),
    provideRouter(routes),
  ];
  if (authEnabled) {
    providers.push(
      provideAuth0({
        domain: runtimeConfig.auth.domain,
        clientId: runtimeConfig.auth.clientId,
        authorizationParams: {
          redirect_uri: window.location.origin,
          audience: runtimeConfig.auth.audience,
        },
        httpInterceptor: {
          allowedList: [
            {
              uri: `${runtimeConfig.apiBaseUrl}/*`,
              tokenOptions: { authorizationParams: { audience: runtimeConfig.auth.audience } },
            },
          ],
        },
        cacheLocation: 'memory',
        useRefreshTokens: true,
      }),
    );
  }
  return { providers };
}
