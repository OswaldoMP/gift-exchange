import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms'
import { SupabaseService } from '../services/supabase-service.service'
import { RouterLink, ActivatedRoute } from '@angular/router';
import { Participant } from '../models/participant-entity';


@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [ReactiveFormsModule, FormsModule, RouterLink, CommonModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.css'
})
export class AuthComponent {
  signInForm!: FormGroup

  email = signal<string>('');
  name = signal<string>('');
  isLoading = signal<boolean>(false);
  showMagicLink = signal<boolean>(true);
  isLogin: string | null = "false";

  constructor(
    private readonly supabase: SupabaseService,
    private readonly formBuilder: FormBuilder,
    private readonly route: ActivatedRoute
  ) { }
  loading = false
  ngOnInit() {
    this.signInForm = this.formBuilder.group({
      email: '',
      name: ''
    });
    this.isLogin = this.route.snapshot.paramMap.get('is_login');
    console.log("[isLogin params] => ", this.isLoading)
  }
  async onSubmit(): Promise<void> {
    try {
      this.supabase.signOut();
      this.isLoading.set(true);
      this.loading = true;
      const email = this.signInForm.value.email as string;
      const name = this.signInForm.value.name as string;
      const { error, data } = await this.supabase.signIn(email);
      if (error) throw error;
      
      console.log("[DATA AUTH session] => ", this.supabase.session)
      console.log("[DATA AUTH _sesion] => ", this.supabase._session)
      await this.supabase.saveParticipant({name, gifts: [], auth_id: this.supabase._session?.user.id})
      alert('Magic link enviado! Revisa tu correo.')
    } catch (error) {
      console.log(["LOGS error => ", error])
      if (error instanceof Error) {
        alert(error.message)
      }
    } finally {
      this.signInForm.reset()
      this.loading = false
      this.isLoading.set(false);
    }
  }

  // onLogin(): void {
  //   this.isLoading.set(true);
  //   // Simular proceso de login
  //   setTimeout(() => {
  //     this.isLoading.set(false);
  //   }, 2000);
  // }

  // onSendMagicLink(): void {
  //   this.isLoading.set(true);
  //   // Simular envío de magic link
  //   setTimeout(() => {
  //     this.isLoading.set(false);
  //     alert('Magic link enviado! Revisa tu correo.');
  //   }, 1500);
  // }

  toggleLoginMethod(): void {
    this.showMagicLink.set(!this.showMagicLink());
  }
}
