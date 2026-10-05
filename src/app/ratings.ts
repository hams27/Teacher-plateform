import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface Rating {
  id?: string;
  lessonId: string;
  lessonTitle: string;
  uid: string;
  userName: string;
  stars: number;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class RatingsService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  // الأحدث الأول
  getRatings(courseId: string): Observable<Rating[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(collection(this.firestore, `courses/${courseId}/ratings`), {
        idField: 'id'
      }) as Observable<Rating[]>).pipe(
        map(list =>
          [...list].sort(
            (a, b) =>
              (b.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER) -
              (a.createdAt?.seconds ?? Number.MAX_SAFE_INTEGER)
          )
        )
      )
    );
  }

  // تقييم واحد لكل طالب لكل درس (لو قيّم تاني بيتحدّث)
  rate(courseId: string, r: Omit<Rating, 'id' | 'createdAt'>) {
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `courses/${courseId}/ratings/${r.lessonId}_${r.uid}`), {
        ...r,
        createdAt: serverTimestamp()
      })
    );
  }
}
