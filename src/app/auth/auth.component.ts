import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertService } from '../services/alert-service.service';
import { LocalDbService } from '../services/local-db.service';
import { Exchanges } from '../models/exchanges.entity';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {
  private alertService = inject(AlertService);
  private localDbService = inject(LocalDbService);

  private route = inject(ActivatedRoute);
  private router = inject(Router);

  email = signal<string>('');
  password = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  rememberMe = signal<boolean>(false);
  showResendConfirmation = signal<boolean>(false);
  resendingEmail = signal<boolean>(false);
  confirmationPreviewUrl = signal<string>('');

  eventConfig = signal<Required<Exchanges>>(this.localDbService.getCachedInfoEvent());

  ngOnInit(): void {
    this.validateRedirect();
    this.localDbService
      .getInfoEvent()
      .then((event) => this.eventConfig.set(event))
      .catch(() => this.eventConfig.set(this.localDbService.getCachedInfoEvent()));
  }

  async validateRedirect(): Promise<void> {
    const confirmToken = this.route.snapshot.queryParams['confirmToken'];
    if (confirmToken) {
      this.isLoading.set(true);
      const res = await this.localDbService.confirmEmail(confirmToken);
      this.isLoading.set(false);
      if (res.error) {
        this.alertService.error('Confirmación inválida', res.error.message, 5000);
        return;
      }
      this.setLocalStore(res.data);
      this.alertService.success(
        '¡Cuenta confirmada!',
        `Tu registro en ${this.eventConfig().event_title} fue confirmado correctamente.`,
        4000
      );
      await this.router.navigate(['/intercambio']);
      return;
    }

    const token = this.route.snapshot.queryParams['token'];
    if (!token) {
      return;
    }

    this.localDbService.signInByToken(token).then((res) => {
      const status = res.data.user?.role;
      if (status === 'authenticated') {
        this.setLocalStore(res.data);
        this.router.navigate(['/intercambio']);
      } else {
        this.alertService.info(
          'Cuenta no confirmada',
          'Valida tu cuenta para participar en nuestro intercambio navideño 2026.'
        );
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  async onLogin(): Promise<void> {
    if (!this.email() || !this.password()) {
      this.alertService.error('Campos requeridos', 'Por favor completa todos los campos');
      return;
    }

    this.isLoading.set(true);
    this.showResendConfirmation.set(false);
    this.confirmationPreviewUrl.set('');
    const { error, data } = await this.localDbService.signIn(this.email(), this.password());
    if (error) {
      if (error.message === 'Email not confirmed') {
        this.showResendConfirmation.set(true);
        this.alertService.info(
          'Correo no confirmado',
          'Revisa tu bandeja de entrada para confirmar tu registro o solicita un nuevo enlace.'
        );
      } else if (error.message === 'Invalid login credentials') {
        this.alertService.error('Datos incorrectos', 'Correo o contraseña incorrectos', 4000);
      } else {
        this.alertService.error('Error de conexión', 'No pudimos conectar con el servidor local del intercambio.', 4000);
      }

      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(false);
    this.setLocalStore(data);
    this.alertService.success(
      '¡Bienvenido de vuelta!',
      `Has iniciado sesión en ${this.eventConfig().event_title}`,
      3800
    );
    this.router.navigate(['/intercambio']);
  }

  async onResendConfirmation(): Promise<void> {
    if (!this.email() || this.resendingEmail()) {
      return;
    }
    this.resendingEmail.set(true);
    const res = await this.localDbService.resendConfirmation(this.email());
    this.resendingEmail.set(false);
    if (res.error) {
      this.alertService.error('No se pudo reenviar', res.error.message);
      return;
    }
    if (res.confirmationPreviewUrl) {
      this.confirmationPreviewUrl.set(res.confirmationPreviewUrl);
    }
    this.alertService.success(
      'Correo reenviado',
      'Te enviamos un nuevo enlace de confirmación. Revisa tu correo.'
    );
  }

  setLocalStore(data: any): void {
    if (data?.user?.id) {
      localStorage.setItem('uuid', data.user.id);
    }
    const username = data?.user?.user_metadata?.['username'] || data?.user?.email || '';
    if (username) {
      localStorage.setItem('username', username);
    }
  }
}
