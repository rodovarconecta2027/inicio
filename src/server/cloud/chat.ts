import crypto from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { hasPagePermission } from '../../lib/permissions';
import type { Employee } from '../../types';

const fail = (message: string, status = 400): never => { throw Object.assign(new Error(message), { status }); };
const identifier = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
export const membershipId = (conversationId: string, uid: string) =>
  `${conversationId}__${uid}`;

/** Server-only service. Every operation reloads approval/membership inside its transaction. */
export class FirestoreChatService {
  constructor(private readonly db: Firestore) {}

  private async authorized(tx: Transaction, uid: string) {
    if (!identifier(uid)) fail('Sessão inválida.', 401);
    const user = (await tx.get(this.db.collection('users').doc(uid))).data();
    if (!user?.active || user.approvalStatus !== 'APROVADO') fail('Conta sem acesso autorizado.', 403);
    if (user!.accessLevel === 'ADMINISTRADOR') {
      const policy = (await tx.get(this.db.collection('system_settings').doc('security'))).data();
      if (policy?.protectedAdminUid !== uid) fail('Administrador não autorizado.', 403);
    }
    return user!;
  }

  private communication(user: any) {
    if (!hasPagePermission(user as Employee, 'mensagens') || !hasPagePermission(user as Employee, 'grupos')) {
      fail('Perfil sem acesso à comunicação interna.', 403);
    }
  }

  private async member(tx: Transaction, uid: string, conversationId: string) {
    const user = await this.authorized(tx, uid);
    this.communication(user);
    if (!identifier(conversationId)) fail('Conversa inválida.');
    const ref = this.db.collection('conversation_members').doc(membershipId(conversationId, uid));
    const member = (await tx.get(ref)).data();
    if (!member?.active || member.userId !== uid || member.conversationId !== conversationId) fail('Conversa não autorizada.', 403);
    return { user, member: member!, ref };
  }

  async create(uid: string, input: { participants: string[]; name?: string; isGroup?: boolean; key: string }) {
    if (!input || !Array.isArray(input.participants) || input.participants.length > 99 ||
        input.participants.some(id => typeof id !== 'string' || !identifier(id)) ||
        typeof input.key !== 'string' || !identifier(input.key)) fail('Confira os participantes e identificador de envio.');
    const participants = [...new Set([uid, ...input.participants])].sort();
    if (participants.length < 2 || (!input.isGroup && participants.length !== 2)) fail('Selecione os participantes da conversa.');
    const name = String(input.name || '').trim();
    if (input.isGroup && (name.length < 3 || name.length > 140)) fail('O nome do grupo deve ter de 3 a 140 caracteres.');
    // One deterministic ID for a pair. Group retries reuse their operation key.
    const id = crypto.createHash('sha256').update(input.isGroup ? `group:${uid}:${input.key}` : `direct:${participants.join(':')}`).digest('hex');
    const ref = this.db.collection('conversations').doc(id);
    return this.db.runTransaction(async tx => {
      for (const participant of participants) this.communication(await this.authorized(tx, participant));
      const existing = await tx.get(ref);
      if (existing.exists) return { id, ...existing.data() };
      const now = new Date().toISOString();
      const conversation = { isGroup: Boolean(input.isGroup), name: input.isGroup ? name : '',
        createdBy: uid, createdAtIso: now, updatedAtIso: now, messageCount: 0, lastMessage: '' };
      tx.create(ref, conversation);
      for (const userId of participants) {
        const member = { conversationId: id, userId, active: true, role: userId === uid ? 'owner' : 'member', lastReadSequence: 0, joinedAtIso: now };
        tx.create(this.db.collection('conversation_members').doc(membershipId(id, userId)), member);
        if (input.isGroup) tx.create(this.db.collection('group_members').doc(membershipId(id, userId)), member);
      }
      if (input.isGroup) tx.create(this.db.collection('groups').doc(id), { conversationId: id, name, createdBy: uid, createdAtIso: now });
      tx.create(this.db.collection('audit_logs').doc(), { actorId: uid, action: 'CHAT_CREATED', targetId: id, atIso: now });
      return { id, ...conversation };
    });
  }

  async send(uid: string, conversationId: string, text: string, key: string) {
    if (typeof text !== 'string' || !text.trim() || text.length > 2000 || !identifier(key)) fail('Informe mensagem de até 2.000 caracteres e identificador de envio.');
    const id = crypto.createHash('sha256').update(JSON.stringify([conversationId, uid, key])).digest('hex');
    return this.db.runTransaction(async tx => {
      await this.member(tx, uid, conversationId);
      const conversationRef = this.db.collection('conversations').doc(conversationId);
      const conversation = await tx.get(conversationRef);
      if (!conversation.exists) fail('Conversa não encontrada.', 404);
      const ref = this.db.collection('messages').doc(id);
      const existing = await tx.get(ref);
      if (existing.exists) {
        if (existing.data()!.text !== text.trim()) fail('Este envio já foi usado para outra mensagem.', 409);
        return { id, ...existing.data() };
      }
      const sequence = Number(conversation.data()!.messageCount || 0) + 1;
      const now = new Date().toISOString();
      const message = { conversationId, senderId: uid, text: text.trim(), sequence, createdAtIso: now, editedAtIso: null, deleted: false };
      tx.create(ref, message);
      tx.update(conversationRef, { messageCount: sequence, lastMessage: text.trim().slice(0, 160), updatedAtIso: now });
      return { id, ...message };
    });
  }

  async updateMessage(uid: string, messageId: string, text: string | null) {
    if (!identifier(messageId) || (text !== null && (typeof text !== 'string' || !text.trim() || text.length > 2000))) fail('Mensagem inválida.');
    return this.db.runTransaction(async tx => {
      const ref = this.db.collection('messages').doc(messageId);
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) fail('Mensagem não encontrada.', 404);
      const message = snapshot.data()!;
      const { member } = await this.member(tx, uid, message.conversationId);
      if (message.senderId !== uid && !(text === null && member.role === 'owner')) fail('Você não pode alterar esta mensagem.', 403);
      if (message.deleted) fail('A mensagem já foi removida.', 409);
      const now = new Date().toISOString();
      const patch = { text: text === null ? '' : text.trim(), deleted: text === null, editedAtIso: now };
      tx.update(ref, patch);
      tx.create(this.db.collection('audit_logs').doc(), { actorId: uid, action: text === null ? 'MESSAGE_REMOVED' : 'MESSAGE_EDITED', targetId: messageId, atIso: now });
      return { id: messageId, ...message, ...patch };
    });
  }

  async read(uid: string, conversationId: string, sequence: number) {
    if (!Number.isSafeInteger(sequence) || sequence < 0) fail('Posição de leitura inválida.');
    return this.db.runTransaction(async tx => {
      const { member, ref } = await this.member(tx, uid, conversationId);
      const conversation = (await tx.get(this.db.collection('conversations').doc(conversationId))).data();
      if (!conversation || sequence > conversation.messageCount) fail('Posição de leitura não corresponde ao histórico.');
      const lastReadSequence = Math.max(Number(member.lastReadSequence || 0), sequence);
      const receipt = { conversationId, userId: uid, lastReadSequence, readAtIso: new Date().toISOString() };
      tx.update(ref, { lastReadSequence });
      tx.set(this.db.collection('message_reads').doc(membershipId(conversationId, uid)), receipt);
      return receipt;
    });
  }
}
