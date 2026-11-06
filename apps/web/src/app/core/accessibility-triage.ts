import { DatePipe } from '@angular/common';
import type { ElementRef, OnInit } from '@angular/core';
import {
  afterRenderEffect,
  Component,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Api, errorMessage } from './api';
import { Modal } from './modal';

interface Review {
  id: string;
  ruleId: string;
  kind: 'violation' | 'manual';
  description: string;
  version: number;
  owner: string;
  status: 'open' | 'investigating';
  note: string;
  exception: { reason: string; expiresAt: string; approvedBy: string } | null;
  exceptionState: 'none' | 'active' | 'expired';
}
@Component({
  selector: 'app-accessibility-triage',
  imports: [Modal, FormsModule, DatePipe],
  template: `
    <dialog
      #triageDialog
      appModal
      class="workspace-modal"
      aria-labelledby="triage-title"
      (dismissed)="closed.emit()"
    >
      <header class="editor-heading">
        <div>
          <p class="eyebrow">Accessibility triage · {{ resultId() }}</p>
          <h2 id="triage-title">Review recorded findings</h2>
          <p class="muted">
            Ownership and decisions carry across compatible final-state checks. Findings remain
            visible.
          </p>
        </div>
        <button
          type="button"
          class="editor-close"
          aria-label="Close accessibility triage"
          (click)="requestClose()"
        >
          ×
        </button>
      </header>
      @if (error()) {
        <div class="error editor-request-error" role="alert" tabindex="-1" #requestError>
          <p>{{ error() }}</p>
          <p>Your draft is preserved. Reload to retrieve a newer review after a conflict.</p>
          <button type="button" (click)="load()">Reload reviews</button>
        </div>
      }
      @if (loading()) {
        <p role="status">Loading recorded findings…</p>
      }
      @if (saved()) {
        <p role="status">Accessibility review saved.</p>
      }
      @if (selected(); as review) {
        <label
          >Finding<select
            [ngModel]="review.id"
            (ngModelChange)="choose($event)"
            aria-label="Finding"
          >
            @for (item of items(); track item.id) {
              <option [value]="item.id">
                {{ item.ruleId }} · {{ item.kind === 'manual' ? 'Manual assessment' : 'Violation' }}
              </option>
            }
          </select></label
        >
        <p>{{ review.description }}</p>
        @if (review.exception) {
          <p class="review-exception" role="status">
            Exception {{ review.exceptionState }} · Expires
            {{ review.exception.expiresAt | date: 'medium' }} · Approved by
            {{ review.exception.approvedBy }}
          </p>
        }
        <form (ngSubmit)="save()">
          <div class="triage-fields">
            <label
              >Owner label<input
                name="reviewOwner"
                [(ngModel)]="owner"
                maxlength="120"
                [disabled]="!canEdit() || busy() || loading()"
                placeholder="Team or person responsible"
            /></label>
            <label
              >Review status<select
                name="reviewStatus"
                [(ngModel)]="status"
                [disabled]="!canEdit() || busy() || loading()"
              >
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
              </select></label
            >
          </div>
          <label
            >Review note<textarea
              name="reviewNote"
              [(ngModel)]="note"
              maxlength="2000"
              rows="3"
              [disabled]="!canEdit() || busy() || loading()"
            ></textarea>
          </label>
          @if (canApprove()) {
            <label class="checkbox-label"
              ><input
                name="approveException"
                type="checkbox"
                [(ngModel)]="approveException"
              />Approve time-limited exception</label
            >
            @if (approveException) {
              <div class="triage-fields">
                <label
                  >Exception reason<textarea
                    name="exceptionReason"
                    [(ngModel)]="exceptionReason"
                    minlength="10"
                    maxlength="2000"
                    required
                    rows="2"
                  ></textarea>
                </label>
                <label
                  >Exception expires (UTC)<input
                    name="exceptionUntil"
                    type="date"
                    [(ngModel)]="exceptionUntil"
                    required
                /></label>
              </div>
              <p class="muted">
                Maximum 30 days. Expiry is automatic; an exception never turns a finding into a
                pass.
              </p>
            }
          } @else {
            <p class="muted">
              Only administrators can approve or remove an exception. Owner labels do not grant
              access.
            </p>
          }
          <footer class="editor-footer">
            <button type="button" (click)="requestClose()">Close</button
            ><button class="primary" type="submit" [disabled]="busy() || loading() || !canEdit()">
              {{ busy() ? 'Saving…' : 'Save accessibility review' }}
            </button>
          </footer>
        </form>
      } @else if (!loading()) {
        <p>No recorded findings are available for review.</p>
      }
    </dialog>
  `,
  styles: [
    `
      dialog {
        width: min(52rem, calc(100vw - 2rem));
      }
      .triage-fields {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 1rem;
        margin-block: 1rem;
      }
      label {
        display: grid;
        gap: 0.5rem;
      }
      .checkbox-label {
        display: flex;
        gap: 0.75rem;
        align-items: center;
        margin-block: 1rem;
      }
      .review-exception {
        border: 1px solid var(--border);
        padding: 1rem;
        border-radius: 0.5rem;
      }
      @media (max-width: 600px) {
        .triage-fields {
          grid-template-columns: 1fr;
        }
      }
    `,
  ],
})
export class AccessibilityTriage implements OnInit {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('triageDialog');
  public readonly runId = input.required<string>();
  public readonly resultId = input.required<string>();
  public readonly closed = output<void>();
  public readonly api = inject(Api);
  public readonly items = signal<Review[]>([]);
  public readonly selected = signal<Review | null>(null);
  public readonly loading = signal(false);
  public readonly busy = signal(false);
  public readonly error = signal('');
  public readonly saved = signal(false);
  private readonly requestError = viewChild<ElementRef<HTMLElement>>('requestError');
  public owner = '';
  public status: 'open' | 'investigating' = 'open';
  public note = '';
  public approveException = false;
  public exceptionReason = '';
  public exceptionUntil = '';
  public constructor() {
    afterRenderEffect(() => {
      if (this.error()) {
        this.requestError()?.nativeElement.focus();
      }
    });
  }
  public requestClose(): void {
    this.dialog().nativeElement.close();
  }
  public ngOnInit(): void {
    void this.load();
  }
  public canEdit(): boolean {
    return ['operator', 'maintainer', 'administrator'].includes(this.api.identity()?.role ?? '');
  }
  public canApprove(): boolean {
    return this.api.identity()?.role === 'administrator';
  }
  public choose(id: string): void {
    const item = this.items().find((review) => review.id === id) ?? null;
    this.error.set('');
    this.selected.set(item);
    this.saved.set(false);
    this.owner = item?.owner ?? '';
    this.status = item?.status ?? 'open';
    this.note = item?.note ?? '';
    this.approveException = Boolean(item?.exception);
    this.exceptionReason = item?.exception?.reason ?? '';
    this.exceptionUntil = item?.exception?.expiresAt.slice(0, 10) ?? '';
  }
  public async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const current = this.selected()?.id;
      const response = await this.api.get<{ items: Review[] }>(this.path());
      this.items.set(response.items);
      this.choose(current ?? response.items[0]?.id ?? '');
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
  public async save(): Promise<void> {
    const item = this.selected();
    if (!item || !this.canEdit()) {
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.saved.set(false);
    try {
      await this.api.patch(
        `${this.path()}/${item.id}`,
        {
          owner: this.owner,
          status: this.status,
          note: this.note,
          ...(this.canApprove()
            ? {
                exception: this.approveException
                  ? {
                      reason: this.exceptionReason,
                      expiresAt:
                        item.exception?.expiresAt.slice(0, 10) === this.exceptionUntil
                          ? item.exception.expiresAt
                          : new Date(`${this.exceptionUntil}T23:59:59.000Z`).toISOString(),
                    }
                  : null,
              }
            : {}),
        },
        item.version,
      );
      await this.load();
      if (!this.error()) {
        this.saved.set(true);
      }
    } catch (error) {
      this.error.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
  private path(): string {
    return `/runs/${this.runId()}/results/${encodeURIComponent(this.resultId())}/accessibility/reviews`;
  }
}
