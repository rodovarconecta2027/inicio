import type { Express, RequestHandler } from 'express';
import { isDeepStrictEqual } from 'node:util';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { brandingAvatars, brandingImages } from '../../lib/brandingAssets.js';
import type { SystemConfig } from '../../types';
export function getDefaultSystemConfig(): SystemConfig {
  return {
    revision: 1,
    updatedAtIso: new Date().toISOString(),
    updatedBy: 'Sistema Inicial RODOVAR',
    sidebarPoster: {
      imageUrl: '/assets/aistudio/DSC00515_18c5e319.JPG',
      focusX: 50,
      focusY: 50,
      width: 600,
      height: 700,
    },
    topHeader: {
      imageUrl: '/assets/header-sunset.jpg',
      focusX: 50,
      focusY: 50,
      width: 1920,
      height: 240,
    },
    welcomeBanner: {
      carouselEnabled: false,
      intervalSeconds: 5,
      items: [
        {
          id: 'banner-default-1',
          imageUrl: '/assets/aistudio/010203_5a4289e5.png',
          altText: 'Frota Oficial RODOVAR — Sua carga em primeiro lugar!',
          isDecorative: false,
          focusX: 50,
          focusY: 50,
          width: 1920,
          height: 360,
        },
      ],
    },
    defaultAvatar: {
      imageUrl: '/assets/default-avatar.png',
      width: 1024,
      height: 1024,
    },
  };
}

export async function loadBranding(db: Firestore): Promise<SystemConfig> {
  const stored = await db.collection('system_settings').doc('branding').get();
  return stored.exists ? stored.data() as SystemConfig : getDefaultSystemConfig();
}

function invalid(message: string): never {
  throw Object.assign(new Error(message), { status: 400, code: 'INVALID_BRANDING' });
}

function image(value: unknown, allowed: readonly { path: string }[]) {
  if (typeof value !== 'string' || !allowed.some(asset => asset.path === value)) {
    return invalid('Selecione uma imagem do catálogo institucional da homologação.');
  }
  return value;
}

function bounded(value: unknown, minimum: number, maximum: number, fallback: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    return invalid('Confira os valores de enquadramento e intervalo do carrossel.');
  }
  return value;
}

function dimensions(value: { width?: unknown; height?: unknown }) {
  const result: { width?: number; height?: number } = {};
  for (const key of ['width', 'height'] as const) {
    if (value[key] !== undefined) result[key] = bounded(value[key], 1, 12000, 1);
  }
  return result;
}

function positioned(asset: any) {
  return {
    imageUrl: image(asset?.imageUrl, brandingImages),
    focusX: bounded(asset.focusX, 0, 100, 50),
    focusY: bounded(asset.focusY, 0, 100, 50),
    ...dimensions(asset),
  };
}

type BrandingBackup = {
  format: 'rodovar-homologation-branding';
  schemaVersion: 1;
  config: SystemConfig;
};

type Actor = { id: string; accessLevel: string };
function actorOf(req: unknown): Actor {
  return (req as { sessionUser: Actor }).sessionUser;
}

function requireAdmin() {
  return Object.assign(new Error('Operação exclusiva do administrador principal.'), { status: 403 });
}

async function requireProtectedAdmin(tx: Transaction, db: Firestore, actor: Actor) {
  const [security, user] = await tx.getAll(
    db.collection('system_settings').doc('security'), db.collection('users').doc(actor.id),
  );
  const account = user.data();
  if (security.data()?.protectedAdminUid !== actor.id || !account?.active ||
      account.approvalStatus !== 'APROVADO' || account.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
}

function validateDraft({ sidebarPoster, topHeader, defaultAvatar, welcomeBanner }: Record<string, any>) {
  const items = welcomeBanner?.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 5) invalid('O carrossel deve conter de 1 a 5 imagens.');
  const ids = new Set<string>();
  return {
    sidebarPoster: positioned(sidebarPoster),
    topHeader: positioned(topHeader),
    defaultAvatar: { imageUrl: image(defaultAvatar?.imageUrl, brandingAvatars), ...dimensions(defaultAvatar) },
    welcomeBanner: {
      carouselEnabled: welcomeBanner.carouselEnabled === true && items.length > 1,
      intervalSeconds: Math.round(bounded(welcomeBanner.intervalSeconds, 3, 15, 5)),
      items: items.map(item => {
        if (typeof item?.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(item.id) || ids.has(item.id)) {
          return invalid('As imagens do carrossel precisam de identificadores únicos.');
        }
        ids.add(item.id);
        const altText = typeof item.altText === 'string' ? item.altText.trim().slice(0, 200) : '';
        if (item.isDecorative !== true && !altText) invalid('Informe a descrição das imagens não decorativas.');
        return { id: item.id, ...positioned(item), altText, isDecorative: item.isDecorative === true };
      }),
    },
  };
}

