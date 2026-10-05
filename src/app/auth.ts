import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Auth, User, user,
  signInWithEmailAndPassword, createUserWithEmailAndPassword,
  updateProfile, sendPasswordResetEmail, signOut
} from '@angular/fire/auth';
import { ADMIN_EMAIL } from './admin-config';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth: Auth = inject(Auth);

  currentUser$ = user(this.auth);

  // undefined = لسه بنتأكد، null = مفيش مستخدم، User = مسجّل دخول
  currentUser = signal<User | null | undefined>(undefined);
  private nameTick = signal(0);

  ready = computed(() => this.currentUser() !== undefined);
  isAdmin = computed(() => this.isAdminEmail(this.currentUser()?.email));
  displayName = computed(() => {
    this.nameTick();
    return this.currentUser()?.displayName ?? '';
  });

  constructor() {
    this.currentUser$.subscribe(u => this.currentUser.set(u));
  }

  isAdminEmail(email: string | null | undefined): boolean {
    return !!email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  }

  login(email: string, password: string) {
    return signInWithEmailAndPassword(this.auth, email, password);
  }

  async register(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(this.auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    this.nameTick.update(n => n + 1);
    return cred;
  }

  resetPassword(email: string) {
    return sendPasswordResetEmail(this.auth, email);
  }

  logout() {
    return signOut(this.auth);
  }
}
