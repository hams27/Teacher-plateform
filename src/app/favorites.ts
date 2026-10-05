import { Injectable, Injector, inject, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Firestore, collection, collectionData, doc, setDoc, deleteDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, of } from 'rxjs';
import { catchError, distinctUntilChanged, map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth';

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);
  private auth = inject(AuthService);
  private router = inject(Router);

  // ids بتاعة الكورسات المفضلة للطالب الحالي
  ids = signal<ReadonlySet<string>>(new Set());

  constructor() {
    this.auth.currentUser$
      .pipe(
        map(u => u?.uid ?? null),
        distinctUntilChanged(),
        switchMap(uid =>
          uid ? this.list(uid).pipe(catchError(() => of([] as string[]))) : of([] as string[])
        )
      )
      .subscribe(ids => this.ids.set(new Set(ids)));
  }

  private list(uid: string): Observable<string[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(collection(this.firestore, `users/${uid}/favorites`), {
        idField: 'id'
      }) as Observable<{ id: string }[]>).pipe(map(list => list.map(x => x.id)))
    );
  }

  isFav(courseId?: string): boolean {
    return !!courseId && this.ids().has(courseId);
  }

  async toggle(courseId: string | undefined): Promise<void> {
    if (!courseId) return;
    const u = this.auth.currentUser();
    if (!u) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    try {
      const ref = runInInjectionContext(this.injector, () =>
        doc(this.firestore, `users/${u.uid}/favorites/${courseId}`)
      );
      if (this.isFav(courseId)) {
        await deleteDoc(ref);
      } else {
        await setDoc(ref, { courseId, createdAt: serverTimestamp() });
      }
    } catch (err) {
      console.error('favorites toggle failed', err);
      alert('معرفتش أحدّث المفضلة، جرّب تاني');
    }
  }
}
