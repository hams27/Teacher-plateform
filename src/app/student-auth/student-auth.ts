import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth';
import { SiteNav } from '../site-nav/site-nav';

@Component({
  selector: 'app-student-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, SiteNav],
  templateUrl: './student-auth.html',
  styleUrl: './student-auth.scss'
})
export class StudentAuth {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  mode: 'login' | 'register' = this.route.snapshot.data['mode'] === 'register' ? 'register' : 'login';

  name = '';
  email = '';
  password = '';

  loading = signal(false);
  error = signal('');
  info = signal('');

  async submit(): Promise<void> {
    this.error.set('');
    this.info.set('');

    if (!this.email.trim() || !this.password) {
      this.error.set('اكتب الإيميل وكلمة المرور');
      return;
    }
    if (this.mode === 'register' && !this.name.trim()) {
      this.error.set('اكتب اسمك');
      return;
    }

    this.loading.set(true);
    try {
      if (this.mode === 'register') {
        await this.auth.register(this.name.trim(), this.email.trim(), this.password);
      } else {
        await this.auth.login(this.email.trim(), this.password);
      }
      this.router.navigateByUrl(this.returnUrl());
    } catch (err: any) {
      this.error.set(this.message(err?.code));
    } finally {
      this.loading.set(false);
    }
  }

  async forgot(): Promise<void> {
    this.error.set('');
    this.info.set('');
    if (!this.email.trim()) {
      this.error.set('اكتب إيميلك الأول وبعدين دوس "نسيت كلمة المرور"');
      return;
    }
    try {
      await this.auth.resetPassword(this.email.trim());
      this.info.set('بعتنالك لينك على الإيميل لتغيير كلمة المرور (شوف الـ Spam كمان)');
    } catch (err: any) {
      this.error.set(this.message(err?.code));
    }
  }

  // نرجّع الطالب للصفحة اللي كان فيها (مع التأكد إن اللينك داخلي)
  private returnUrl(): string {
    const r = this.route.snapshot.queryParamMap.get('returnUrl');
    return r && r.startsWith('/') && !r.startsWith('//') ? r : '/';
  }

  private message(code: string | undefined): string {
    switch (code) {
      case 'auth/email-already-in-use': return 'الإيميل ده مسجّل قبل كده، جرّب تسجّل دخول';
      case 'auth/weak-password': return 'كلمة المرور ضعيفة، لازم 6 حروف أو أرقام على الأقل';
      case 'auth/invalid-email': return 'الإيميل مكتوب غلط';
      case 'auth/user-not-found':
      case 'auth/wrong-password':
      case 'auth/invalid-credential': return 'الإيميل أو كلمة المرور غلط';
      case 'auth/too-many-requests': return 'محاولات كتير، استنى شوية وجرّب تاني';
      case 'auth/network-request-failed': return 'فيه مشكلة في النت، جرّب تاني';
      default: return 'حصلت مشكلة، جرّب تاني';
    }
  }
}
