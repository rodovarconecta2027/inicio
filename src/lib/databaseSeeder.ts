import {
  db,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  FirebaseUser,
} from './firebase';
import {
  INITIAL_ANNOUNCEMENTS,
  INITIAL_CHATS,
  INITIAL_DOCUMENTS,
  INITIAL_EMPLOYEES,
  INITIAL_EVENTS,
  INITIAL_INVITES,
  INITIAL_NOTIFICATIONS,
  INITIAL_REQUESTS,
} from '../data/initialData';
import { INITIAL_FREIGHTS } from './freightDatabase';
import { Department, Employee, UserRole } from '../types';

export const BOOTSTRAPPED_ADMIN_EMAIL = 'indicabrasiloficiall@gmail.com';

/**
 * Provisions or loads the authenticated user's profile in Firestore
 * (/users/{uid}/public/profile, /users/{uid}/private/info, and /admins/{uid}).
 */
export async function provisionAuthenticatedUserInFirestore(
  user: FirebaseUser
): Promise<Employee> {
  const isBootstrappedAdmin =
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  let assignedRole: UserRole = isBootstrappedAdmin ? 'DIRETORIA' : 'FUNCIONARIO';
  let assignedDept: Department = isBootstrappedAdmin ? 'Diretoria' : 'Administrativo';
  let assignedTitle = isBootstrappedAdmin
    ? 'Diretor Executivo'
    : 'Analista Administrativo Sênior';
  let assignedPhoneExt = '71 9 9920-2476';
  let assignedJoinedAt = new Date().toLocaleDateString('pt-BR');

  // 1. Check if /admins/{uid} exists or should be created for bootstrapped admin
  try {
    const adminRef = doc(db, 'admins', user.uid);
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      const adminData = adminSnap.data();
      if (adminData.role === 'DIRETORIA' || adminData.role === 'ADMINISTRADOR') {
        assignedRole = adminData.role;
      }
    } else if (isBootstrappedAdmin) {
      await setDoc(adminRef, {
        userId: user.uid,
        role: 'DIRETORIA',
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.debug('Admin check/provision info:', err);
  }

  // 2. Check if /users/{uid}/public/profile already exists
  const publicRef = doc(db, 'users', user.uid, 'public', 'profile');
  try {
    const pubSnap = await getDoc(publicRef);
    if (pubSnap.exists()) {
      const data = pubSnap.data();
      assignedRole = (data.accessLevel as UserRole) || assignedRole;
      assignedDept = (data.department as Department) || assignedDept;
      assignedTitle = data.roleTitle || assignedTitle;
      assignedPhoneExt = data.phoneExt || assignedPhoneExt;
      assignedJoinedAt = data.joinedAt || assignedJoinedAt;
    } else {
      await setDoc(publicRef, {
        userId: user.uid,
        name: (user.displayName || 'Colaborador RODOVAR').slice(0, 120),
        roleTitle: assignedTitle.slice(0, 120),
        department: assignedDept,
        accessLevel: assignedRole,
        avatar: (user.photoURL || '/assets/avatar-joao.jpg').slice(0, 300),
        phoneExt: assignedPhoneExt.slice(0, 40),
        joinedAt: assignedJoinedAt.slice(0, 30),
        active: true,
        createdAt: serverTimestamp(),
      });
    }
  } catch (err) {
    console.debug('Public profile provision info:', err);
  }

  // 3. Upsert /users/{uid}/private/info
  if (user.email) {
    const privateRef = doc(db, 'users', user.uid, 'private', 'info');
    try {
      await setDoc(
        privateRef,
        {
          userId: user.uid,
          email: user.email.slice(0, 160),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      console.debug('Private info provision info:', err);
    }
  }

  return {
    id: user.uid,
    name: user.displayName || (isBootstrappedAdmin ? 'Diretoria RODOVAR' : 'João Silva'),
    email: user.email || 'joao.silva@rodovar.com.br',
    roleTitle: assignedTitle,
    department: assignedDept,
    accessLevel: assignedRole,
    avatar: user.photoURL || '/assets/avatar-joao.jpg',
    phoneExt: assignedPhoneExt,
    joinedAt: assignedJoinedAt,
    active: true,
    location: 'Matriz São Paulo - SP',
    phone: assignedPhoneExt,
    role: assignedRole,
  };
}

/**
 * Seeds the Cloud Firestore database with the initial corporate records
 * so all collections are initialized and ready for real-time operation.
 */
export async function seedCorporateDatabaseInFirestore(
  user: FirebaseUser,
  currentEmployee: Employee
): Promise<{ syncedCount: number; isAdminSeed: boolean }> {
  let syncedCount = 0;
  const isBootstrappedAdmin =
    user.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();

  let hasAdminPrivileges = isBootstrappedAdmin;
  if (!hasAdminPrivileges) {
    try {
      const adminSnap = await getDoc(doc(db, 'admins', user.uid));
      hasAdminPrivileges = adminSnap.exists();
    } catch {
      hasAdminPrivileges = false;
    }
  }

  // 1. Seed User's Initial Requests (/requests/{id}) — Allowed for any verified user
  for (const req of INITIAL_REQUESTS.slice(0, 3)) {
    const reqId = `seed-${req.id}-${user.uid.slice(0, 6)}`;
    try {
      const ref = doc(db, 'requests', reqId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          protocol: req.protocol.slice(0, 30),
          requesterId: user.uid,
          requesterName: currentEmployee.name.slice(0, 120),
          requesterDepartment: currentEmployee.department.slice(0, 60),
          targetDepartment: req.targetDepartment.slice(0, 60),
          subject: req.subject.slice(0, 200),
          description: req.description.slice(0, 3000),
          priority: req.priority,
          status: 'Aberta',
          createdAtIso: req.createdAtIso.slice(0, 40),
          originalDueAtIso: req.originalDueAtIso.slice(0, 40),
          currentDueAtIso: req.currentDueAtIso.slice(0, 40),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        syncedCount++;
      }
    } catch (err) {
      console.debug('Seed request info:', err);
    }
  }

  // 2. Seed User's Direct Chat Thread (/chats/{id}) — Allowed for any verified user
  for (const chat of INITIAL_CHATS.filter((c) => !c.isGroup).slice(0, 2)) {
    const chatId = `seed-${chat.id}-${user.uid.slice(0, 6)}`;
    try {
      const ref = doc(db, 'chats', chatId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          isGroup: false,
          name: chat.name.slice(0, 140),
          roleOrDept: chat.roleOrDept.slice(0, 160),
          department: chat.department || 'Operacional',
          participantsCount: 2,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        syncedCount++;
      }
    } catch (err) {
      console.debug('Seed direct chat info:', err);
    }
  }

  // 3. Seed User's Notifications (/notifications/{id}) — Allowed for any verified user
  const allowedNotifTypes = [
    'comunicado',
    'mensagem',
    'solicitacao',
    'alerta_sla',
    'evento',
    'documento',
    'prazo',
  ];
  for (const notif of INITIAL_NOTIFICATIONS.slice(0, 4)) {
    const notifId = `seed-${notif.id}-${user.uid.slice(0, 6)}`;
    const safeType = allowedNotifTypes.includes(notif.type) ? notif.type : 'comunicado';
    try {
      const ref = doc(db, 'notifications', notifId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          recipientId: user.uid,
          type: safeType,
          dotColor: notif.dotColor,
          title: notif.title.slice(0, 160),
          subtitle: notif.subtitle.slice(0, 240),
          timeLabel: notif.timeLabel.slice(0, 40),
          read: Boolean(notif.read),
          targetSection: notif.targetSection.slice(0, 40),
          createdAt: serverTimestamp(),
        });
        syncedCount++;
      }
    } catch (err) {
      console.debug('Seed notification info:', err);
    }
  }

  // 4. If user has Admin/Diretoria privileges in Firestore, also seed global collections
  if (hasAdminPrivileges) {
    // 4a. Official Employee Directory Public Profiles (/users/{id}/public/profile)
    for (const emp of INITIAL_EMPLOYEES) {
      try {
        const pubRef = doc(db, 'users', emp.id, 'public', 'profile');
        const snap = await getDoc(pubRef);
        if (!snap.exists()) {
          await setDoc(pubRef, {
            userId: emp.id,
            name: emp.name.slice(0, 120),
            roleTitle: emp.roleTitle.slice(0, 120),
            department: emp.department,
            accessLevel: emp.accessLevel,
            avatar: (emp.avatar || '/assets/avatar-joao.jpg').slice(0, 300),
            phoneExt: emp.phoneExt.slice(0, 40),
            joinedAt: emp.joinedAt.slice(0, 30),
            active: emp.active !== false,
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed directory profile info:', err);
      }
    }

    // 4b. Corporate Group Chats (/chats/{id})
    for (const grp of INITIAL_CHATS.filter((c) => c.isGroup)) {
      try {
        const grpRef = doc(db, 'chats', grp.id);
        const snap = await getDoc(grpRef);
        if (!snap.exists()) {
          const payload: Record<string, unknown> = {
            isGroup: true,
            name: grp.name.slice(0, 140),
            roleOrDept: grp.roleOrDept.slice(0, 160),
            department: grp.department || 'Todos',
            participantsCount: grp.participantsCount || 4,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (grp.pinnedNotice) {
            payload.pinnedNotice = grp.pinnedNotice.slice(0, 400);
          }
          await setDoc(grpRef, payload);
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed group chat info:', err);
      }
    }

    // 4c. Official Announcements (/announcements/{id})
    for (const ann of INITIAL_ANNOUNCEMENTS) {
      try {
        const ref = doc(db, 'announcements', ann.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            title: ann.title.slice(0, 180),
            summary: ann.summary.slice(0, 400),
            content: ann.content.slice(0, 5000),
            authorId: user.uid,
            authorName: ann.authorName.slice(0, 120),
            department: ann.department.slice(0, 60),
            dateFormatted: ann.dateFormatted.slice(0, 30),
            coverImage: (ann.coverImage || '/assets/aistudio/010203_5a4289e5.png').slice(0, 300),
            category: ann.category,
            priority: ann.priority,
            targetAudience: String(ann.targetAudience).slice(0, 60),
            requireReadConfirmation: Boolean(ann.requireReadConfirmation),
            pinned: Boolean(ann.pinned),
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed announcement info:', err);
      }
    }

    // 4d. Corporate Events (/events/{id})
    const validBadgeLabels = [
      'Importante',
      'Evento',
      'Reunião',
      'Treinamento',
      'TREINAMENTO SSMA',
      'REUNIÃO EXECUTIVA',
      'INTEGRAÇÃO RH',
    ];
    for (const evt of INITIAL_EVENTS) {
      try {
        const ref = doc(db, 'events', evt.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const safeBadge = validBadgeLabels.includes(evt.badgeLabel)
            ? evt.badgeLabel
            : 'Treinamento';
          await setDoc(ref, {
            day: evt.day.slice(0, 4),
            monthShort: evt.monthShort.slice(0, 10),
            dateIso: evt.dateIso.slice(0, 20),
            time: evt.time.slice(0, 40),
            location: evt.location.slice(0, 160),
            title: evt.title.slice(0, 180),
            organizer: evt.organizer.slice(0, 120),
            department: String(evt.department).slice(0, 60),
            badgeLabel: safeBadge,
            badgeColor: evt.badgeColor,
            description: evt.description.slice(0, 2000),
            authorId: user.uid,
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed event info:', err);
      }
    }

    // 4e. Corporate Documents (/documents/{id})
    for (const docItem of INITIAL_DOCUMENTS) {
      try {
        const ref = doc(db, 'documents', docItem.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            title: docItem.title.slice(0, 180),
            category: docItem.category,
            version: docItem.version.slice(0, 20),
            updatedAt: docItem.updatedAt.slice(0, 30),
            author: docItem.author.slice(0, 120),
            authorId: user.uid,
            size: docItem.size.slice(0, 30),
            fileType: docItem.fileType,
            allowedDepartments: 'Todos',
            description: docItem.description.slice(0, 1500),
            contentPreview: docItem.contentPreview.slice(0, 4000),
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed document info:', err);
      }
    }

    // 4f. Employee Invites (/invites/{id})
    for (const inv of INITIAL_INVITES) {
      try {
        const ref = doc(db, 'invites', inv.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, {
            fullName: inv.fullName.slice(0, 120),
            email: inv.email.slice(0, 160),
            roleTitle: inv.roleTitle.slice(0, 120),
            department: inv.department.slice(0, 60),
            accessLevel: inv.accessLevel,
            token: inv.token.slice(0, 64),
            expiresAt: inv.expiresAt.slice(0, 40),
            status: inv.status,
            createdBy: user.uid,
            createdAt: serverTimestamp(),
          });
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed invite info:', err);
      }
    }

    // 4g. Corporate Freight Financial Records (/fretes_financeiro/{id})
    for (const frete of INITIAL_FREIGHTS) {
      try {
        const ref = doc(db, 'fretes_financeiro', frete.id);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          const payload: Record<string, unknown> = {
            code: frete.code.slice(0, 20),
            createdAtDate: frete.createdAtDate.slice(0, 20),
            createdAtIso: frete.createdAtIso.slice(0, 40),
            empresaMarca: frete.empresaMarca || 'RODOVAR',
            dataCarregamento: (frete.dataCarregamento || frete.createdAtDate).slice(0, 20),
            unidadeOperacional: frete.unidadeOperacional || 'BA - Salvador',
            comercialResponsavel: (frete.comercialResponsavel || 'Jeise / César').slice(0, 120),
            expedicaoResponsavel: (frete.expedicaoResponsavel || 'Marcos Silva').slice(0, 120),
            cliente: frete.cliente.slice(0, 120),
            origem: frete.origem.slice(0, 140),
            destino: frete.destino.slice(0, 140),
            dataColeta: frete.dataColeta.slice(0, 20),
            dataEntrega: frete.dataEntrega.slice(0, 20),
            valorFreteEmpresa: frete.valorFreteEmpresa || frete.valorTotal,
            valorFreteMotorista: frete.valorFreteMotorista || frete.valorTotal,
            regraTipo: frete.regraTipo,
            regraLabel: frete.regraLabel.slice(0, 40),
            percentualAdiantamento: frete.percentualAdiantamento,
            percentualSaldo: frete.percentualSaldo,
            valorTotal: frete.valorTotal,
            valorAdiantamento: frete.valorAdiantamento,
            valorSaldo: frete.valorSaldo,
            favorecido: frete.favorecido.slice(0, 120),
            banco: frete.banco.slice(0, 80),
            agencia: frete.agencia.slice(0, 30),
            conta: frete.conta.slice(0, 40),
            tipoChavePix: frete.tipoChavePix,
            chavePix: frete.chavePix.slice(0, 120),
            status: frete.status,
            adiantamentoPago: Boolean(frete.adiantamentoPago),
            entregaConfirmada: Boolean(frete.entregaConfirmada),
            saldoPago: Boolean(frete.saldoPago),
            solicitanteNome: frete.solicitanteNome.slice(0, 120),
            updatedAt: serverTimestamp(),
          };
          if (frete.telefoneCliente) payload.telefoneCliente = frete.telefoneCliente.slice(0, 30);
          if (frete.motoristaNome) payload.motoristaNome = frete.motoristaNome.slice(0, 120);
          if (frete.motoristaTelefone) payload.motoristaTelefone = frete.motoristaTelefone.slice(0, 30);
          if (frete.emergenciaNome) payload.emergenciaNome = frete.emergenciaNome.slice(0, 120);
          if (frete.emergenciaTelefone) payload.emergenciaTelefone = frete.emergenciaTelefone.slice(0, 30);
          if (frete.observacoes) payload.observacoes = frete.observacoes.slice(0, 1000);

          await setDoc(ref, payload);
          syncedCount++;
        }
      } catch (err) {
        console.debug('Seed freight financial info:', err);
      }
    }

    // 4h. Initial Audit Log (/audit_logs/seed-boot)
    try {
      const logRef = doc(db, 'audit_logs', `log-boot-${Date.now()}`);
      await setDoc(logRef, {
        timestamp: new Date().toLocaleString('pt-BR').slice(0, 40),
        actorId: user.uid,
        actor: currentEmployee.name.slice(0, 120),
        role: currentEmployee.accessLevel,
        action: 'SINCRONIZACAO_BANCO_FIRESTORE',
        details: 'Banco de dados Cloud Firestore inicializado e sincronizado com sucesso.',
        createdAt: serverTimestamp(),
      });
      syncedCount++;
    } catch (err) {
      console.debug('Seed audit log info:', err);
    }
  }

  return { syncedCount, isAdminSeed: hasAdminPrivileges };
}