function readBackup(input: unknown): BrandingBackup {
  const backup = input as Partial<BrandingBackup> | null;
  if (backup?.format !== 'rodovar-homologation-branding' || backup.schemaVersion !== 1 ||
      !backup.config || !Number.isSafeInteger(backup.config.revision) || backup.config.revision < 1) {
    return invalid('Selecione um backup de identidade visual exportado pela homologação.');
  }
  validateDraft({ ...backup.config });
  return backup as BrandingBackup;
}

export function registerCloudBrandingWrites(app: Express, guard: RequestHandler, db: Firestore) {
  app.post('/api/cloud/system-config/publish', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') {
        res.status(403).json({ error: 'Publicação exclusiva do administrador principal.' });
        return;
      }
      const { baseRevision, sidebarPoster, topHeader, defaultAvatar, welcomeBanner } = req.body || {};
      if (!Number.isSafeInteger(baseRevision) || baseRevision < 1) invalid('Atualize a revisão antes de publicar.');
      const draft = validateDraft({ sidebarPoster, topHeader, defaultAvatar, welcomeBanner });
      const ref = db.collection('system_settings').doc('branding');
      const result = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const stored = await tx.get(ref);
        const current = stored.exists ? stored.data() as SystemConfig : getDefaultSystemConfig();
        if (current.revision !== baseRevision) return { published: false as const, current };
        const config: SystemConfig = {
          ...draft, revision: baseRevision + 1, updatedAtIso: new Date().toISOString(),
          updatedBy: 'Administração RODOVAR',
        };
        const archive = db.collection('branding_revisions');
        const previousRef = archive.doc(String(current.revision));
        const previous = await tx.get(previousRef);
        if (!previous.exists) tx.create(previousRef, current);
        tx.create(archive.doc(String(config.revision)), config);
        tx.set(ref, config);
        tx.create(db.collection('audit_logs').doc(), {
          actorId: actor.id, action: 'SYSTEM_CONFIG_PUBLISHED', atIso: config.updatedAtIso, revision: config.revision,
        });
        return { published: true as const, config };
      });
      if (!result.published) {
        res.status(409).json({
          error: 'Outra revisão já foi publicada. Carregue a configuração atual antes de publicar novamente.',
          code: 'REVISION_CONFLICT', currentRevision: result.current.revision, systemConfig: result.current,
        });
        return;
      }
      res.json({ ok: true, systemConfig: result.config });
    } catch (error) { next(error); }
  });

  app.post('/api/cloud/admin/backups/branding/export', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
      const config = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const stored = await tx.get(db.collection('system_settings').doc('branding'));
        const current = stored.exists ? stored.data() as SystemConfig : getDefaultSystemConfig();
        const ref = db.collection('branding_revisions').doc(String(current.revision));
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) tx.create(ref, current);
        tx.create(db.collection('audit_logs').doc(), {
          actorId: actor.id, action: 'BRANDING_BACKUP_EXPORTED', revision: current.revision, atIso: new Date().toISOString(),
        });
        return snapshot.exists ? snapshot.data() as SystemConfig : current;
      });
      const backup: BrandingBackup = { format: 'rodovar-homologation-branding', schemaVersion: 1, config };
      res.json(backup);
    } catch (error) { next(error); }
  });

  app.post('/api/cloud/admin/backups/branding/:operation(validate|restore)', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
      const backup = readBackup(req.body?.backup);
      const restore = req.params.operation === 'restore';
      const ref = db.collection('system_settings').doc('branding');
      const revisions = db.collection('branding_revisions');
      const result = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const [stored, original] = await tx.getAll(ref, revisions.doc(String(backup.config.revision)));
        if (!original.exists || !isDeepStrictEqual(original.data(), backup.config)) {
          return invalid('O arquivo não corresponde a uma revisão arquivada nesta homologação.');
        }
        const current = stored.exists ? stored.data() as SystemConfig : getDefaultSystemConfig();
        if (!restore) return { ok: true, currentRevision: current.revision, config: backup.config };
        if (req.body.confirm !== true) return invalid('Confirme a restauração após revisar o arquivo.');
        if (req.body.baseRevision !== current.revision) {
          throw Object.assign(new Error('A revisão ativa mudou. Valide o arquivo novamente.'), { status: 409, code: 'REVISION_CONFLICT' });
        }
        if (backup.config.revision === current.revision) {
          return invalid('A configuração do backup já é a revisão ativa.');
        }
        const currentRef = revisions.doc(String(current.revision));
        const archived = await tx.get(currentRef);
        const config: SystemConfig = {
          ...validateDraft({ ...backup.config }), revision: current.revision + 1,
          updatedBy: 'Administração RODOVAR', updatedAtIso: new Date().toISOString(),
        };
        if (!archived.exists) tx.create(currentRef, current);
        tx.create(revisions.doc(String(config.revision)), config);
        tx.set(ref, config);
        tx.create(db.collection('audit_logs').doc(), {
          actorId: actor.id, action: 'BRANDING_BACKUP_RESTORED', atIso: config.updatedAtIso,
          sourceRevision: backup.config.revision, revision: config.revision,
        });
        return { ok: true, currentRevision: config.revision, config };
      });
      res.json(result);
    } catch (error) { next(error); }
  });
}
