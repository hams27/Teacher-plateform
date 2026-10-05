import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../auth';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.scss'
})
export class AdminLogin {
  email = '';
  password = '';
  errorMessage = signal('');
  loading = signal(false);

  constructor(private authService: AuthService, private router: Router) {}

  onSubmit(): void {
    this.errorMessage.set('');
    this.loading.set(true);

    this.authService.login(this.email, this.password)
      .then(async cred => {
        if (!this.authService.isAdminEmail(cred.user.email)) {
          // حساب طالب مش مدرس
          await this.authService.logout();
          this.loading.set(false);
          this.errorMessage.set('الحساب ده مش حساب المدرس');
          return;
        }
        this.loading.set(false);
        this.router.navigate(['/admin']);
      })
      .catch(() => {
        this.loading.set(false);
        this.errorMessage.set('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      });
  }
}

