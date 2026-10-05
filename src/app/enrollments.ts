import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, query, where, doc, docData, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface Enrollment {
  uid: string;
  courseId: string;
  courseTitle: string;
  price: number;
  status: 'active';
  createdAt?: any;
}

/**
 * اشتراكات الطلاب في الكورسات.
 * كل اشتراك مستند واحد في collection اسمه `enrollments` والـ id بتاعه: `${uid}_${courseId}`
 * (عشان الطالب ميشتركش في نفس الكورس مرتين، وعشان قواعد Firestore تقدر تتأكد من صاحب المستند).
 */
@Injectable({ providedIn: 'root' })
export class EnrollmentsService {
  private firestore: Firestore = inject(Firestore);
  private injector: Injector = inject(Injector);

  private idOf(uid: string, courseId: string): string {
    return `${uid}_${courseId}`;
  }

  /** بيرجع true لو الطالب مشترك في الكورس (وبيتحدّث لحظيًا) */
  isEnrolled(uid: string, courseId: string): Observable<boolean> {
    return runInInjectionContext(this.injector, () =>
      (docData(doc(this.firestore, `enrollments/${this.idOf(uid, courseId)}`)) as Observable<Enrollment | undefined>).pipe(
        map(d => !!d && d.status === 'active')
      )
    );
  }

  /** ids الكورسات اللي الطالب مشترك فيها */
  getUserCourseIds(uid: string): Observable<string[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(query(collection(this.firestore, 'enrollments'), where('uid', '==', uid))) as Observable<Enrollment[]>).pipe(
        map(list => list.filter(e => e.status === 'active').map(e => e.courseId))
      )
    );
  }

  /** تسجيل اشتراك الطالب. لما نربط بوابة دفع، الاستدعاء ده هيتنقل لسيرفر بعد تأكيد الدفع. */
  enroll(uid: string, courseId: string, courseTitle: string, price: number) {
    return runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, `enrollments/${this.idOf(uid, courseId)}`), {
        uid,
        courseId,
        courseTitle,
        price,
        status: 'active',
        createdAt: serverTimestamp()
      })
    );
  }
}