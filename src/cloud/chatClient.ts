import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, startAfter,
  type Firestore, type QueryDocumentSnapshot, type DocumentData, type Unsubscribe,
} from 'firebase/firestore';

export interface CloudMessage {
  id: string; conversationId: string; senderId: string; text: string;
  sequence: number; createdAtIso: string; deleted: boolean;
}

/** Data adapter for the existing chat UI. Activate only with a verified cloud identity. */
export function createCloudChatClient(db: Firestore, uid: string) {
  return {
    listenConversations(onChange: (memberships: DocumentData[]) => void, onError: (error: Error) => void): Unsubscribe {
      return onSnapshot(query(collection(db, 'conversation_members'), where('userId', '==', uid),
        where('active', '==', true), limit(50)),
      snapshot => onChange(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))), onError);
    },
    listenMessages(conversationId: string, onChange: (messages: CloudMessage[]) => void, onError: (error: Error) => void): Unsubscribe {
      return onSnapshot(query(collection(db, 'messages'), where('conversationId', '==', conversationId),
        orderBy('sequence', 'desc'), limit(40)), snapshot =>
        onChange(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as CloudMessage).reverse()), onError);
    },
    async previousMessages(conversationId: string, cursor: QueryDocumentSnapshot<DocumentData>) {
      return getDocs(query(collection(db, 'messages'), where('conversationId', '==', conversationId),
        orderBy('sequence', 'desc'), startAfter(cursor), limit(40)));
    },
  };
}
