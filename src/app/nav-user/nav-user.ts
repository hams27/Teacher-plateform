import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth';

@Component({
  selector: 'app-nav-user',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './nav-user.html',
  styleUrl: './nav-user.scss'
})
export class NavUser {
  auth = inject(AuthService);
  private router = inject(Router);

  logout(): void {
    this.auth.logout().then(() => this.router.navigate(['/']));
  }
}
