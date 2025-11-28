// import { Component, signal } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms'
// import { SupabaseService } from '../services/supabase-service.service'
// import { RouterLink, ActivatedRoute } from '@angular/router';
// import { Participant } from '../models/participant-entity';


// @Component({
//   selector: 'app-auth',
//   standalone: true,
//   imports: [ReactiveFormsModule, FormsModule, RouterLink, CommonModule],
//   templateUrl: './auth.component.html',
//   styleUrl: './auth.component.css'
// })
// export class AuthComponent {
//   signInForm!: FormGroup

//   email = signal<string>('');
//   name = signal<string>('');
//   isLoading = signal<boolean>(false);
//   showMagicLink = signal<boolean>(true);
//   isLogin: string | null = "false";
//   password = signal<string>('');

//   constructor(
//     private readonly supabase: SupabaseService,
//     private readonly formBuilder: FormBuilder,
//     private readonly route: ActivatedRoute
//   ) { }
//   loading = false

//     onLogin(): void {
//     this.isLoading.set(true);
//     // Simular proceso de login
//     setTimeout(() => {
//       this.isLoading.set(false);
//     }, 2000);
//   }

//   ngOnInit() {
//     this.signInForm = this.formBuilder.group({
//       email: '',
//       name: ''
//     });
//     this.isLogin = this.route.snapshot.paramMap.get('is_login');
//     console.log("[isLogin params] => ", this.isLoading)
//   }
//   async onSubmit(): Promise<void> {
//     try {
//       this.supabase.signOut();
//       this.isLoading.set(true);
//       this.loading = true;
//       const email = this.signInForm.value.email as string;
//       const name = this.signInForm.value.name as string;
//       const { error, data } = await this.supabase.signIn(email);
//       if (error) throw error;

//       console.log("[DATA AUTH session] => ", this.supabase.session)
//       console.log("[DATA AUTH _sesion] => ", this.supabase._session)
//       await this.supabase.saveParticipant({name, gifts: [], auth_id: this.supabase._session?.user.id})
//       alert('Magic link enviado! Revisa tu correo.')
//     } catch (error) {
//       console.log(["LOGS error => ", error])
//       if (error instanceof Error) {
//         alert(error.message)
//       }
//     } finally {
//       this.signInForm.reset()
//       this.loading = false
//       this.isLoading.set(false);
//     }
//   }

//   // onLogin(): void {
//   //   this.isLoading.set(true);
//   //   // Simular proceso de login
//   //   setTimeout(() => {
//   //     this.isLoading.set(false);
//   //   }, 2000);
//   // }

//   // onSendMagicLink(): void {
//   //   this.isLoading.set(true);
//   //   // Simular envío de magic link
//   //   setTimeout(() => {
//   //     this.isLoading.set(false);
//   //     alert('Magic link enviado! Revisa tu correo.');
//   //   }, 1500);
//   // }

//   toggleLoginMethod(): void {
//     this.showMagicLink.set(!this.showMagicLink());
//   }
// }

// New component
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



  ngOnInit(): void {
    this.validateRedirect();
  }

  validateRedirect() {
    const { info, token, email, succes, } = this.route.snapshot.queryParams;
    console.log(token, email, succes, info);

    this.supabaseService.singInByToken(token).then((res) => {
      const status = res.data.user?.role;
      if (status === 'authenticated') {
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
      console.log(error.message)

      if (error.message === "Email not confirmed") {
        this.alertService.info("Correo no confirmado", `Revisa tu correo, para validar tu cuenta y participar en nuestro intercambios 2025!`);
      } else if (error.message === 'Invalid login credentials') {
        this.alertService.error("Datos incorrectos", `Correo o password incorrectos`, 4000);
      }

      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(false);
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
}