import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AlertService } from '../services/alert-service.service';
import { SupabaseService } from '../services/supabase-service.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent implements OnInit {
  private alertService = inject(AlertService);
  private supabaseService = inject(SupabaseService);

  private route = inject(ActivatedRoute);
  private router = inject(Router);

  email = signal<string>('');
  password = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  rememberMe = signal<boolean>(false);

  dateEvent = signal<string>("-");
  timeEvent = signal<string>("-");
  moneyEvent = signal<string>("-");
  startEvent = signal<string>("-");
  uploadGift = signal<string>("-");



  ngOnInit(): void {
    this.validateRedirect();
    this.supabaseService.getInfoEvent().then(() => this.getInfoEvent());
  }

  validateRedirect() {
    const { info, token, email, succes, } = this.route.snapshot.queryParams;

    this.supabaseService.singInByToken(token).then((res) => {
      const status = res.data.user?.role;
      if (status === 'authenticated') {
        this.setLocalStore(res.data);
        this.router.navigate(['/intercambio']);
      } else if (!this.route.snapshot.queryParams) {
        this.alertService.info(
          `Cuenta no cofirmada`,
          'Revisa tu correo, para validar tu cuenta y participar en nuestro intercambios 2025!'
        );
        return;
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
    // Simular proceso de login
    const { error, data } = await this.supabaseService.signIn(this.email(), this.password());
    if (error) {
      if (error.message === "Email not confirmed") {
        this.alertService.info("Correo no confirmado", `Revisa tu correo, para validar tu cuenta y participar en nuestro intercambios 2025!`);
      } else if (error.message === 'Invalid login credentials') {
        this.alertService.error("Datos incorrectos", `Correo o password incorrectos`, 4000);
      }

      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(false);
    this.setLocalStore(data);
    this.alertService.success(
      '¡Bienvenido de vuelta!',
      'Has iniciado sesión correctamente', 3800
    );
    this.router.navigate(['/intercambio']);
  }

  onMagicLinkLogin(): void {
    if (!this.email()) {
      alert('Por favor ingresa tu correo electrónico');
      return;
    }
    this.isLoading.set(true);
    // Simular envío de magic link
    setTimeout(() => {
      this.isLoading.set(false);
      alert(`¡Magic link enviado a ${this.email()}! Revisa tu correo.`);
    }, 1500);
  }

  setLocalStore(data: any) {
    if (data?.user?.id) {
      localStorage.setItem("uuid", data.user.id);
    }
    const username = data?.user?.user_metadata?.['username'] || data?.user?.email || '';
    if (username) {
      localStorage.setItem("username", username);
    }
  }

  getInfoEvent() {
    const event = JSON.parse(localStorage.getItem("event") as string);

    this.dateEvent.set(event.date_event);
    this.timeEvent.set(event.time_event);
    this.moneyEvent.set(event.money_event);
    this.startEvent.set(event.start_event);
    this.uploadGift.set(event.upload_gift);
  }
}
