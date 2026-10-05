import { Injectable, Injector, inject, runInInjectionContext } from '@angular/core';
import {
  Firestore, collection, collectionData, collectionGroup, collectionSnapshots,
  doc, docData, setDoc, serverTimestamp
} from '@angular/fire/firestore';
import { Observable, map } from 'rxjs';

export interface LessonProgress {
  watched?: boolean;
  passed?: boolean;
  bestScore?: number;
  lastScore?: number;
  attempts?: number;
}

export interface CourseProgress {
  courseId: string;
  courseTitle: string;
  userName?: string;
  updatedAt?: any;
  lessons: Record<string, LessonProgress>;
}

/** تقدم طالب في كورس (للأدمن) */
export interface StudentCourseProgress extends CourseProgress {
  uid: string;
}

export const PASS_PERCENT = 60;

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  getCourseProgress(uid: string, courseId: string): Observable<Record<string, LessonProgress>> {
    return runInInjectionContext(this.injector, () =>
      (docData(doc(this.firestore, `users/${uid}/progress/${courseId}`)) as Observable<CourseProgress | undefined>).pipe(
        map(d => d?.lessons ?? {})
      )
    );
  }

  getAll(uid: string): Observable<CourseProgress[]> {
    return runInInjectionContext(this.injector, () =>
      (collectionData(collection(this.firestore, `users/${uid}/progress`), {
        idField: 'courseId'
      }) as Observable<CourseProgress[]>)
    );
  }

  /** للأدمن: تقدم كل الطلاب في كل الكورسات */
  getAllStudents(): Observable<StudentCourseProgress[]> {
    return runInInjectionContext(this.injector, () =>
      collectionSnapshots(collectionGroup(this.firestore, 'progress')).pipe(
        map(snaps =>
          snaps.map(s => ({
            ...(s.data() as CourseProgress),
            courseId: s.id,
            uid: s.ref.parent.parent?.id ?? ''
          }))
        )
      )
    );
  }

  saveLesson(
    uid: string, courseId: string, courseTitle: string, lessonId: string,
    data: LessonProgress, userName?: string
  ) {
    return runInInjectionContext(this.injector, () =>
      setDoc(
        doc(this.firestore, `users/${uid}/progress/${courseId}`),
        {
          courseTitle,
          ...(userName ? { userName } : {}),
          updatedAt: serverTimestamp(),
          lessons: { [lessonId]: data }
        },
        { merge: true }
      )
    );
  }
}