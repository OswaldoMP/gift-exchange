import { Component, OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SupabaseService } from '../app/services/supabase-service.service';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  constructor(private readonly supabase: SupabaseService) {}

  title = 'exchange-client';
  session: any;

    ngOnInit() {
    this.session = this.supabase.session
    this.supabase.authChanges((_, session) => (this.session = session))
  }
}
