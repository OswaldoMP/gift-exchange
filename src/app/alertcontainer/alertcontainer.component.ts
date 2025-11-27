import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertService } from '../services/alert-service.service';
import { AlertComponent } from '../alert/alert.component';

@Component({
  selector: 'app-alert-container',
  standalone: true,
  imports: [CommonModule, AlertComponent],
  templateUrl: './alert-container.component.html',
  styleUrls: ['./alert-container.component.css']
})
export class AlertContainerComponent {
  private alertService = inject(AlertService);
  
  alerts = this.alertService.getAlerts();

  removeAlert(id: string) {
    this.alertService.remove(id);
  }
}