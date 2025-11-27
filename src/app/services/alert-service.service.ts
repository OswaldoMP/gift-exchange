import { Injectable, signal } from '@angular/core';

export interface Alert {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  dismissible?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AlertService {
  private alerts = signal<Alert[]>([]);

  getAlerts() {
    return this.alerts.asReadonly();
  }

  // Métodos principales
  show(alert: Omit<Alert, 'id'>) {
    const newAlert: Alert = {
      id: this.generateId(),
      dismissible: true,
      duration: 5000,
      ...alert
    };

    this.alerts.update(alerts => [...alerts, newAlert]);

    // Auto-remove si tiene duración
    if (newAlert.duration && newAlert.duration > 0) {
      setTimeout(() => {
        this.remove(newAlert.id);
      }, newAlert.duration);
    }
  }

  success(title: string, message: string = '', duration?: number) {
    this.show({ type: 'success', title, message, duration });
  }

  error(title: string, message: string = '', duration?: number) {
    this.show({ type: 'error', title, message, duration });
  }

  warning(title: string, message: string = '', duration?: number) {
    this.show({ type: 'warning', title, message, duration });
  }

  info(title: string, message: string = '', duration?: number) {
    this.show({ type: 'info', title, message, duration });
  }

  remove(id: string) {
    this.alerts.update(alerts => alerts.filter(alert => alert.id !== id));
  }

  clear() {
    this.alerts.set([]);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}