import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AlertService } from '../services/alert-service.service';
import { SupabaseService } from '../services/supabase-service.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css']
})
export class RegisterComponent implements OnInit{
  private alertService = inject(AlertService);
  private supabaseService = inject(SupabaseService);
  private router = inject(Router);


  fullName = signal<string>('');
  email = signal<string>('');
  password = signal<string>('');
  showPassword = signal<boolean>(false);
  isLoading = signal<boolean>(false);

  dateEvent = signal<string>("");
  timeEvent = signal<string>("");
  moneyEvent = signal<string>("");
  startEvent = signal<string>("");
  uploadGift = signal<string>("");

  ngOnInit(): void {
    this.getInfoEvent(); 
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
    // Simular proceso de registro
    const { error, data } = await this.supabaseService.signUp(this.email(), this.password(), this.fullName());
    if (error) {
      this.alertService.error("Registro fallido", `${this.fullName()} hemos tenido un problema al crear tu cuenta. Intentalo mas tarde. 
      \n Si el problema sigue contacta a soporte!`);
      this.isLoading.set(false);
      return;
    }
    this.isLoading.set(false);

    this.alertService.success(
      `¡Bienvenido ${this.fullName()}!`,
      'Tu cuenta ha sido creada.'
    );

    this.alertService.info(
      `${this.fullName()}!`,
      'Revisa tu correo, para validar tu cuenta y participar en nuestro intercambios 2025!'
    );

    this.setLocalStorage(data);
    setTimeout(() => {
      this.router.navigate(['/login']);
    }, 3800);

  }

  async setLocalStorage(data: any) {
    localStorage.setItem("uuid", data.user.id);
    localStorage.setItem("username", data.user.user_metadata['username']);
    this.supabaseService.saveParticipant({
      oauth_id: data.user.id,
      gifts: [],
      name: data.user.user_metadata['username'],
      avatarUrl: ""
    });
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
