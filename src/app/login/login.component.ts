import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {
  apiKey   = '';
  loading  = false;
  error    = '';

  constructor(private auth: AuthService, private router: Router) {}

  onSubmit(): void {
    if (!this.apiKey.trim()) {
      this.error = 'Please enter your Redmine API key.';
      return;
    }

    this.loading = true;
    this.error   = '';

    this.auth.login(this.apiKey.trim()).subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: err => {
        this.loading = false;
        this.error = err.status === 401
          ? 'Invalid API key. Check your Redmine profile.'
          : 'Could not connect to Redmine. Try again.';
      }
    });
  }
}
