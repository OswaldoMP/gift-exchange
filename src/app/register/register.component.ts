import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertService } from '../services/alert-service.service';
import { LocalDbService } from '../services/local-db.service';
import { Exchanges } from '../models/exchanges.entity';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit {
  private alertService = inject(AlertService);
  private localDbService = inject(LocalDbService);
  private router = inject(Router);

  fullName = signal<string>('');
  email = signal<string>('');
  password = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  pendingConfirmation = signal<boolean>(false);
  resendingEmail = signal<boolean>(false);
  confirmationPreviewUrl = signal<string>('');

  eventConfig = signal<Required<Exchanges>>(this.localDbService.getCachedInfoEvent());

  ngOnInit(): void {
    this.localDbService
      .getInfoEvent()
      .then((event) => this.eventConfig.set(event))
      .catch(() => this.eventConfig.set(this.localDbService.getCachedInfoEvent()));
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  async onRegister(): Promise<void> {
    if (!this.fullName() || !this.email() || !this.password()) {
      this.alertService.error('Campos requeridos', 'Por favor completa todos los campos');
      return;
    }

    this.isLoading.set(true);
    const { error, data } = await this.localDbService.signUp(
      this.email(),
      this.password(),
      this.fullName()
    );
    if (error) {
      const detail =
        error.message === 'User already registered'
          ? `Ese correo ya está registrado en ${this.eventConfig().event_title}. Intenta iniciar sesión.`
          : `${this.fullName()}, hemos tenido un problema al crear tu cuenta. Inténtalo más tarde.`;
      this.alertService.error('Registro fallido', detail);
      this.isLoading.set(false);
      return;
    }
    this.isLoading.set(false);

    if (data.requiresConfirmation) {
      this.pendingConfirmation.set(true);
      if (data.confirmationPreviewUrl) {
        this.confirmationPreviewUrl.set(data.confirmationPreviewUrl);
      }
      this.alertService.success(
        `¡Cuenta creada, ${this.fullName()}!`,
        'Enviamos un correo de confirmación. Abre el enlace para activar tu cuenta e ingresar a tu panel.',
        5500
      );
      return;
    }

    this.setLocalStorage(data);
    this.alertService.success(
      `¡Bienvenido ${this.fullName()}!`,
      `Tu cuenta de participante ha sido creada para ${this.eventConfig().event_title}.`,
      3800
    );

    await this.router.navigate(['/intercambio']);
  }

  async onResendConfirmation(): Promise<void> {
    if (!this.email() || this.resendingEmail()) {
      return;
    }
    this.resendingEmail.set(true);
    const res = await this.localDbService.resendConfirmation(this.email());
    this.resendingEmail.set(false);
    if (res.error) {
      this.alertService.error('Error al reenviar', res.error.message);
      return;
    }
    if (res.confirmationPreviewUrl) {
      this.confirmationPreviewUrl.set(res.confirmationPreviewUrl);
    }
    this.alertService.success(
      'Correo reenviado',
      'Revisa tu bandeja de entrada para confirmar tu registro.'
    );
  }

  setLocalStorage(data: any): void {
    if (data?.user?.id) {
      localStorage.setItem('uuid', data.user.id);
    }
    if (data?.user?.user_metadata?.['username']) {
      localStorage.setItem('username', data.user.user_metadata['username']);
    }
  }
}
