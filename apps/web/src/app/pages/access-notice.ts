import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  template: `<h1>Return to your workspace</h1>
    <p role="status">
      You are signed in. The requested destination is unavailable or is outside your assigned
      access.
    </p>
    <a class="button" routerLink="/">Go to dashboard</a>`,
})
export class AccessNotice {}
