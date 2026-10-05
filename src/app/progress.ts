import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, doc, docData, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface LessonProgress {
  watched?: boolean;    // شاف الدرس كامل
  passed?: boolean;     // خلّص الدرس (نجح في الامتحان، أو مفيش امتحان)
  bestScore?: number;   // أعلى درجة % (لو فيه امتحان)
  lastScore?: number;   // آخر درجة %
  attempts?: number;    // عدد المحاولات
}

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  lessons: Record<string, LessonProgress>;
}

/** درجة النجاح في الامتحان القصير */
export const PASS_PERCENT = 60;

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  /** تقدم الطالب في كورس واحد */
  getCourseProgress(uid: string, courseId: string): Observable<Record<string, LessonProgress>> {
    return runInInjectionContext(this.injector, () =>
      (docData(doc(this.firestore, `users/${uid}/progress/${courseId}`)) as Observable<CourseProgress | undefined>).pipe(
        map(d => d?.lessons ?? {})
      )
    );
  }

  /** تقدم الطالب في كل الكورسات */
  getAll(uid: string): Observable<CourseProgress[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(collection(this.firestore, `users/${uid}/progress`), {
        idField: 'courseId'
      }) as Observable<CourseProgress[]>)
    );
  }

  /** merge: بيدمج الحصة دي من غير ما يمسح باقي الحصص */
  saveLesson(uid: string, courseId: string, courseTitle: string, lessonId: string, data: LessonProgress) {
    return runInInjectionContext(this.injector, () =>
      setDoc(
        doc(this.firestore, `users/${uid}/progress/${courseId}`),
        { courseTitle, updatedAt: serverTimestamp(), lessons: { [lessonId]: data } },
        { merge: true }
      )
    );
  }
}