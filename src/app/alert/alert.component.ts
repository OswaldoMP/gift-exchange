import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Alert } from '../services/alert-service.service';

@Component({
  selector: 'app-alert',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './alert.component.html',
  styleUrls: ['./alert.component.css']
})
export class AlertComponent {
  alert = input.required<Alert>();
  onClose = input<(id: string) => void>();

  get icon(): string {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[this.alert().type];
  }

  get progressBarDuration(): number {
    return this.alert().duration || 0;
  }

  close() {
    if (this.onClose()) {
      this.onClose()?.(this.alert().id);
    }
  }
}