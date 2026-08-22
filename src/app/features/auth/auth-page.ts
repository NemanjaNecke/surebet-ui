import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import { Session } from '../../core/session';

@Component({
  selector: 'app-auth-page',
  imports: [RouterLink],
  templateUrl: './auth-page.html',
  styleUrl: './auth-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthPage {
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(Session);
  readonly mode = computed<'login' | 'signup'>(() =>
    this.route.snapshot.data['mode'] === 'signup' ? 'signup' : 'login',
  );

  continue(): void {
    this.session.authenticate(this.mode());
  }
}
