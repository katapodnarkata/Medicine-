import express, { type NextFunction, type Request, type Response } from 'express';
import { AppError, type Service, type UserDto } from './service.js';

interface AuthedRequest extends Request {
  user: UserDto;
  token: string;
}

function idParam(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Некорректный идентификатор');
  return id;
}

export function createApp(service: Service) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.post('/api/register', (req, res) => {
    res.status(201).json(service.register(req.body ?? {}));
  });

  // Все остальные методы требуют токен, выданный при регистрации.
  app.use('/api', (req, _res, next) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const user = token ? service.authenticate(token) : null;
    if (!user) throw new AppError(401, 'Требуется регистрация');
    (req as AuthedRequest).user = user;
    (req as AuthedRequest).token = token;
    next();
  });

  const user = (req: Request) => (req as AuthedRequest).user;

  // Профиль
  app.get('/api/me', (req, res) => {
    res.json(user(req));
  });
  app.patch('/api/me', (req, res) => {
    res.json(service.updateMe(user(req).id, req.body ?? {}));
  });
  app.delete('/api/me', (req, res) => {
    service.deleteMe(user(req).id);
    res.status(204).end();
  });
  app.put('/api/me/push-token', (req, res) => {
    service.setPushToken(user(req).id, req.body?.token ?? null);
    res.status(204).end();
  });
  app.post('/api/logout', (req, res) => {
    service.logout((req as AuthedRequest).token, user(req).id);
    res.status(204).end();
  });

  // Команды
  app.get('/api/teams', (_req, res) => {
    res.json(service.listTeams());
  });
  app.post('/api/teams', (req, res) => {
    res.status(201).json(service.createTeam(user(req), req.body?.name));
  });
  app.get('/api/teams/:id/members', (req, res) => {
    res.json(service.teamMembers(idParam(req.params.id)));
  });

  // Управление участниками (диспетчер)
  app.get('/api/participants', (req, res) => {
    res.json(service.listParticipants(user(req)));
  });
  app.put('/api/users/:id/team', (req, res) => {
    res.json(service.setUserTeam(user(req), idParam(req.params.id), req.body?.teamId ?? null));
  });
  app.delete('/api/users/:id', (req, res) => {
    service.deleteUser(user(req), idParam(req.params.id));
    res.status(204).end();
  });

  // Вызовы
  app.post('/api/calls', (req, res) => {
    const call = service.createCall(user(req), req.body ?? {});
    res.status(201).json(call);
    service.sendPushes(call.id).catch((err) => console.error('[push]', err));
  });
  app.get('/api/calls/active', (req, res) => {
    res.json(service.activeCalls(user(req)));
  });
  app.get('/api/calls/history', (req, res) => {
    res.json(service.history(user(req)));
  });
  app.get('/api/calls/:id', (req, res) => {
    res.json(service.getCall(user(req), idParam(req.params.id)));
  });
  app.post('/api/calls/:id/ack', (req, res) => {
    res.json(service.acknowledge(user(req), idParam(req.params.id)));
  });

  app.use((_req, _res) => {
    throw new AppError(404, 'Не найдено');
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof SyntaxError) {
      res.status(400).json({ error: 'Некорректный JSON' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
