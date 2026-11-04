import {
  afterNextRender,
  Directive,
  ElementRef,
  HostListener,
  inject,
  output,
} from '@angular/core';

@Directive({ selector: 'dialog[appModal]' })
export class Modal {
  private readonly element = inject<ElementRef<HTMLDialogElement>>(ElementRef);
  public readonly dismissed = output<void>();
  public constructor() {
    afterNextRender(() => this.element.nativeElement.showModal());
  }
  @HostListener('close')
  public closed(): void {
    this.dismissed.emit();
  }
  @HostListener('click', ['$event'])
  public outside(event: MouseEvent): void {
    const dialog = this.element.nativeElement;
    const box = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom)
    ) {
      dialog.close();
    }
  }
}
