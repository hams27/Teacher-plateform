import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, setDoc, deleteDoc,
  query, orderBy, limit, serverTimestamp
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface Testimonial {
  id?: string;      // = uid الطالب (رأي واحد لكل طالب)
  uid: string;
  userName: string;
  text: string;
  createdAt?: any;
}

export const TESTIMONIAL_MAX = 300;

@Injectable({ providedIn: 'root' })
export class TestimonialsService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  // آخر n آراء
  getLatest(n = 3): Observable<Testimonial[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'testimonials'), orderBy('createdAt', 'desc'), limit(n)),
        { idField: 'id' }
      ) as Observable<Testimonial[]>
    );
  }

  // للأدمن: كل الآراء
  getAll(): Observable<Testimonial[]> {
    return runInInjectionContext(this.injector, () =>
      collectionData(
        query(collection(this.firestore, 'testimonials'), orderBy('createdAt', 'desc')),
        { idField: 'id' }
      ) as Observable<Testimonial[]>
    );
  }

  // لو الطالب كتب رأي قبل كده بيتبدّل (وبيبقى الأحدث)
  save(uid: string, userName: string, text: string) {
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `testimonials/${uid}`), {
        uid,
        userName,
        text: text.trim().slice(0, TESTIMONIAL_MAX),
        createdAt: serverTimestamp()
      })
    );
  }

  remove(id: string) {
    return runInInjectionContext(this.injector, () =>
      deleteDoc(doc(this.firestore, `testimonials/${id}`))
    );
  }
}