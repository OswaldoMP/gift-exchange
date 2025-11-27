import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms'
import { SupabaseService } from '../services/supabase-service.service'
import { RouterLink } from '@angular/router';


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
  password = signal<string>('');
  isLoading = signal<boolean>(false);
  showMagicLink = signal<boolean>(true);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly formBuilder: FormBuilder
  ) { }
  loading = false
  ngOnInit() {
    this.signInForm = this.formBuilder.group({
      email: '',
    })
  }
  async onSubmit(): Promise<void> {
    try {
      this.isLoading.set(true);
      this.loading = true
      const email = this.signInForm.value.email as string
      const { error } = await this.supabase.signIn(email)
      if (error) throw error
      alert('Magic link enviado! Revisa tu correo.')
    } catch (error) {
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
