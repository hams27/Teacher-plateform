import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';
import { ADMIN_EMAIL } from './admin-config';

// حماية لوحة المدرس: لازم يكون مسجّل دخول *وبإيميل المدرس*
export const authGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(u =>
      u?.email && u.email.toLowerCase() === ADMIN_EMAIL.toLowerCase()
        ? true
        : router.createUrlTree(['/admin/login'])
    )
  );
};

// حماية صفحات الطالب (زي المفضلة): أي حساب مسجّل
export const studentGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(u =>
      u ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } })
    )
  );
};
